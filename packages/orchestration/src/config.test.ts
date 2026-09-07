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
      theseanIntentModel: "ship-like/gpt-5.6-luna",
      theseanVisionModel: "ship-like/gpt-5.6-luna",
      theseanSetupModel: "ship-like/claude-opus-5",
      theseanVoiceModel: "ship-like/claude-opus-5",
      theseanVisionEnabled: true,
      theseanThinkingEnabled: false,
      theseanThinkingBudgetTokens: 2048,
      theseanTimeoutMs: 90000,
      setupAgentEnabled: true,
      deepseekApiKey: null,
      deepseekBaseUrl: "https://api.deepseek.com",
      deepseekModel: "deepseek-v4-flash",
      socialMcpUrl: "https://social.example/mcp",
      contextTokenLimit: 12000,
      outputTokenLimit: 4096,
      maxToolSteps: 4,
      dailyRunLimit: 50,
      externalTimeoutMs: 15000,
    });
  });

  it("loads trimmed overrides (AC-8, AC-10)", () => {
    const config = loadOrchestrationConfig({
      ...required,
      THESEAN_MODEL: " custom-model ",
      THESEAN_VISION_MODEL: " ship-like/gpt-5.6-luna ",
      THESEAN_VISION_ENABLED: "false",
      ORCHESTRATION_CONTEXT_TOKEN_LIMIT: "7000",
      ORCHESTRATION_OUTPUT_TOKEN_LIMIT: "900",
      ORCHESTRATION_MAX_TOOL_STEPS: "3",
      ORCHESTRATION_DAILY_RUN_LIMIT: "12",
      ORCHESTRATION_EXTERNAL_TIMEOUT_MS: "2500",
    });

    expect(config).toMatchObject({
      theseanModel: "custom-model",
      theseanIntentModel: "ship-like/gpt-5.6-luna",
      theseanVisionModel: "ship-like/gpt-5.6-luna",
      theseanVoiceModel: "ship-like/claude-opus-5",
      theseanVisionEnabled: false,
      contextTokenLimit: 7000,
      outputTokenLimit: 900,
      maxToolSteps: 3,
      dailyRunLimit: 12,
      externalTimeoutMs: 2500,
    });
  });

  it("keeps vision enabled unless THESEAN_VISION_ENABLED is the string false", () => {
    expect(
      loadOrchestrationConfig({
        ...required,
      }).theseanVisionEnabled,
    ).toBe(true);
    expect(
      loadOrchestrationConfig({
        ...required,
        THESEAN_VISION_ENABLED: "true",
      }).theseanVisionEnabled,
    ).toBe(true);
    expect(
      loadOrchestrationConfig({
        ...required,
        THESEAN_VISION_ENABLED: "false",
      }).theseanVisionEnabled,
    ).toBe(false);
  });

  it("enables Thesean thinking only when the flag is the string true (SOC-8 AC-5)", () => {
    expect(
      loadOrchestrationConfig({
        ...required,
        THESEAN_THINKING_ENABLED: "true",
      }).theseanThinkingEnabled,
    ).toBe(true);
    expect(
      loadOrchestrationConfig({
        ...required,
        THESEAN_THINKING_ENABLED: "1",
      }).theseanThinkingEnabled,
    ).toBe(false);
    expect(
      loadOrchestrationConfig({
        ...required,
        THESEAN_THINKING_ENABLED: "TRUE",
      }).theseanThinkingEnabled,
    ).toBe(false);
  });

  it("loads a positive thinking budget override (SOC-8 AC-5)", () => {
    const config = loadOrchestrationConfig({
      ...required,
      THESEAN_THINKING_ENABLED: "true",
      THESEAN_THINKING_BUDGET_TOKENS: "4096",
    });

    expect(config.theseanThinkingEnabled).toBe(true);
    expect(config.theseanThinkingBudgetTokens).toBe(4096);
  });

  it("rejects a non positive thinking budget", () => {
    expect(() =>
      loadOrchestrationConfig({
        ...required,
        THESEAN_THINKING_BUDGET_TOKENS: "0",
      }),
    ).toThrow("THESEAN_THINKING_BUDGET_TOKENS must be a positive integer");
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

  it("loads a dedicated intent model override when provided", () => {
    const config = loadOrchestrationConfig({
      ...required,
      THESEAN_MODEL: "chat-model",
      THESEAN_INTENT_MODEL: "intent-model",
    });

    expect(config.theseanModel).toBe("chat-model");
    expect(config.theseanIntentModel).toBe("intent-model");
  });

  it("defaults clerk to Luna and does not fall back to the operator model (AC-13)", () => {
    const config = loadOrchestrationConfig({
      ...required,
      THESEAN_MODEL: "ship-like/claude-sonnet-5",
    });
    expect(config.theseanIntentModel).toBe("ship-like/gpt-5.6-luna");
    expect(config.theseanVoiceModel).toBe("ship-like/claude-opus-5");
  });

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
