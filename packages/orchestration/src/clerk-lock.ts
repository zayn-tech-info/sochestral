import { z } from "zod";
import type {
  ConversationContentPlan,
  PlanCadence,
  PlanTimeMode,
} from "@sochestral/database";
import {
  dailyCadenceTotal,
  isContentPlanLockComplete,
  plannedPostCount,
} from "@sochestral/database";
import type { ModelProvider, ModelTool } from "./model.js";
import { wrapUserMessageForIntentClassification } from "./publishing.js";

export const CLERK_TOOL_NAME = "record_plan_clerk";

const cadenceSchema = z
  .object({
    threadsPerDay: z.number().int().min(0).max(8).optional(),
    linkedinPerDay: z.number().int().min(0).max(8).optional(),
    instagramPerDay: z.number().int().min(0).max(8).optional(),
  })
  .nullable();

export const clerkOutputSchema = z.object({
  intent: z.enum(["chat", "plan", "accept", "live", "draft", "schedule_one"]),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  timezone: z.string().min(1).nullable(),
  cadence: cadenceSchema,
  platforms: z
    .array(z.enum(["threads", "linkedin", "instagram"]))
    .nullable(),
  timeMode: z.enum(["spread", "windows"]).nullable(),
  isGo: z.boolean(),
  isIncomplete: z.boolean(),
  isConversationMeta: z.boolean(),
});

export type ClerkOutput = z.infer<typeof clerkOutputSchema>;

export const CLERK_TOOL: ModelTool = {
  name: CLERK_TOOL_NAME,
  description:
    "Record the user's plan lock and intent for this turn. Call once.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: [
      "intent",
      "startDate",
      "timezone",
      "cadence",
      "platforms",
      "timeMode",
      "isGo",
      "isIncomplete",
      "isConversationMeta",
    ],
    properties: {
      intent: {
        type: "string",
        enum: ["chat", "plan", "accept", "live", "draft", "schedule_one"],
      },
      startDate: { type: ["string", "null"], description: "YYYY-MM-DD only" },
      timezone: { type: ["string", "null"] },
      cadence: {
        type: ["object", "null"],
        properties: {
          threadsPerDay: { type: "integer" },
          linkedinPerDay: { type: "integer" },
          instagramPerDay: { type: "integer" },
        },
      },
      platforms: {
        type: ["array", "null"],
        items: { type: "string", enum: ["threads", "linkedin", "instagram"] },
      },
      timeMode: { type: ["string", "null"], enum: ["spread", "windows"] },
      isGo: { type: "boolean" },
      isIncomplete: { type: "boolean" },
      isConversationMeta: { type: "boolean" },
    },
  },
};

const CLERK_SYSTEM =
  "You extract a content plan lock from a delimited user message. " +
  "Call record_plan_clerk once. Use null for unknown fields. " +
  "startDate must be YYYY-MM-DD or null. Do not invent a year. " +
  "If lockComplete is true, dates, platforms, and cadence are already stored. " +
  "When the user wants booking to start, set intent to accept and isGo to true. " +
  "A short confirmation is enough. Do not wait for captions or extra ideas. " +
  "Do not set isIncomplete for a start signal. " +
  "isConversationMeta is only for talk about the chat UI itself. " +
  "schedule_one only for one concrete post. live only for publish now.";

export function isGptTheseanModel(model: string): boolean {
  return model.toLowerCase().includes("gpt-");
}

export function mapClerkPlatform(value: string): string {
  if (value === "linkedin") return "linkedin_personal";
  return value;
}

export function resolveRelativeStartDate(
  message: string,
  timeZone: string,
  now = new Date(),
): string | null {
  const lower = message.toLowerCase();
  const today = dateKeyInZone(now, timeZone);
  if (/\btomorrow\b/.test(lower)) {
    const next = new Date(now.getTime() + 86_400_000);
    return dateKeyInZone(next, timeZone);
  }
  if (/\btoday\b/.test(lower)) return today;
  return null;
}

export function bumpPastStartDate(
  startDate: string,
  timeZone: string,
  now = new Date(),
): string {
  const today = dateKeyInZone(now, timeZone);
  return startDate < today ? today : startDate;
}

export function rejectOldYear(startDate: string, now = new Date()): boolean {
  const year = Number(startDate.slice(0, 4));
  return year < now.getUTCFullYear() - 1;
}

