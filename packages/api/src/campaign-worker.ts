import type { Database } from "@sochestral/database";
import {
  loadOrchestrationConfig,
  processOneCampaignTick,
  StreamableHttpSocialMcpGateway,
  TheseanModelProvider,
  TheseanOpenAIModelProvider,
} from "@sochestral/orchestration";
import { loadCampaignRuntimeConfig } from "./campaign-config.js";
import {
  compileDueVoiceBible,
  createVoiceCompiler,
  voiceCompilerModel,
} from "./voice-compile.js";

export function startCampaignWorker(db: Database["db"]): () => void {
  const runtime = loadCampaignRuntimeConfig();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const voice = createVoiceCompiler();
  const voiceModel = voiceCompilerModel();
  let writer: TheseanModelProvider | null = null;
  let grader: TheseanOpenAIModelProvider | null = null;
  let mcp: StreamableHttpSocialMcpGateway | null = null;
  try {
    const config = loadOrchestrationConfig();
    writer = new TheseanModelProvider(
      config.theseanApiKey,
      config.theseanTimeoutMs,
    );
    grader = new TheseanOpenAIModelProvider(
      config.theseanApiKey,
      config.theseanTimeoutMs,
    );
    mcp = new StreamableHttpSocialMcpGateway(
      config.socialMcpUrl,
      config.externalTimeoutMs,
    );
  } catch {
    writer = null;
    grader = null;
    mcp = null;
  }

  const tick = async () => {
    if (stopped) return;
    try {
      await compileDueVoiceBible(db, {
        debounceMs: runtime.voiceDebounceMs,
        voice,
        voiceModel,
      });
      if (writer && grader && mcp) {
        try {
          const config = loadOrchestrationConfig();
          await processOneCampaignTick(db, {
            config,
            writer,
            grader,
            mcp,
            campaignCap: runtime.queueCap,
            leaseMs: runtime.leaseMs,
          });
        } catch (error) {
          console.error("[sochestral:campaign-worker] campaign tick skipped", {
            error: error instanceof Error ? error.message : "unknown",
          });
        }
      }
    } catch (error) {
      console.error("[sochestral:campaign-worker] tick failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, runtime.workerPollMs);
      }
    }
  };

  timer = setTimeout(tick, runtime.workerPollMs);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
