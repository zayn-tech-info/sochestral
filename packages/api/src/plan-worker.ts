import { recoverExpiredPlanRevisions, type Database } from "@sochestral/database";
import { loadOrchestrationConfig, processOnePlanRevision, TheseanModelProvider } from "@sochestral/orchestration";

export function startPlanWorker(db: Database["db"]): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    if (stopped) return;
    try {
      await recoverExpiredPlanRevisions(db);
      // Leave queued work intact when model configuration is unavailable.
      if (process.env.THESEAN_API_KEY?.trim()) {
        const config = loadOrchestrationConfig();
        await processOnePlanRevision(db, { provider: new TheseanModelProvider(config.theseanApiKey, config.theseanTimeoutMs),
          model: config.theseanModel, maxTokens: config.outputTokenLimit, leaseMs: Math.max(600_000, config.theseanTimeoutMs * 6) });
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
