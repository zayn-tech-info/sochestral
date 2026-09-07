import {
  claimDueBrandBriefCompile,
  fallbackBrandBriefText,
  getBrandDesignBrief,
  listBrandAssets,
  markBrandBriefFailed,
  markBrandBriefReady,
  pickBrandCompilePack,
  type Database,
} from "@sochestral/database";
import {
  loadOrchestrationConfig,
  TheseanOpenAIModelProvider,
  type ModelProvider,
} from "@sochestral/orchestration";
import type { MediaService } from "./media-storage.js";

const COMPILE_SYSTEM =
  "You write a compact brand design system from the attached logo and style samples. Cover layout habits, logo placement, color roles, type feel, motifs, and do or do not rules. Write plain sentences. No markdown headings. Stay under 3500 characters. Do not invent a company name.";

export async function compileDueBrandBrief(
  db: Database["db"],
  media: MediaService,
  input: {
    debounceMs: number;
    compileCap: number;
    vision?: ModelProvider | null;
    visionModel?: string;
    visionEnabled?: boolean;
  },
): Promise<"compiled" | "failed" | "skipped"> {
  const due = await claimDueBrandBriefCompile(db, input.debounceMs);
  if (!due) return "skipped";
  const assets = await listBrandAssets(db, { userId: due.userId });
  const current = await getBrandDesignBrief(db, due.userId);
  if (current && current.sourceHash !== due.sourceHash) {
    return "skipped";
  }

  const colorsAndNotes = fallbackBrandBriefText(assets);
  const pack = pickBrandCompilePack(assets, input.compileCap);
  const visionOn = input.visionEnabled !== false;

  if (pack.length === 0 || !visionOn || !input.vision) {
    await markBrandBriefReady(db, {
      userId: due.userId,
      sourceHash: due.sourceHash,
      briefText: colorsAndNotes,
    });
    return "compiled";
  }

  try {
    const blocks: Array<
      | { type: "text"; text: string }
      | {
          type: "image";
          source: {
            type: "base64";
            mediaType: "image/jpeg" | "image/png" | "image/webp";
            data: string;
          };
        }
    > = [{ type: "text", text: `${colorsAndNotes}\n\nDescribe the visual design system from these images.` }];
    for (const item of pack) {
      if (!item.mediaAssetId) continue;
      const image = await media.modelImage(due.userId, item.mediaAssetId);
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          mediaType: image.mediaType,
          data: image.data,
        },
      });
    }
    const completion = await input.vision.complete({
      system: COMPILE_SYSTEM,
      messages: [{ role: "user", content: blocks }],
      tools: [],
      model: input.visionModel || "ship-like/gpt-5.6-luna",
      maxTokens: 800,
      thinking: { enabled: false, budgetTokens: 0 },
    });
    const text = completion.content?.trim() || colorsAndNotes;
    await markBrandBriefReady(db, {
      userId: due.userId,
      sourceHash: due.sourceHash,
      briefText: text,
    });
    return "compiled";
  } catch (error) {
    console.error("[sochestral:brand-brief] compile failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    await markBrandBriefFailed(db, {
      userId: due.userId,
      sourceHash: due.sourceHash,
      errorCode: "COMPILE_FAILED",
    });
    return "failed";
  }
}

export function createBrandBriefVision(): ModelProvider | null {
  try {
    const config = loadOrchestrationConfig();
    if (!config.theseanVisionEnabled) return null;
    return new TheseanOpenAIModelProvider(
      config.theseanApiKey,
      config.theseanTimeoutMs,
    );
  } catch {
    return null;
  }
}

export function brandBriefVisionModel(): string {
  try {
    return loadOrchestrationConfig().theseanVisionModel;
  } catch {
    return "ship-like/gpt-5.6-luna";
  }
}
