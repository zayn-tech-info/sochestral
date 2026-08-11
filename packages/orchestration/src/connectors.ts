import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mintMcpJwt } from "@sochestral/auth";

export const CONNECTOR_PLATFORMS = [
  "threads",
  "linkedin_personal",
  "instagram",
] as const;

export type ConnectorPlatform = (typeof CONNECTOR_PLATFORMS)[number];
export type ConnectorState =
  | "not_connected"
  | "connected"
  | "reconnect_required";

export type PublicConnectorAccount = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  state: Exclude<ConnectorState, "not_connected">;
  connectedAt?: string | null;
};

export type ConnectorSummary = {
  platform: ConnectorPlatform;
  state: ConnectorState;
  accounts: PublicConnectorAccount[];
};

export type ConnectStart = {
  platform: ConnectorPlatform;
  authorizeUrl: string;
  expiresAt: string;
};

export class ConnectorError extends Error {
  constructor(
    readonly code:
      | "INVALID_PLATFORM"
      | "INVALID_CONNECTOR_RESPONSE"
      | "SOCIALMCP_UNAVAILABLE",
    readonly status: 422 | 502,
  ) {
    super(code);
    this.name = "ConnectorError";
  }
}

export interface ConnectorGateway {
  callTool(input: {
    userId: string;
    name: "connect_account" | "list_connected_accounts";
    arguments: Record<string, unknown>;
  }): Promise<unknown>;
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
        throw new ConnectorError("INVALID_CONNECTOR_RESPONSE", 502);
      }
    }
  }

  throw new ConnectorError("INVALID_CONNECTOR_RESPONSE", 502);
}

export class StreamableHttpConnectorGateway implements ConnectorGateway {
  constructor(
    private readonly url: string,
    private readonly timeoutMs: number,
  ) {}

  async callTool(input: {
    userId: string;
    name: "connect_account" | "list_connected_accounts";
    arguments: Record<string, unknown>;
  }): Promise<unknown> {
    const { token } = await mintMcpJwt(input.userId);
    const client = new Client({
      name: "sochestral-connectors",
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
      const result = await client.callTool({
        name: input.name,
        arguments: input.arguments,
      });
      return parseToolResult(result);
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw new ConnectorError("SOCIALMCP_UNAVAILABLE", 502);
    } finally {
      await client.close().catch(() => undefined);
    }
  }
}

export interface ConnectorService {
  list(userId: string): Promise<{ connectors: ConnectorSummary[] }>;
  startConnect(
    userId: string,
    platformValue: string,
  ): Promise<ConnectStart>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function avatarUrlFromAccount(
  account: Record<string, unknown>,
): string | null {
  const directKeys = [
    "avatarUrl",
    "avatarHint",
    "profilePictureUrl",
    "profile_picture_url",
  ] as const;
  for (const key of directKeys) {
    const value = nullableString(account[key]);
    if (value && isHttpsUrl(value)) return value;
  }

  const metadataRaw = account.metadataJson;
  if (typeof metadataRaw === "string" && metadataRaw.trim()) {
    try {
      const metadata = asRecord(JSON.parse(metadataRaw));
      const nested = nullableString(metadata?.avatarUrl);
      if (nested && isHttpsUrl(nested)) return nested;
    } catch {
      // ignore malformed metadata
    }
  }

  return null;
}

function isPlatform(value: string): value is ConnectorPlatform {
  return CONNECTOR_PLATFORMS.some((platform) => platform === value);
}

const authorizeHosts: Record<ConnectorPlatform, string> = {
  threads: "threads.net",
  linkedin_personal: "www.linkedin.com",
  instagram: "www.facebook.com",
};

export class DefaultConnectorService implements ConnectorService {
  constructor(private readonly gateway: ConnectorGateway) {}

  async list(userId: string): Promise<{ connectors: ConnectorSummary[] }> {
    const result = asRecord(
      await this.gateway.callTool({
        userId,
        name: "list_connected_accounts",
        arguments: {},
      }),
    );
    if (!result || !Array.isArray(result.accounts)) {
      throw new ConnectorError("INVALID_CONNECTOR_RESPONSE", 502);
    }

    const byPlatform = new Map<
      ConnectorPlatform,
      PublicConnectorAccount[]
    >();
    for (const platform of CONNECTOR_PLATFORMS) byPlatform.set(platform, []);

    for (const rawAccount of result.accounts) {
      const account = asRecord(rawAccount);
      const platform = account?.platform;
      if (
        !account ||
        typeof platform !== "string" ||
        !isPlatform(platform) ||
        typeof account.id !== "string"
      ) {
        continue;
      }

      const state =
        account.status === "active" ? "connected" : "reconnect_required";
      const connectedAt =
        typeof account.connectedAt === "string" &&
        !Number.isNaN(Date.parse(account.connectedAt))
          ? account.connectedAt
          : undefined;
      byPlatform.get(platform)?.push({
        id: account.id,
        username: nullableString(account.platformUsername),
        displayName: nullableString(account.displayName),
        avatarUrl: avatarUrlFromAccount(account),
        state,
        ...(connectedAt ? { connectedAt } : {}),
      });
    }

    return {
      connectors: CONNECTOR_PLATFORMS.map((platform) => {
        const accounts = byPlatform.get(platform) ?? [];
        const state: ConnectorState =
          accounts.length === 0
            ? "not_connected"
            : accounts.some((account) => account.state === "connected")
              ? "connected"
              : "reconnect_required";
        return { platform, state, accounts };
      }),
    };
  }

  async startConnect(
    userId: string,
    platformValue: string,
  ): Promise<ConnectStart> {
    if (!isPlatform(platformValue)) {
      throw new ConnectorError("INVALID_PLATFORM", 422);
    }

    const result = asRecord(
      await this.gateway.callTool({
        userId,
        name: "connect_account",
        arguments: { platform: platformValue },
      }),
    );
    const authorizeUrl =
      typeof result?.authorizeUrl === "string" ? result.authorizeUrl : "";
    const expiresAt =
      typeof result?.expiresAt === "string" ? result.expiresAt : "";

    let parsed: URL;
    try {
      parsed = new URL(authorizeUrl);
    } catch {
      throw new ConnectorError("INVALID_CONNECTOR_RESPONSE", 502);
    }

    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== authorizeHosts[platformValue] ||
      !expiresAt ||
      Number.isNaN(Date.parse(expiresAt))
    ) {
      throw new ConnectorError("INVALID_CONNECTOR_RESPONSE", 502);
    }

    return {
      platform: platformValue,
      authorizeUrl: parsed.toString(),
      expiresAt,
    };
  }
}

export function createConnectorService(): ConnectorService {
  const url = process.env.SOCIALMCP_MCP_URL?.trim();
  if (!url) throw new ConnectorError("SOCIALMCP_UNAVAILABLE", 502);
  const timeout = Number(
    process.env.ORCHESTRATION_EXTERNAL_TIMEOUT_MS ?? "15000",
  );
  return new DefaultConnectorService(
    new StreamableHttpConnectorGateway(
      url,
      Number.isInteger(timeout) && timeout > 0 ? timeout : 15000,
    ),
  );
}
