import { describe, expect, it, vi } from "vitest";
import { assertSocialMcpContract } from "./contract.js";
import type { SocialMcpGateway } from "./mcp.js";
import { MODEL_TOOLS } from "./tools.js";

function gatewayWithTools(
  tools: Array<{ name: string; inputSchema: Record<string, unknown> }>,
): SocialMcpGateway {
  return {
    callTool: vi.fn(),
    listTools: vi.fn().mockResolvedValue(tools),
  };
}

const matchingTools = MODEL_TOOLS.map((tool) => ({
  name: tool.name,
  inputSchema: tool.inputSchema,
}));

describe("assertSocialMcpContract", () => {
  it("accepts matching names, fields, and required inputs (AC-11)", async () => {
    const gateway = gatewayWithTools([...matchingTools].reverse());

    await expect(
      assertSocialMcpContract(gateway, "user_contract"),
    ).resolves.toBeUndefined();
    expect(gateway.listTools).toHaveBeenCalledWith("user_contract");
  });

  it("rejects a missing remote tool (AC-3, AC-11)", async () => {
    const gateway = gatewayWithTools(
      matchingTools.filter((tool) => tool.name !== "publish_now"),
    );

    await expect(
      assertSocialMcpContract(gateway, "user_contract"),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      status: 500,
    });
  });

  it("rejects changed input fields (AC-3, AC-11)", async () => {
    const gateway = gatewayWithTools(
      matchingTools.map((tool) =>
        tool.name === "validate_post"
          ? {
              ...tool,
              inputSchema: {
                ...tool.inputSchema,
                properties: { unexpected: { type: "string" } },
              },
            }
          : tool,
      ),
    );

    await expect(
      assertSocialMcpContract(gateway, "user_contract"),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