export function mergeClerkLock(
  plan: ConversationContentPlan | null,
  clerk: ClerkOutput,
  input: { message: string; profileTimeZone: string; now?: Date },
): {
  startDate: string | null;
  timezone: string | null;
  cadence: PlanCadence;
  timeMode: PlanTimeMode | null;
  platforms: string[] | null;
  lockedAt: Date | null;
} {
  const now = input.now ?? new Date();
  let timezone = clerk.timezone ?? plan?.timezone ?? null;
  if (!timezone) timezone = input.profileTimeZone || "UTC";

  let startDate = clerk.startDate ?? plan?.startDate ?? null;
  if (!clerk.startDate) {
    const relative = resolveRelativeStartDate(input.message, timezone, now);
    if (relative) startDate = relative;
  }
  if (startDate && rejectOldYear(startDate, now)) {
    startDate = plan?.startDate ?? null;
  }
  if (startDate) startDate = bumpPastStartDate(startDate, timezone, now);

  const cadence: PlanCadence = { ...(plan?.cadence ?? {}) };
  if (clerk.cadence) {
    if (clerk.cadence.threadsPerDay !== undefined) {
      cadence.threadsPerDay = clerk.cadence.threadsPerDay;
    }
    if (clerk.cadence.linkedinPerDay !== undefined) {
      cadence.linkedinPerDay = clerk.cadence.linkedinPerDay;
    }
    if (clerk.cadence.instagramPerDay !== undefined) {
      cadence.instagramPerDay = clerk.cadence.instagramPerDay;
    }
  }

  const platforms =
    clerk.platforms && clerk.platforms.length > 0
      ? clerk.platforms.map(mapClerkPlatform)
      : null;

  let timeMode = (clerk.timeMode ?? plan?.timeMode ?? null) as PlanTimeMode | null;
  if (!timeMode && dailyCadenceTotal(cadence) > 0) timeMode = "spread";

  const mergedForLock = {
    ...(plan ?? {}),
    startDate,
    timezone,
    cadence,
    timeMode,
    platforms: platforms ?? plan?.platforms ?? [],
    direction: plan?.direction ?? null,
    themes: plan?.themes ?? [],
  } as ConversationContentPlan;

  const lockedAt = isContentPlanLockComplete(mergedForLock) ? now : plan?.lockedAt ?? null;

  return { startDate, timezone, cadence, timeMode, platforms, lockedAt };
}

export function clerkWantsCampaign(
  clerk: ClerkOutput,
  plan: ConversationContentPlan | null,
): boolean {
  if (clerk.isIncomplete || clerk.isConversationMeta) return false;
  if (!isContentPlanLockComplete(plan)) return false;
  if (plannedPostCount(plan) <= 1) return false;
  return clerk.isGo || clerk.intent === "accept" || clerk.intent === "schedule_one";
}

export function clerkIsChatOnly(clerk: ClerkOutput | null): boolean {
  if (!clerk) return true;
  return clerk.isIncomplete || clerk.isConversationMeta;
}

export async function runPlanClerk(
  model: ModelProvider,
  input: {
    message: string;
    priorMessages: string[];
    modelName: string;
    existingLock: {
      startDate: string | null;
      timezone: string | null;
      cadence: PlanCadence;
      timeMode: string | null;
      lockComplete?: boolean;
      plannedPosts?: number;
    } | null;
  },
): Promise<ClerkOutput | null> {
  try {
    const window = [input.message, ...input.priorMessages.slice(-4)].join("\n");
    const result = await model.complete({
      system: `${CLERK_SYSTEM} Existing lock: ${JSON.stringify(input.existingLock)}`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: wrapUserMessageForIntentClassification(window),
            },
          ],
        },
      ],
      tools: [CLERK_TOOL],
      toolChoice: { type: "tool", name: CLERK_TOOL_NAME },
      model: input.modelName,
      maxTokens: 256,
      thinking: { enabled: false, budgetTokens: 0 },
    });
    const call = result.toolCalls.find((item) => item.name === CLERK_TOOL_NAME);
    if (!call) {
      // #region agent log
      fetch('http://127.0.0.1:7380/ingest/bba007c1-d719-434b-a717-ab19f91562f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ebe5c0'},body:JSON.stringify({sessionId:'ebe5c0',runId:'pre-fix',hypothesisId:'B',location:'clerk-lock.ts:runPlanClerk',message:'clerk no tool call',data:{modelName:input.modelName,lockComplete:input.existingLock?.lockComplete ?? null,plannedPosts:input.existingLock?.plannedPosts ?? null,toolCallCount:result.toolCalls.length,messageLen:input.message.trim().length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return null;
    }
    const parsed = clerkOutputSchema.safeParse(call.input);
    // #region agent log
      fetch('http://127.0.0.1:7380/ingest/bba007c1-d719-434b-a717-ab19f91562f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ebe5c0'},body:JSON.stringify({sessionId:'ebe5c0',runId:'pre-fix',hypothesisId:'C',location:'clerk-lock.ts:runPlanClerk',message:'clerk parsed',data:{parseOk:parsed.success,lockComplete:input.existingLock?.lockComplete ?? null,plannedPosts:input.existingLock?.plannedPosts ?? null,intent:parsed.success?parsed.data.intent:null,isGo:parsed.success?parsed.data.isGo:null,isIncomplete:parsed.success?parsed.data.isIncomplete:null,isConversationMeta:parsed.success?parsed.data.isConversationMeta:null,parseIssue:parsed.success?null:parsed.error.issues[0]?.path.concat(parsed.error.issues[0]?.code ?? ''),rawKeys:call.input&&typeof call.input==='object'?Object.keys(call.input as object):[]},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return parsed.success ? parsed.data : null;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7380/ingest/bba007c1-d719-434b-a717-ab19f91562f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ebe5c0'},body:JSON.stringify({sessionId:'ebe5c0',runId:'pre-fix',hypothesisId:'B',location:'clerk-lock.ts:runPlanClerk',message:'clerk threw',data:{errorName:error instanceof Error?error.name:'unknown',errorCode:typeof error==='object'&&error&&'code' in error?String((error as {code:unknown}).code):null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return null;
  }
}

function dateKeyInZone(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
