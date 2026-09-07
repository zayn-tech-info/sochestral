import type { ImageService } from "./image-service.js";
import { loadImageRuntimeConfig } from "./image-config.js";

export function startImageWorker(getService: () => ImageService): () => void {
  const config = loadImageRuntimeConfig();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      if (config.enabled) {
        await getService().processOneQueuedJob();
      }
      await getService().processOnePendingBrief();
    } catch (error) {
      console.error("[sochestral:image-worker] tick failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, config.workerPollMs);
      }
    }
  };

  timer = setTimeout(tick, config.workerPollMs);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
