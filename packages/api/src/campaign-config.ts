export type CampaignRuntimeConfig = {
  queueCap: number;
  workerPollMs: number;
  leaseMs: number;
  voiceDebounceMs: number;
};

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadCampaignRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): CampaignRuntimeConfig {
  const cap = positiveInt(env.CAMPAIGN_QUEUE_CAP, 30);
  return {
    queueCap: Math.min(30, cap),
    workerPollMs: positiveInt(env.CAMPAIGN_WORKER_POLL_MS, 2000),
    leaseMs: positiveInt(env.CAMPAIGN_LEASE_MS, 600_000),
    voiceDebounceMs: positiveInt(env.VOICE_BIBLE_DEBOUNCE_MS, 3000),
  };
}
