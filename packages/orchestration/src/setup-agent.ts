import { z } from "zod";
import {
  confirmProposedCompetitors,
  createProfileEntry,
  getCompiledProfile,
  listProfileEntries,
  mapUnknownCategory,
  patchBusinessProfile,
  tryCompleteSetupIfReady,
  type Database,
  type ProfileEntry,
} from "@sochestral/database";
import type { IntentQuestion } from "./intent-questions.js";
import type { ModelTool } from "./model.js";
import { OrchestrationError } from "./errors.js";

export const SETUP_SYSTEM_MESSAGE = `You are Sochestral, a business-strict AI social operator. You draft, schedule, and publish through official platform APIs once accounts are connected. During this conversation you are also building a short structured business profile so later drafts sound like them, not a generic brand.

Tone: professional, warm, and concise — like a modern assistant (Claude / ChatGPT style). Never sound like a form wizard or a gatekeeper.

First reply (when setup_status is not_started or business name is missing): briefly introduce what you can help with, then invite them to tell you about their business — who they are, what they sell or ship, and what they want Sochestral to do. Prefer one open question over a checklist. Say briefly why that context helps (better drafts that sound like their brand).

Extract identity from natural answers with update_business_identity (name, description, website, audience, industry). Do not make them fill fields in order if they already volunteered enough; save what you have and advance.

Step order from the profile snapshot (setup_step and fields present): (1) business name + clear description, (2) competitors via research_competitors or skip_competitors if they decline, (3) three short sample social posts in your reply and ask for corrections; when they correct tone, call save_tone_rule, (4) complete_setup_if_ready when the minimum is met. Do not skip ahead until the current step is saved with tools.

When a competitor tool result asks you to collect competitors from the user, do that as a normal next question. Never mention research, tools, models, APIs, outages, errors, or that something was unavailable. The user only needs a clear ask about who they compete with (or that they can skip), plus a short why (so drafts can contrast or stay distinct).

Re-asking after a skip or digression: do not rely on vague pointers like "the three sample posts above" if that content is no longer the previous assistant message. Restore enough context so the ask stands alone — briefly restate why you need the answer, then either (a) summarize what you asked earlier, (b) re-list the samples or options in compact form, or (c) invite them to scroll back to your earlier samples if they remember them. Prefer a short summary or compact re-list when the original ask is more than one turn away. Do not paste the full prior message every single turn; only restore context when the thread has moved on.

If they ask something off-topic or request drafting/publishing before the profile is ready: answer that question briefly and usefully, then end with exactly one bold markdown question for the unanswered setup step. That closing question must include a light why (personalized drafts / brand fit) and enough restated context to make sense without hunting the thread. Never say they are blocked, never say "finish setup before operator drafting," never scold.

Rules: use only the supplied tools for writes; never invent OAuth connections (you may mention Settings → Connected Accounts); never claim a live publish; keep questions short; one primary ask per turn. Never expose internal failures or infrastructure details to the user.`;

export const SETUP_TOOL_NAMES = [
  "update_business_identity",
  "upsert_profile_entry",
  "skip_competitors",
  "research_competitors",
  "save_tone_rule",
  "complete_setup_if_ready",
] as const;

export type SetupToolName = (typeof SETUP_TOOL_NAMES)[number];

const identitySchema = z
  .object({
    businessName: z.string().trim().min(1).max(200).optional(),
    businessDescription: z.string().trim().min(1).max(4000).optional(),
    websiteUrl: z.string().trim().url().max(500).optional().nullable(),
    targetAudience: z.string().trim().max(1000).optional().nullable(),
    industry: z.string().trim().max(200).optional().nullable(),
    setupStep: z.string().trim().max(80).optional(),
  })
  .strict();

const entrySchema = z
  .object({
    category: z.string().trim().min(1).max(40),
    title: z.string().trim().max(200).optional().nullable(),
    body: z.string().trim().min(1).max(4000),
    status: z.enum(["proposed", "active", "rejected", "archived"]).optional(),
  })
  .strict();

const toneSchema = z
  .object({
    body: z.string().trim().min(1).max(2000),
    title: z.string().trim().max(120).optional(),
  })
  .strict();

const emptySchema = z.object({}).strict();

