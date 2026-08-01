import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mintMcpJwt: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
  callTool: vi.fn(),
  listTools: vi.fn(),
  transports: [] as Array<{
    url: URL;
    options: {
      requestInit?: { headers?: Record<string, string> };
      fetch?: typeof fetch;
    };
  }>,
}));

vi.mock("@sochestral/auth", () => ({
  mintMcpJwt: mocks.mintMcpJwt,
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    connect = mocks.connect;
    close = mocks.close;
    callTool = mocks.callTool;
    listTools = mocks.listTools;
  },
}));

vi.mock(
  "@modelcontextprotocol/sdk/client/streamableHttp.js",
  () => ({
    StreamableHTTPClientTransport: class {
      constructor(
        url: URL,
        options: {
          requestInit?: { headers?: Record<string, string> };
          fetch?: typeof fetch;
        },
      ) {
        mocks.transports.push({ url, options });
      }
    },
  }),
);

import { StreamableHttpSocialMcpGateway } from "./mcp.js";

describe("StreamableHttpSocialMcpGateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transports.length = 0;
    mocks.mintMcpJwt.mockResolvedValue({
      token: "tenant-token",
      expiresAt: new Date(),
    });
    mocks.connect.mockResolvedValue(undefined);
    mocks.close.mockResolvedValue(undefined);
  });

  it("mints a tenant JWT and parses JSON tool text (AC-4, AC-11)", async () => {
    mocks.callTool.mockResolvedValue({
      content: [{ type: "text", text: '{"ok":true,"dryRun":true}' }],
    });
    const gateway = new StreamableHttpSocialMcpGateway(
      "https://social.example/mcp",
      2500,
    );

    const result = await gateway.callTool({
      userId: "user_tenant",
      name: "publish_now",
      arguments: { platforms: ["threads"], dryRun: true },
    });

    expect(mocks.mintMcpJwt).toHaveBeenCalledWith("user_tenant");
    expect(mocks.transports[0]?.url.toString()).toBe(
      "https://social.example/mcp",
    );
    expect(mocks.transports[0]?.options.requestInit?.headers).toEqual({
      Authorization: "Bearer tenant-token",
    });
    expect(result).toEqual({
      value: { ok: true, dryRun: true },
      attempts: 1,
    });
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it("retries a transient connection once with a fresh JWT (AC-4, AC-7)", async () => {
    mocks.connect
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce(undefined);
    mocks.callTool.mockResolvedValue({
      content: [{ type: "text", text: "plain result" }],
    });
    const gateway = new StreamableHttpSocialMcpGateway(
      "https://social.example/mcp",
      2500,
    );

    const result = await gateway.callTool({
      userId: "user_tenant",
      name: "validate_post",
      arguments: { platforms: ["threads"] },
    });

    expect(result).toEqual({
      value: { message: "plain result" },
      attempts: 2,
    });
    expect(mocks.connect).toHaveBeenCalledTimes(2);
    expect(mocks.mintMcpJwt).toHaveBeenCalledTimes(2);
  });

  it("does not retry authentication failures (AC-7)", async () => {
    mocks.connect.mockRejectedValue({ status: 401 });
    const gateway = new StreamableHttpSocialMcpGateway(
      "https://social.example/mcp",
      2500,
    );

    await expect(
      gateway.callTool({
        userId: "user_tenant",
        name: "list_connected_accounts",
        arguments: {},
      }),
    ).rejects.toMatchObject({
      code: "SOCIALMCP_UNAVAILABLE",
      status: 502,
    });
    expect(mocks.connect).toHaveBeenCalledTimes(1);
  });

  it("returns the remote tool contract for the same tenant (AC-11)", async () => {
    mocks.listTools.mockResolvedValue({
      tools: [
        {
          name: "list_connected_accounts",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    });
    const gateway = new StreamableHttpSocialMcpGateway(
      "https://social.example/mcp",
      2500,
    );

    await expect(gateway.listTools("user_tenant")).resolves.toEqual([
      {
        name: "list_connected_accounts",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    expect(mocks.mintMcpJwt).toHaveBeenCalledWith("user_tenant");
  });
});
