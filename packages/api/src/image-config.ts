export type ImageRuntimeConfig = {
  enabled: boolean;
  apiKey: string | null;
  model: string;
  monthlyBudget: number;
  creditCentValue: number;
  referenceCap: number;
  workerPollMs: number;
  reclaimMs: number;
  costGenerate: number;
  costVary: number;
  costPromptEdit: number;
  briefDebounceMs: number;
  briefCompileCap: number;
};

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function loadImageRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ImageRuntimeConfig {
  const enabledRaw = env.IMAGE_GENERATION_ENABLED?.trim().toLowerCase();
  const enabled =
    enabledRaw === undefined || enabledRaw === ""
      ? true
      : enabledRaw === "1" || enabledRaw === "true" || enabledRaw === "yes";
  return {
    enabled,
    apiKey: env.OPENAI_API_KEY?.trim() || null,
    model: env.IMAGE_MODEL?.trim() || "gpt-image-2",
    monthlyBudget: positiveInt(env.IMAGE_MONTHLY_CREDIT_BUDGET, 50),
    creditCentValue: positiveInt(env.IMAGE_CREDIT_CENT_VALUE, 1),
    referenceCap: positiveInt(env.IMAGE_REFERENCE_CAP, 5),
    workerPollMs: positiveInt(env.IMAGE_WORKER_POLL_MS, 2000),
    reclaimMs: positiveInt(env.IMAGE_JOB_RECLAIM_MS, 600_000),
    costGenerate: nonNegInt(env.IMAGE_CREDIT_COST_GENERATE, 2),
    costVary: nonNegInt(env.IMAGE_CREDIT_COST_VARY, 2),
    costPromptEdit: nonNegInt(env.IMAGE_CREDIT_COST_PROMPT_EDIT, 2),
    briefDebounceMs: positiveInt(env.BRAND_BRIEF_DEBOUNCE_MS, 3000),
    briefCompileCap: positiveInt(env.BRAND_BRIEF_COMPILE_CAP, 8),
  };
}

export function creditCostForKind(
  config: ImageRuntimeConfig,
  kind: "generate" | "reframe" | "vary" | "prompt_edit",
): number {
  if (kind === "reframe") return 0;
  if (kind === "vary") return config.costVary;
  if (kind === "prompt_edit") return config.costPromptEdit;
  return config.costGenerate;
}

export function parseVariantCount(
  kind: "generate" | "reframe" | "vary" | "prompt_edit",
  raw: unknown,
): number {
  if (kind !== "generate") return 1;
  if (raw === undefined || raw === null || raw === "") return 1;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 3) {
    throw new Error("VARIANT_COUNT");
  }
  return value;
}
