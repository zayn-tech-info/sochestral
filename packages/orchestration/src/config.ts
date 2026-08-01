export type OrchestrationConfig = {
  theseanApiKey: string;
  theseanModel: string;
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

export function loadOrchestrationConfig(
  env: NodeJS.ProcessEnv = process.env,
): OrchestrationConfig {
  return {
    theseanApiKey: required(env.THESEAN_API_KEY, "THESEAN_API_KEY"),
    theseanModel:
      env.THESEAN_MODEL?.trim() || "ship-like/claude-sonnet-5",
    socialMcpUrl: required(env.SOCIALMCP_MCP_URL, "SOCIALMCP_MCP_URL"),
    contextTokenLimit: positiveInteger(
      env.ORCHESTRATION_CONTEXT_TOKEN_LIMIT,
      6000,
      "ORCHESTRATION_CONTEXT_TOKEN_LIMIT",
    ),
    outputTokenLimit: positiveInteger(
      env.ORCHESTRATION_OUTPUT_TOKEN_LIMIT,
      1500,
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
