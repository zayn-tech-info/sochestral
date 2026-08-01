import { describe, expect, it } from "vitest";
import { loadOrchestrationConfig } from "./config.js";

const required = {
  THESEAN_API_KEY: "thesean-secret",
  SOCIALMCP_MCP_URL: "https://social.example/mcp",
};

describe("loadOrchestrationConfig", () => {
  it("uses the contract defaults (AC-8, AC-10)", () => {
    const config = loadOrchestrationConfig(required);

    expect(config).toEqual({
      theseanApiKey: "thesean-secret",
      theseanModel: "ship-like/claude-sonnet-5",
      socialMcpUrl: "https://social.example/mcp",
      contextTokenLimit: 6000,
      outputTokenLimit: 1500,
      maxToolSteps: 4,
      dailyRunLimit: 50,
      externalTimeoutMs: 15000,
    });
  });

  it("loads trimmed overrides (AC-8, AC-10)", () => {
    const config = loadOrchestrationConfig({
      ...required,
      THESEAN_MODEL: " custom-model ",
      ORCHESTRATION_CONTEXT_TOKEN_LIMIT: "7000",
      ORCHESTRATION_OUTPUT_TOKEN_LIMIT: "900",
      ORCHESTRATION_MAX_TOOL_STEPS: "3",
      ORCHESTRATION_DAILY_RUN_LIMIT: "12",
      ORCHESTRATION_EXTERNAL_TIMEOUT_MS: "2500",
    });

    expect(config).toMatchObject({
      theseanModel: "custom-model",
      contextTokenLimit: 7000,
      outputTokenLimit: 900,
      maxToolSteps: 3,
      dailyRunLimit: 12,
      externalTimeoutMs: 2500,
    });
  });

  it.each(["0", "-1", "1.5", "abc"])(
    "rejects invalid positive integer value %s",
    (value) => {
      expect(() =>
        loadOrchestrationConfig({
          ...required,
          ORCHESTRATION_MAX_TOOL_STEPS: value,
        }),
      ).toThrow("ORCHESTRATION_MAX_TOOL_STEPS must be a positive integer");
    },
  );

  it("requires the Thesean key", () => {
    expect(() =>
      loadOrchestrationConfig({
        SOCIALMCP_MCP_URL: required.SOCIALMCP_MCP_URL,
      }),
    ).toThrow("THESEAN_API_KEY is required");
  });

  it("requires the SocialMCP URL", () => {
    expect(() =>
      loadOrchestrationConfig({ THESEAN_API_KEY: required.THESEAN_API_KEY }),
    ).toThrow("SOCIALMCP_MCP_URL is required");
  });
});
