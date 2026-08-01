import { OrchestrationError } from "./errors.js";
import type { SocialMcpGateway } from "./mcp.js";
import {
  ALLOWED_TOOL_NAMES,
  MODEL_TOOLS,
  type AllowedToolName,
} from "./tools.js";

type JsonSchema = {
  properties?: Record<string, unknown>;
  required?: string[];
};

function localSchema(name: AllowedToolName): JsonSchema {
  const tool = MODEL_TOOLS.find((candidate) => candidate.name === name);
  return (tool?.inputSchema ?? {}) as JsonSchema;
}

function sortedKeys(value: Record<string, unknown> | undefined): string[] {
  return Object.keys(value ?? {}).sort();
}

function sortedValues(value: string[] | undefined): string[] {
  return [...(value ?? [])].sort();
}

function sameValues(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export async function assertSocialMcpContract(
  gateway: SocialMcpGateway,
  userId: string,
): Promise<void> {
  const remoteTools = await gateway.listTools(userId);

  for (const name of ALLOWED_TOOL_NAMES) {
    const remote = remoteTools.find((tool) => tool.name === name);
    const local = localSchema(name);
    const remoteSchema = remote?.inputSchema as JsonSchema | undefined;

    if (
      !remote ||
      !sameValues(
        sortedKeys(local.properties),
        sortedKeys(remoteSchema?.properties),
      ) ||
      !sameValues(
        sortedValues(local.required),
        sortedValues(remoteSchema?.required),
      )
    ) {
      throw new OrchestrationError(
        "INTERNAL_ERROR",
        500,
        `SocialMCP tool contract mismatch for ${name}.`,
      );
    }
  }
}
