import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mintMcpJwt } from "@sochestral/auth";
import { isTransientError, OrchestrationError } from "./errors.js";
import type { AllowedToolName } from "./tools.js";

export type McpToolResult = {
  value: unknown;
  attempts: number;
};

export interface SocialMcpGateway {
  callTool(input: {
    userId: string;
    name: AllowedToolName;
    arguments: Record<string, unknown>;
  }): Promise<McpToolResult>;
  listTools(userId: string): Promise<
    Array<{ name: string; inputSchema: Record<string, unknown> }>
  >;
}

function parseToolResult(result: unknown): unknown {
  if (
    typeof result === "object" &&
    result !== null &&
    "content" in result &&
    Array.isArray(result.content)
  ) {
    const text = result.content.find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        item.type === "text" &&
        "text" in item &&
        typeof item.text === "string",
    ) as { text: string } | undefined;
    if (text) {
      try {
        return JSON.parse(text.text);
      } catch {
        return { message: text.text };
      }
    }
  }
  return result;
}

export class StreamableHttpSocialMcpGateway implements SocialMcpGateway {
  constructor(
    private readonly url: string,
    private readonly timeoutMs: number,
  ) {}

  private async withClient<T>(
    userId: string,
    operation: (client: Client) => Promise<T>,
  ): Promise<T> {
    const { token } = await mintMcpJwt(userId);
    const client = new Client({
      name: "sochestral",
      version: "0.0.1",
    });
    const transport = new StreamableHTTPClientTransport(new URL(this.url), {
      requestInit: {
        headers: { Authorization: `Bearer ${token}` },
      },
      fetch: (url, init) =>
        fetch(url, {
          ...init,
          signal: AbortSignal.timeout(this.timeoutMs),
        }),
    });
    try {
      await client.connect(transport);
      return await operation(client);
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  async callTool(input: {
    userId: string;
    name: AllowedToolName;
    arguments: Record<string, unknown>;
  }): Promise<McpToolResult> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const result = await this.withClient(input.userId, (client) =>
          client.callTool({
            name: input.name,
            arguments: input.arguments,
          }),
        );
        return { value: parseToolResult(result), attempts: attempt };
      } catch (error) {
        if (attempt === 2 || !isTransientError(error)) {
          throw new OrchestrationError(
            "SOCIALMCP_UNAVAILABLE",
            502,
            "SocialMCP is temporarily unavailable.",
          );
        }
      }
    }
    throw new OrchestrationError("SOCIALMCP_UNAVAILABLE", 502);
  }

  async listTools(
    userId: string,
  ): Promise<Array<{ name: string; inputSchema: Record<string, unknown> }>> {
    return this.withClient(userId, async (client) => {
      const result = await client.listTools();
      return result.tools.map((tool) => ({
        name: tool.name,
        inputSchema: tool.inputSchema as Record<string, unknown>,
      }));
    });
  }
}
