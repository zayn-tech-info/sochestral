export type OrchestrationConfig = {
  theseanApiKey: string;
  theseanModel: string;
  theseanIntentModel: string;
  theseanVisionModel: string;
  theseanSetupModel: string;
  theseanVoiceModel: string;
  theseanVisionEnabled: boolean;
  theseanThinkingEnabled: boolean;
  theseanThinkingBudgetTokens: number;
  theseanTimeoutMs: number;
  setupAgentEnabled: boolean;
  deepseekApiKey: string | null;
  deepseekBaseUrl: string;
  deepseekModel: string;
  socialMcpUrl: string;
  contextTokenLimit: number;
  outputTokenLimit: number;
  maxToolSteps: number;
  dailyRunLimit: number;
  externalTimeoutMs: number;
};

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`${name} is required`);
  return trimmed;
}

/** Vision is on unless explicitly disabled with the string "false". */
export function isTheseanVisionEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.THESEAN_VISION_ENABLED !== "false";
}

/** Setup gate is on unless explicitly disabled with the string "false". */
export function isSetupAgentEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.SETUP_AGENT_ENABLED !== "false";
}

export function loadOrchestrationConfig(
  env: NodeJS.ProcessEnv = process.env,
): OrchestrationConfig {
  return {
    theseanApiKey: required(env.THESEAN_API_KEY, "THESEAN_API_KEY"),
    theseanModel:
      env.THESEAN_MODEL?.trim() || "ship-like/claude-sonnet-5",
    theseanIntentModel:
      env.THESEAN_INTENT_MODEL?.trim() || "ship-like/gpt-5.6-luna",
    theseanVisionModel:
      env.THESEAN_VISION_MODEL?.trim() || "ship-like/gpt-5.6-luna",
    theseanSetupModel:
      env.THESEAN_SETUP_MODEL?.trim() || "ship-like/claude-opus-5",
    theseanVoiceModel:
      env.THESEAN_VOICE_MODEL?.trim() || "ship-like/claude-opus-5",
    theseanVisionEnabled: isTheseanVisionEnabled(env),
    theseanThinkingEnabled: env.THESEAN_THINKING_ENABLED === "true",
    theseanThinkingBudgetTokens: positiveInteger(
      env.THESEAN_THINKING_BUDGET_TOKENS,
      2048,
      "THESEAN_THINKING_BUDGET_TOKENS",
    ),
    // Chat tool rounds often need longer than SocialMCP calls.
    theseanTimeoutMs: positiveInteger(
      env.THESEAN_TIMEOUT_MS,
      90_000,
      "THESEAN_TIMEOUT_MS",
    ),
    setupAgentEnabled: isSetupAgentEnabled(env),
    deepseekApiKey: env.DEEPSEEK_API_KEY?.trim() || null,
    deepseekBaseUrl:
      env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
    deepseekModel: env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
    socialMcpUrl: required(env.SOCIALMCP_MCP_URL, "SOCIALMCP_MCP_URL"),
    contextTokenLimit: positiveInteger(
      env.ORCHESTRATION_CONTEXT_TOKEN_LIMIT,
      12_000,
      "ORCHESTRATION_CONTEXT_TOKEN_LIMIT",
    ),
    outputTokenLimit: positiveInteger(
      env.ORCHESTRATION_OUTPUT_TOKEN_LIMIT,
      4096,
      "ORCHESTRATION_OUTPUT_TOKEN_LIMIT",
    ),
    maxToolSteps: positiveInteger(
      env.ORCHESTRATION_MAX_TOOL_STEPS,
      4,
      "ORCHESTRATION_MAX_TOOL_STEPS",
    ),
    dailyRunLimit: positiveInteger(
      env.ORCHESTRATION_DAILY_RUN_LIMIT,
      50,
      "ORCHESTRATION_DAILY_RUN_LIMIT",
    ),
    externalTimeoutMs: positiveInteger(
      env.ORCHESTRATION_EXTERNAL_TIMEOUT_MS,
      15000,
      "ORCHESTRATION_EXTERNAL_TIMEOUT_MS",
    ),
  };
}
