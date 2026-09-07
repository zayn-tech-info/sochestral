import {
  claimDueVoiceBibleCompile,
  getBrandDesignBrief,
  getVoiceBible,
  listActiveProfileEntries,
  listBrandAssets,
  markVoiceBibleCurrent,
  markVoiceBibleFailed,
  type Database,
} from "@sochestral/database";
import {
  loadOrchestrationConfig,
  TheseanModelProvider,
  type ModelProvider,
} from "@sochestral/orchestration";

const VOICE_SYSTEM =
  "You write a short voice bible for social captions. Cover how they talk, words they never use, and four example lines. Plain sentences. No markdown headings. Stay under 4000 characters. Do not invent a company name.";

export async function compileDueVoiceBible(
  db: Database["db"],
  input: { debounceMs: number; voice?: ModelProvider | null; voiceModel?: string },
): Promise<"compiled" | "failed" | "skipped"> {
  const due = await claimDueVoiceBibleCompile(db, input.debounceMs);
  if (!due) return "skipped";
  const current = await getVoiceBible(db, due.userId);
  if (current && current.sourceHash !== due.compileHash) {
    return "skipped";
  }
  if (!input.voice) {
    await markVoiceBibleFailed(db, {
      userId: due.userId,
      compileHash: due.compileHash ?? due.sourceHash,
    });
    return "failed";
  }

  const entries = await listActiveProfileEntries(db, due.userId);
  const assets = await listBrandAssets(db, { userId: due.userId });
  const visual = await getBrandDesignBrief(db, due.userId);
  const profileLines = entries
    .filter((entry) =>
      ["tone", "audience", "do_not", "brand_fact"].includes(entry.category),
    )
    .map((entry) => `${entry.category}: ${entry.body}`)
    .join("\n");
  const kitLines = assets
    .map((asset) =>
      [asset.kind, asset.colorValue, asset.noteText]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");
  const extra = visual?.briefText?.trim()
    ? `\nVisual brief (context only):\n${visual.briefText.trim()}`
    : "";

  const run = async () => {
    const completion = await input.voice!.complete({
      system: VOICE_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${profileLines}\n${kitLines}${extra}`,
            },
          ],
        },
      ],
      tools: [],
      model: input.voiceModel || "ship-like/claude-opus-5",
      maxTokens: 900,
      thinking: { enabled: false, budgetTokens: 0 },
    });
    return (completion.content ?? "").trim().slice(0, 4000);
  };

  try {
    let text = "";
    try {
      text = await run();
    } catch {
      text = await run();
    }
    if (!text) {
      await markVoiceBibleFailed(db, {
        userId: due.userId,
        compileHash: due.compileHash ?? due.sourceHash,
      });
      return "failed";
    }
    await markVoiceBibleCurrent(db, {
      userId: due.userId,
      compileHash: due.compileHash ?? due.sourceHash,
      briefText: text,
    });
    return "compiled";
  } catch (error) {
    console.error("[sochestral:voice-bible] compile failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    await markVoiceBibleFailed(db, {
      userId: due.userId,
      compileHash: due.compileHash ?? due.sourceHash,
    });
    return "failed";
  }
}

export function createVoiceCompiler(): ModelProvider | null {
  try {
    const config = loadOrchestrationConfig();
    return new TheseanModelProvider(
      config.theseanApiKey,
      config.theseanTimeoutMs,
    );
  } catch {
    return null;
  }
}

export function voiceCompilerModel(): string {
  try {
    return loadOrchestrationConfig().theseanVoiceModel;
  } catch {
    return "ship-like/claude-opus-5";
  }
}
