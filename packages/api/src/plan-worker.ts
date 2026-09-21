import { recoverExpiredContentJobs, recoverExpiredPlanRevisions, type Database } from "@sochestral/database";
import { loadOrchestrationConfig, processOneContentJob, processOnePlanRevision, TheseanModelProvider } from "@sochestral/orchestration";

export function startPlanWorker(db: Database["db"]): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    if (stopped) return;
    try {
      await recoverExpiredPlanRevisions(db);
      await recoverExpiredContentJobs(db);
      // Leave queued work intact when model configuration is unavailable.
      if (process.env.THESEAN_API_KEY?.trim()) {
        const config = loadOrchestrationConfig();
        const provider = new TheseanModelProvider(config.theseanApiKey, config.theseanTimeoutMs);
        const shared = { provider, model: config.theseanModel, maxTokens: config.outputTokenLimit, leaseMs: Math.max(600_000, config.theseanTimeoutMs * 6) };
        await processOnePlanRevision(db, shared);
        await processOneContentJob(db, shared);
      }
    } catch {
      console.error("[sochestral:plan-worker] tick failed");
    } finally {
      if (!stopped) timer = setTimeout(tick, 3000);
    }
  };
  timer = setTimeout(tick, 3000);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