export const SETUP_MODEL_TOOLS: ModelTool[] = [
  {
    name: "update_business_identity",
    description: "Save business name, description, website, audience, or industry.",
    inputSchema: {
      type: "object",
      properties: {
        businessName: { type: "string" },
        businessDescription: { type: "string" },
        websiteUrl: { type: "string" },
        targetAudience: { type: "string" },
        industry: { type: "string" },
        setupStep: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "upsert_profile_entry",
    description: "Write one categorized profile entry (tone, do_not, cadence, competitor, audience, skill, brand_fact).",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
        status: { type: "string" },
      },
      required: ["category", "body"],
      additionalProperties: false,
    },
  },
  {
    name: "skip_competitors",
    description: "Record that the user explicitly skipped competitor research.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "research_competitors",
    description:
      "Run product owned competitor research from the saved business identity. Returns proposed competitors for the user to confirm.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "save_tone_rule",
    description: "Save a tone rule learned from sample post corrections.",
    inputSchema: {
      type: "object",
      properties: {
        body: { type: "string" },
        title: { type: "string" },
      },
      required: ["body"],
      additionalProperties: false,
    },
  },
  {
    name: "complete_setup_if_ready",
    description: "Mark setup complete when the minimum profile is satisfied.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

export type DeepSeekResearchClient = {
  researchCompetitors(input: {
    businessName: string;
    businessDescription: string;
    websiteUrl: string | null;
    industry: string | null;
  }): Promise<Array<{ title: string; body: string }>>;
};

export function createDeepSeekResearchClient(config: {
  apiKey: string | null;
  baseUrl: string;
  model: string;
}): DeepSeekResearchClient | null {
  if (!config.apiKey) return null;
  const { apiKey, baseUrl, model } = config;
  return {
    async researchCompetitors(input) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            thinking: { type: "disabled" },
            messages: [
              {
                role: "system",
                content:
                  "Return JSON only: {\"competitors\":[{\"title\":\"Name\",\"body\":\"Why they compete\"}]}. Max 4 competitors. No secrets.",
              },
              {
                role: "user",
                content: JSON.stringify({
                  businessName: input.businessName,
                  businessDescription: input.businessDescription,
                  websiteUrl: input.websiteUrl,
                  industry: input.industry,
                }),
              },
            ],
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`DeepSeek HTTP ${response.status}`);
        }
        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = payload.choices?.[0]?.message?.content ?? "{}";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(jsonMatch?.[0] ?? "{}") as {
          competitors?: Array<{ title?: string; body?: string }>;
        };
        return (parsed.competitors ?? [])
          .filter((row) => row.title && row.body)
          .slice(0, 4)
          .map((row) => ({
            title: String(row.title).slice(0, 200),
            body: String(row.body).slice(0, 1000),
          }));
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function buildCompetitorQuestions(
  proposed: ProfileEntry[],
): IntentQuestion[] {
  const proposedOptions = proposed.slice(0, 3).map((entry, index) => ({
    id: entry.id,
    label: entry.title ? `${entry.title}: ${entry.body}` : entry.body,
    recommended: index === 0,
  }));
  const options = [
    ...proposedOptions,
    ...(proposedOptions.length >= 2
      ? [{ id: "all", label: "All of the above" }]
      : []),
    { id: "custom", label: "None of these / I'll type my own", custom: true },
    { id: "skip", label: "Skip competitors for now" },
  ];
  return [
    {
      id: "competitors",
      prompt: "Which of these look like real competitors for your business?",
      reason: "Confirm research before it becomes part of your profile.",
      options,
    },
  ];
}

const ALL_OF_THESE_PATTERN =
  /^(all|all of them|all of the above|all of these|all options|every one|everyone|both|all three|all 3)$/i;

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  "1st": 1,
  second: 2,
  "2nd": 2,
  third: 3,
  "3rd": 3,
};

export type CompetitorCustomResolution =
  | { kind: "ids"; ids: string[] }
  | { kind: "literal"; text: string };

export function resolveCompetitorCustomSelection(
  customText: string,
  proposedEntries: ProfileEntry[],
): CompetitorCustomResolution {
  const text = customText.replace(/\s+/g, " ").trim();
  if (!text) return { kind: "literal", text: "" };
  if (proposedEntries.length === 0) return { kind: "literal", text };

  const normalized = text.toLowerCase();
  if (ALL_OF_THESE_PATTERN.test(normalized)) {
    return { kind: "ids", ids: proposedEntries.map((entry) => entry.id) };
  }

  const selectedIndexes = new Set<number>();
  const optionNumberMatches = normalized.matchAll(
    /\b(?:option|choice|number|#)\s*([1-3])\b|\b([1-3])(?:st|nd|rd)?\b/gi,
  );
  for (const match of optionNumberMatches) {
    const value = Number(match[1] ?? match[2]);
    if (value >= 1 && value <= proposedEntries.length) {
      selectedIndexes.add(value - 1);
    }
  }
  for (const [word, index] of Object.entries(ORDINAL_WORDS)) {
    if (
      new RegExp(`\\b${word}\\b`, "i").test(normalized) &&
      index <= proposedEntries.length
    ) {
      selectedIndexes.add(index - 1);
    }
  }
  if (selectedIndexes.size > 0) {
    return {
      kind: "ids",
      ids: [...selectedIndexes]
        .sort((a, b) => a - b)
        .map((index) => proposedEntries[index]!.id),
    };
  }

  const matchedIds = proposedEntries
    .filter((entry) => {
      const title = entry.title?.trim().toLowerCase() ?? "";
      const body = entry.body.trim().toLowerCase();
      if (title && (normalized === title || normalized.includes(title))) {
        return true;
      }
      if (body && normalized === body) return true;
      return false;
    })
    .map((entry) => entry.id);
  if (matchedIds.length > 0) {
    return { kind: "ids", ids: matchedIds };
  }

  return { kind: "literal", text };
}

export function buildProfileUpdateConfirmQuestions(summary: string): IntentQuestion[] {
  return [
    {
      id: "profile_update",
      prompt: `Update your business profile with this? ${summary}`,
      reason: "Only clear business profile changes are saved this way.",
      options: [
        { id: "yes", label: "Yes, update my profile", recommended: true },
        { id: "no", label: "No, keep it as is" },
        { id: "custom", label: "Edit the wording", custom: true },
      ],
    },
  ];
}

export async function executeSetupTool(
  db: Database["db"],
  userId: string,
  toolName: string,
  rawInput: unknown,
  research: DeepSeekResearchClient | null,
): Promise<{
  ok: boolean;
  summary: string;
  proposedCompetitors?: ProfileEntry[];
  profileComplete?: boolean;
}> {
  switch (toolName) {
    case "update_business_identity": {
      const input = identitySchema.parse(rawInput ?? {});
      await patchBusinessProfile(db, userId, {
        ...input,
        setupStatus: "in_progress",
        setupStep: input.setupStep ?? undefined,
      });
      return { ok: true, summary: "Business identity updated." };
    }
    case "upsert_profile_entry": {
      const input = entrySchema.parse(rawInput ?? {});
      const entry = await createProfileEntry(db, {
        userId,
        category: mapUnknownCategory(input.category),
        title: input.title ?? null,
        body: input.body,
        status: input.status ?? "active",
        source: "setup",
      });
      return {
        ok: true,
        summary: `Saved ${entry.category} entry ${entry.id}.`,
      };
    }
    case "skip_competitors": {
      emptySchema.parse(rawInput ?? {});
      await patchBusinessProfile(db, userId, {
        competitorsSkipped: true,
        setupStatus: "in_progress",
        setupStep: "tone",
      });
      return { ok: true, summary: "Competitors skipped." };
    }
    case "research_competitors": {
      emptySchema.parse(rawInput ?? {});
      const compiled = await getCompiledProfile(db, userId);
      const name = compiled.profile.businessName?.trim();
      const description = compiled.profile.businessDescription?.trim();
      if (!name || !description) {
        return {
          ok: false,
          summary: "Save business name and description before research.",
        };
      }
      if (!research) {
        return {
          ok: false,
          summary:
            "No proposed competitors. Ask who their main competitors are, or offer to skip. Do not mention research, tools, models, or outages.",
        };
      }
      let competitors: Array<{ title: string; body: string }> = [];
      try {
        competitors = await research.researchCompetitors({
          businessName: name,
          businessDescription: description,
          websiteUrl: compiled.profile.websiteUrl,
          industry: compiled.profile.industry,
        });
      } catch {
        return {
          ok: false,
          summary:
            "No proposed competitors. Ask who their main competitors are, or offer to skip. Do not mention research, tools, models, or outages.",
        };
      }
      if (competitors.length === 0) {
        return {
          ok: false,
          summary:
            "No proposed competitors. Ask who their main competitors are, or offer to skip. Do not mention research, tools, models, or outages.",
        };
      }
      const proposed: ProfileEntry[] = [];
      for (const row of competitors) {
        proposed.push(
          await createProfileEntry(db, {
            userId,
            category: "competitor",
            title: row.title,
            body: row.body,
            status: "proposed",
            source: "research",
          }),
        );
      }
      await patchBusinessProfile(db, userId, {
        setupStatus: "in_progress",
        setupStep: "competitors",
      });
      return {
        ok: true,
        summary: `Proposed ${proposed.length} competitors for confirm.`,
        proposedCompetitors: proposed,
      };
    }
    case "save_tone_rule": {
      const input = toneSchema.parse(rawInput ?? {});
      const entry = await createProfileEntry(db, {
        userId,
        category: "tone",
        title: input.title ?? "Tone",
        body: input.body,
        status: "active",
        source: "setup",
      });
      return { ok: true, summary: `Saved tone rule ${entry.id}.` };
    }
    case "complete_setup_if_ready": {
      emptySchema.parse(rawInput ?? {});
      const profile = await tryCompleteSetupIfReady(db, userId);
      return {
        ok: profile.setupStatus === "complete",
        summary:
          profile.setupStatus === "complete"
            ? "Setup complete. Operator chat is unlocked."
            : "Minimum profile not complete yet.",
        profileComplete: profile.setupStatus === "complete",
      };
    }
    default:
      throw new OrchestrationError("INVALID_TOOL_ARGUMENTS", 422, "Unknown setup tool");
  }
}

export async function applyCompetitorAnswers(
  db: Database["db"],
  userId: string,
  answers: Array<{ questionId: string; optionId: string; customText?: string }>,
): Promise<{ questionsHandled: boolean; assistantHint: string }> {
  const answer = answers.find((item) => item.questionId === "competitors");
  if (!answer) return { questionsHandled: false, assistantHint: "" };

  if (answer.optionId === "skip") {
    await patchBusinessProfile(db, userId, {
      competitorsSkipped: true,
      setupStep: "tone",
    });
    return {
      questionsHandled: true,
      assistantHint: "Competitors skipped. Continue with sample posts for tone.",
    };
  }

  const proposed = await listProfileEntries(db, {
    userId,
    category: "competitor",
    status: "proposed",
    limit: 100,
  });

  if (answer.optionId === "all") {
    await confirmProposedCompetitors(
      db,
      userId,
      proposed.items.map((entry) => entry.id),
    );
    await patchBusinessProfile(db, userId, { setupStep: "tone" });
    return {
      questionsHandled: true,
      assistantHint:
        "All suggested competitors confirmed. Continue with sample posts for tone.",
    };
  }

  if (answer.optionId === "custom") {
    const text = answer.customText?.trim() ?? "";
    if (!text) {
      await patchBusinessProfile(db, userId, { competitorsSkipped: true });
      await confirmProposedCompetitors(db, userId, []);
      await patchBusinessProfile(db, userId, { setupStep: "tone" });
      return {
        questionsHandled: true,
        assistantHint: "Competitors skipped. Continue with sample posts for tone.",
      };
    }

    const resolved = resolveCompetitorCustomSelection(text, proposed.items);
    if (resolved.kind === "ids" && resolved.ids.length > 0) {
      await confirmProposedCompetitors(db, userId, resolved.ids);
      await patchBusinessProfile(db, userId, { setupStep: "tone" });
      return {
        questionsHandled: true,
        assistantHint:
          "Suggested competitors confirmed from your answer. Continue with sample posts for tone.",
      };
    }

    await createProfileEntry(db, {
      userId,
      category: "competitor",
      title: text.slice(0, 80),
      body: text,
      status: "active",
      source: "setup",
    });
    await confirmProposedCompetitors(db, userId, []);
    await patchBusinessProfile(db, userId, { setupStep: "tone" });
    return {
      questionsHandled: true,
      assistantHint: "Custom competitor saved. Continue with sample posts for tone.",
    };
  }

  await confirmProposedCompetitors(db, userId, [answer.optionId]);
  await patchBusinessProfile(db, userId, { setupStep: "tone" });
  return {
    questionsHandled: true,
    assistantHint: "Competitor confirmed. Continue with sample posts for tone.",
  };
}

export function isSetupGateActive(
  setupAgentEnabled: boolean,
  setupStatus: string,
): boolean {
  return setupAgentEnabled && setupStatus !== "complete";
}
