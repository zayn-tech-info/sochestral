import { CalendarError } from "./calendar.js";

export type ScheduleRewriteAction = "regenerate" | "tweak" | "comment";

export type ScheduleRewriteInput = {
  selection: string;
  action: ScheduleRewriteAction;
  instruction?: string;
};

const ACTIONS: ScheduleRewriteAction[] = ["regenerate", "tweak", "comment"];
const MAX_INSTRUCTION_WORDS = 40;

function wordCount(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function actionPrompt(action: ScheduleRewriteAction, instruction: string): string {
  switch (action) {
    case "regenerate":
      return "Revamp the selected text while keeping the same concept, meaning, and voice. Make it feel fresh — do not merely paraphrase word-for-word.";
    case "tweak":
      return `Lightly revise the selected text while keeping its meaning, following this instruction: ${instruction}`;
    case "comment":
      return `Adjust or expand the selected text using this direction from the author: ${instruction}. Stay in the same voice.`;
  }
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Short Thesean rewrite for caption selection chips.
 * Soft-fails with REWRITE_UNAVAILABLE when the key is missing or the model call fails.
 */
export async function rewriteScheduleSelection(
  input: ScheduleRewriteInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ suggestion: string }> {
  const selection = input.selection?.trim() ?? "";
  const instruction = input.instruction?.trim() ?? "";
  if (!selection) {
    throw new CalendarError("INVALID_REWRITE", 422);
  }
  if (!ACTIONS.includes(input.action)) {
    throw new CalendarError("INVALID_REWRITE", 422);
  }
  if (input.action !== "regenerate") {
    if (!instruction) {
      throw new CalendarError("INVALID_REWRITE", 422);
    }
    if (wordCount(instruction) > MAX_INSTRUCTION_WORDS) {
      throw new CalendarError("INVALID_REWRITE", 422);
    }
  }

  const apiKey = env.THESEAN_API_KEY?.trim();
  if (!apiKey) {
    throw new CalendarError("REWRITE_UNAVAILABLE", 503);
  }

  const model =
    env.THESEAN_INTENT_MODEL?.trim() ||
    env.THESEAN_MODEL?.trim() ||
    "ship-like/claude-sonnet-5";
  const timeoutMs = positiveInteger(env.THESEAN_TIMEOUT_MS, 30_000);

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.thesean.ai/v1/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        system:
          "You rewrite short social caption selections. Return only the replacement text for the selection — no quotes, no preamble, no markdown fences.",
        messages: [
          {
            role: "user",
            content: [
              actionPrompt(input.action, instruction),
              `Selected text:\n${selection}`,
            ].join("\n\n"),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new CalendarError("REWRITE_UNAVAILABLE", 503);
    }

    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const suggestion = payload.content
      ?.filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text!.trim())
      .filter(Boolean)
      .join("\n")
      .trim();

    if (!suggestion) {
      throw new CalendarError("REWRITE_UNAVAILABLE", 503);
    }

    return { suggestion };
  } catch (error) {
    if (error instanceof CalendarError) throw error;
    throw new CalendarError("REWRITE_UNAVAILABLE", 503);
  } finally {
    clearTimeout(deadline);
  }
}
