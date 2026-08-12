import { CalendarError } from "./calendar.js";
import { playbookFor } from "./platform-playbooks.js";
import { AUTONOMY_SCHEDULE_POST_CAP } from "./autonomy-brief.js";
import type { ConnectorPlatform } from "./connectors.js";

export type ComposeAssistTarget = {
  accountId: string;
  platform: ConnectorPlatform;
  caption?: string;
};

export type ComposeAssistInput = {
  message?: string;
  targets: ComposeAssistTarget[];
  focusAccountId?: string | null;
  profileContext?: string;
};

export type ComposeAssistUpdate = {
  accountId: string;
  caption: string;
};

export type ComposeAssistResult = {
  assistantText: string;
  updates: ComposeAssistUpdate[];
};

const PLATFORM_ALIASES: Array<{ platform: ConnectorPlatform; needles: string[] }> =
  [
    {
      platform: "linkedin_personal",
      needles: ["linkedin", "linked in", "li post"],
    },
    { platform: "threads", needles: ["threads", "thread"] },
    { platform: "instagram", needles: ["instagram", "insta", "ig"] },
  ];
const MAX_COMPOSE_ASSIST_TARGETS = AUTONOMY_SCHEDULE_POST_CAP;
const MAX_COMPOSE_ASSIST_TEXT_LENGTH = 40_000;

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function platformLabel(platform: ConnectorPlatform): string {
  if (platform === "linkedin_personal") return "LinkedIn";
  if (platform === "instagram") return "Instagram";
  return "Threads";
}

/** Platforms explicitly named in the user message (subset of selected targets). */
export function platformsMentionedInMessage(
  message: string,
  available: ConnectorPlatform[],
): ConnectorPlatform[] {
  const lower = message.toLowerCase();
  const found = new Set<ConnectorPlatform>();
  for (const row of PLATFORM_ALIASES) {
    if (!available.includes(row.platform)) continue;
    if (row.needles.some((needle) => lower.includes(needle))) {
      found.add(row.platform);
    }
  }
  return available.filter((platform) => found.has(platform));
}

export function resolveComposeTargets(
  input: ComposeAssistInput,
): ComposeAssistTarget[] {
  if (!Array.isArray(input.targets) || input.targets.length === 0) {
    throw new CalendarError("INVALID_REWRITE", 422);
  }
  const byId = new Map(input.targets.map((row) => [row.accountId, row]));
  const message = input.message?.trim() ?? "";
  const availablePlatforms = Array.from(
    new Set(input.targets.map((row) => row.platform)),
  );
  const mentioned = message
    ? platformsMentionedInMessage(message, availablePlatforms)
    : [];

  if (mentioned.length > 0) {
    return input.targets.filter((row) => mentioned.includes(row.platform));
  }
  if (input.focusAccountId && byId.has(input.focusAccountId)) {
    return [byId.get(input.focusAccountId)!];
  }
  return input.targets;
}

type ExtractedJsonObject =
  | { kind: "none" }
  | { kind: "malformed" }
  | { kind: "parsed"; value: Record<string, unknown> };

function extractJsonObject(text: string): ExtractedJsonObject {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "none" };
  try {
    const value = JSON.parse(trimmed);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { kind: "malformed" };
    }
    return { kind: "parsed", value: value as Record<string, unknown> };
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    const looksStructured =
      trimmed.startsWith("{") || /^```(?:json)?\s*\{/i.test(trimmed);
    if (start < 0 || end <= start) {
      return looksStructured ? { kind: "malformed" } : { kind: "none" };
    }
    try {
      const value = JSON.parse(trimmed.slice(start, end + 1));
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { kind: "malformed" };
      }
      return { kind: "parsed", value: value as Record<string, unknown> };
    } catch {
      return { kind: "malformed" };
    }
  }
}

type AssistPayloadParseResult =
  | { kind: "plain" }
  | { kind: "invalid" }
  | { kind: "result"; result: ComposeAssistResult };

function parseAssistPayload(
  text: string,
  allowedIds: Set<string>,
): AssistPayloadParseResult {
  const parsed = extractJsonObject(text);
  if (parsed.kind === "none") {
    return { kind: "plain" };
  }
  if (parsed.kind === "malformed") {
    return { kind: "invalid" };
  }
  const record = parsed.value;
  const assistantText =
    typeof record.assistantText === "string" && record.assistantText.trim()
      ? record.assistantText.trim()
      : "";
  const rawUpdates = Array.isArray(record.updates) ? record.updates : [];
  const updates: ComposeAssistUpdate[] = [];
  for (const item of rawUpdates) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const accountId =
      typeof row.accountId === "string" ? row.accountId.trim() : "";
    const caption = typeof row.caption === "string" ? row.caption.trim() : "";
    if (!accountId || !caption || !allowedIds.has(accountId)) continue;
    if (caption.length > MAX_COMPOSE_ASSIST_TEXT_LENGTH) continue;
    updates.push({ accountId, caption });
  }
  if (updates.length === 0) return { kind: "invalid" };
  return { kind: "result", result: { assistantText, updates } };
}

function assertBoundedComposeInput(input: ComposeAssistInput): void {
  if (!Array.isArray(input.targets) || input.targets.length === 0) {
    throw new CalendarError("INVALID_REWRITE", 422);
  }
  if (input.targets.length > MAX_COMPOSE_ASSIST_TARGETS) {
    throw new CalendarError("INVALID_REWRITE", 422, {
      targetMax: MAX_COMPOSE_ASSIST_TARGETS,
      targetCount: input.targets.length,
    });
  }
  if (
    typeof input.message === "string" &&
    input.message.length > MAX_COMPOSE_ASSIST_TEXT_LENGTH
  ) {
    throw new CalendarError("INVALID_REWRITE", 422, {
      messageMax: MAX_COMPOSE_ASSIST_TEXT_LENGTH,
    });
  }
  for (const target of input.targets) {
    if (
      typeof target.caption === "string" &&
      target.caption.length > MAX_COMPOSE_ASSIST_TEXT_LENGTH
    ) {
      throw new CalendarError("INVALID_REWRITE", 422, {
        captionMax: MAX_COMPOSE_ASSIST_TEXT_LENGTH,
      });
    }
  }
}

/**
 * Thesean compose assist for the calendar create board.
 * Soft-fails with REWRITE_UNAVAILABLE when the key is missing or the call fails.
 */
export async function composeScheduleCaptions(
  input: ComposeAssistInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ComposeAssistResult> {
  assertBoundedComposeInput(input);
  const writeTargets = resolveComposeTargets(input);
  const apiKey = env.THESEAN_API_KEY?.trim();
  if (!apiKey) {
    throw new CalendarError("REWRITE_UNAVAILABLE", 503);
  }

  const model =
    env.THESEAN_INTENT_MODEL?.trim() ||
    env.THESEAN_MODEL?.trim() ||
    "ship-like/claude-sonnet-5";
  const timeoutMs = positiveInteger(env.THESEAN_TIMEOUT_MS, 30_000);
  const message = input.message?.trim() ?? "";
  const profile =
    input.profileContext?.trim() ||
    "No business profile note yet. Write professional, clear social copy.";

  const targetBlocks = writeTargets.map((target) => {
    const book = playbookFor(target.platform);
    return [
      `- accountId: ${target.accountId}`,
      `  platform: ${target.platform} (${platformLabel(target.platform)})`,
      `  currentCaption: ${target.caption?.trim() || "(empty)"}`,
      `  forms: ${book.postForms.join("; ")}`,
      `  selling: ${book.sellingNotes}`,
    ].join("\n");
  });

  const userPrompt = [
    message
      ? `User request:\n${message}`
      : "User request:\n(Generate fresh drafts from the business profile and platform playbooks. No extra user notes.)",
    "",
    "Write captions only for these targets:",
    ...targetBlocks,
    "",
    "Business profile (authoritative tone and facts):",
    profile,
    "",
    "Return JSON only with shape:",
    '{"assistantText":"","updates":[{"accountId":"...","caption":"..."}]}',
    "Keep assistantText empty. One update per target accountId listed above. Captions must be ready to post (no markdown fences).",
  ].join("\n");

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
        max_tokens: 2048,
        system:
          "You are Soc, Sochestral's compose assistant for the schedule create board. Draft or reshape social captions in the brand voice. Never publish. Never chat. Respond with JSON only and leave assistantText empty.",
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new CalendarError("REWRITE_UNAVAILABLE", 503);
    }

    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = payload.content
      ?.filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text!.trim())
      .filter(Boolean)
      .join("\n")
      .trim();

    if (!text) {
      throw new CalendarError("REWRITE_UNAVAILABLE", 503);
    }

    const allowedIds = new Set(writeTargets.map((row) => row.accountId));
    const parsed = parseAssistPayload(text, allowedIds);
    if (parsed.kind === "result") return parsed.result;
    if (parsed.kind === "invalid") {
      throw new CalendarError("REWRITE_UNAVAILABLE", 503);
    }

    // Fallback: treat whole reply as a single caption for the first/focus target.
    const fallbackTarget = writeTargets[0]!;
    const caption = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    if (!caption) {
      throw new CalendarError("REWRITE_UNAVAILABLE", 503);
    }
    if (caption.length > MAX_COMPOSE_ASSIST_TEXT_LENGTH) {
      throw new CalendarError("REWRITE_UNAVAILABLE", 503);
    }
    return {
      assistantText: "",
      updates: [{ accountId: fallbackTarget.accountId, caption }],
    };
  } catch (error) {
    if (error instanceof CalendarError) throw error;
    throw new CalendarError("REWRITE_UNAVAILABLE", 503);
  } finally {
    clearTimeout(deadline);
  }
}
