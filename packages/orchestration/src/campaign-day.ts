import {
  campaignDayIndex,
  dailyCadenceTotal,
  getConversationContentPlan,
  getOwnedCampaignJob,
  getVoiceBible,
  patchCampaignJob,
  recordCampaignBooking,
  type CampaignJob,
  type ConversationContentPlan,
  type Database,
  type PlanCadence,
  type TargetPlatform,
} from "@sochestral/database";
import {
  claimNextQueuedCampaignJob,
  reclaimStaleRunningCampaignJobs,
} from "@sochestral/database";
import { playbookFor } from "./platform-playbooks.js";
import type { ModelProvider } from "./model.js";
import type { SocialMcpGateway } from "./mcp.js";
import type { OrchestrationConfig } from "./config.js";
import { z } from "zod";

const dayCaptionsSchema = z.object({
  items: z.array(
    z.object({
      platform: z.enum(["threads", "linkedin_personal", "instagram"]),
      publishAt: z.string(),
      text: z.string().min(1).max(3000),
    }),
  ),
});

const gradeSchema = z.object({
  fail: z.boolean(),
  reasons: z.array(z.enum(["generic", "duplicate", "length"])),
});

function addDays(isoDate: string, days: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function zonedHourToUtcIso(
  date: string,
  hour: number,
  timeZone: string,
): string | null {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const guess = new Date(Date.UTC(y, m - 1, d, hour, 0, 0));
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(guess);
    const shown = Number(parts.find((part) => part.type === "hour")?.value ?? hour);
    const delta = hour - shown;
    guess.setUTCHours(guess.getUTCHours() + delta);
    return guess.toISOString();
  } catch {
    return guess.toISOString();
  }
}

export function buildDaySlots(input: {
  cadence: PlanCadence;
  platforms: string[];
  date: string;
  timeZone: string;
  bookedPublishAts: string[];
  now: Date;
}): Array<{ platform: TargetPlatform; publishAt: string }> {
  const booked = new Set(input.bookedPublishAts);
  const slots: Array<{ platform: TargetPlatform; publishAt: string }> = [];
  const counts: Array<[TargetPlatform, number]> = [
    ["threads", input.cadence.threadsPerDay ?? 0],
    ["linkedin_personal", input.cadence.linkedinPerDay ?? 0],
    ["instagram", input.cadence.instagramPerDay ?? 0],
  ];
  for (const [platform, count] of counts) {
    if (count <= 0) continue;
    if (
      input.platforms.length > 0 &&
      !input.platforms.includes(platform) &&
      !(platform === "linkedin_personal" && input.platforms.includes("linkedin"))
    ) {
      continue;
    }
    const hours = playbookFor(platform).preferredHoursLocal;
    let placed = 0;
    for (const hour of hours) {
      if (placed >= count) break;
      const iso = zonedHourToUtcIso(input.date, hour, input.timeZone);
      if (!iso) continue;
      if (Date.parse(iso) <= input.now.getTime() + 5 * 60_000) continue;
      if (booked.has(iso)) continue;
      slots.push({ platform, publishAt: iso });
      booked.add(iso);
      placed += 1;
    }
  }
  return slots;
}

async function completeJson<T>(
  model: ModelProvider,
  modelName: string,
  system: string,
  user: string,
  schema: z.ZodType<T>,
  maxTokens: number,
): Promise<T | null> {
  const result = await model.complete({
    system,
    messages: [{ role: "user", content: [{ type: "text", text: user }] }],
    tools: [],
    model: modelName,
    maxTokens,
    thinking: { enabled: false, budgetTokens: 0 },
  });
  const text = result.content?.trim();
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return schema.parse(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return null;
  }
}

export async function processOneCampaignTick(
  db: Database["db"],
  input: {
    config: OrchestrationConfig;
    writer: ModelProvider;
    grader: ModelProvider;
    mcp: SocialMcpGateway;
    campaignCap: number;
    leaseMs: number;
  },
): Promise<"idle" | "worked" | "failed"> {
  await reclaimStaleRunningCampaignJobs(db, input.leaseMs);
  const job = await claimNextQueuedCampaignJob(db);
  if (!job) return "idle";
  try {
    await runClaimedDay(db, job, input);
    return "worked";
  } catch (error) {
    console.error("[sochestral:campaign] tick failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return "failed";
  }
}

async function runClaimedDay(
  db: Database["db"],
  claimed: CampaignJob,
  input: {
    config: OrchestrationConfig;
    writer: ModelProvider;
    grader: ModelProvider;
    mcp: SocialMcpGateway;
    campaignCap: number;
  },
): Promise<void> {
  const fresh = await getOwnedCampaignJob(db, claimed.userId, claimed.id);
  if (!fresh || fresh.status === "paused" || fresh.status === "stopped") return;

  if (fresh.bookedCount >= fresh.cap) {
    await patchCampaignJob(db, {
      jobId: fresh.id,
      userId: fresh.userId,
      status: "succeeded",
      completedAt: new Date(),
    });
    return;
  }

  const plan = await getConversationContentPlan(
    db,
    fresh.userId,
    fresh.conversationId,
  );
  if (!plan?.startDate) {
    await failOrRetry(db, fresh, "Plan lock is missing a start date");
    return;
  }

  const horizonEnd = addDays(plan.startDate, plan.horizonDays - 1);
  if (fresh.nextDate > horizonEnd) {
    await patchCampaignJob(db, {
      jobId: fresh.id,
      userId: fresh.userId,
      status: "succeeded",
      completedAt: new Date(),
    });
    return;
  }

  const timeZone = plan.timezone || "UTC";
  const slots = buildDaySlots({
    cadence: plan.cadence,
    platforms: plan.platforms,
    date: fresh.nextDate,
    timeZone,
    bookedPublishAts: fresh.bookedPublishAts,
    now: new Date(),
  });

  if (slots.length === 0) {
    if (dailyCadenceTotal(plan.cadence) > 0) {
      await failOrRetry(db, fresh, "No open slots for this day");
      return;
    }
    await advanceDay(db, fresh, plan);
    return;
  }

  const voice = await getVoiceBible(db, fresh.userId);
  const voiceNote = voice?.briefText?.trim()
    ? `\nVoice bible:\n${voice.briefText.trim()}`
    : "";
  const written = await completeJson(
    input.writer,
    input.config.theseanModel,
    "Write one human caption per slot. Return JSON only: {\"items\":[{\"platform\",\"publishAt\",\"text\"}]}. Match each publishAt. No hashtag dumps. Sound like this brand.",
    `Plan: ${plan.direction ?? ""} ${plan.themes.join("; ")}\nResearch: ${plan.researchSummary ?? "none"}${voiceNote}\nSlots: ${JSON.stringify(slots)}`,
    dayCaptionsSchema,
    2000,
  );
  if (!written) {
    await failOrRetry(db, fresh, "Day write failed");
    return;
  }

  let items = written.items.filter((item) =>
    slots.some(
      (slot) =>
        slot.publishAt === item.publishAt && slot.platform === item.platform,
    ),
  );
  const grade = await completeJson(
    input.grader,
    input.config.theseanIntentModel,
    "Grade captions. Return JSON {\"fail\":boolean,\"reasons\":[\"generic\"|\"duplicate\"|\"length\"]}.",
    JSON.stringify({ items, yesterday: fresh.bookedPublishAts }),
    gradeSchema,
    200,
  );
  if (grade?.fail) {
    const rewritten = await completeJson(
      input.writer,
      input.config.theseanModel,
      "Rewrite only the weak captions. Same JSON shape. Keep publishAt values.",
      `Reasons: ${grade.reasons.join(",")}\n${JSON.stringify(items)}`,
      dayCaptionsSchema,
      2000,
    );
    if (rewritten) items = rewritten.items;
  }

  let bookedThisDay = 0;
  let failedThisDay = 0;
  for (const item of items) {
    const latest = await getOwnedCampaignJob(db, fresh.userId, fresh.id);
    if (!latest || latest.status === "paused" || latest.status === "stopped") {
      return;
    }
    if (latest.bookedCount >= latest.cap) break;
    if (latest.bookedPublishAts.includes(item.publishAt)) continue;
    try {
      const result = await input.mcp.callTool({
        userId: fresh.userId,
        name: "schedule_post",
        arguments: {
          platforms: [item.platform],
          text: item.text,
          scheduledAt: item.publishAt,
          confirm: true,
          idempotencyKey: `campaign:${fresh.id}:${item.publishAt}`,
        },
      });
      const ok = result.value && typeof result.value === "object"
        ? (result.value as { ok?: boolean }).ok !== false
        : true;
      if (!ok) {
        failedThisDay += 1;
        continue;
      }
      const nextCount = latest.bookedCount + 1;
      const notice =
        nextCount >= latest.cap && fresh.nextDate < horizonEnd
          ? "Queued 30 posts. The rest of the lock was not booked."
          : null;
      await recordCampaignBooking(db, {
        jobId: fresh.id,
        userId: fresh.userId,
        publishAt: item.publishAt,
        notice,
      });
      bookedThisDay += 1;
    } catch {
      failedThisDay += 1;
    }
  }

  const after = await getOwnedCampaignJob(db, fresh.userId, fresh.id);
  if (!after) return;
  if (after.bookedCount >= after.cap) {
    await patchCampaignJob(db, {
      jobId: after.id,
      userId: after.userId,
      status: "succeeded",
      completedAt: new Date(),
      notice:
        after.notice ??
        "Queued 30 posts. The rest of the lock was not booked.",
    });
    return;
  }
  if (bookedThisDay === 0 && failedThisDay > 0) {
    await failOrRetry(db, after, "Every schedule_post failed this day");
    return;
  }
  await advanceDay(db, after, plan);
}

async function advanceDay(
  db: Database["db"],
  job: CampaignJob,
  plan: ConversationContentPlan,
): Promise<void> {
  const next = addDays(job.nextDate, 1);
  const horizonEnd = addDays(plan.startDate!, plan.horizonDays - 1);
  if (next > horizonEnd) {
    await patchCampaignJob(db, {
      jobId: job.id,
      userId: job.userId,
      status: "succeeded",
      dayAttempts: 0,
      completedAt: new Date(),
    });
    return;
  }
  await patchCampaignJob(db, {
    jobId: job.id,
    userId: job.userId,
    status: "queued",
    nextDate: next,
    dayAttempts: 0,
  });
}

async function failOrRetry(
  db: Database["db"],
  job: CampaignJob,
  lastError: string,
): Promise<void> {
  const attempts = job.dayAttempts + 1;
  if (attempts >= 2) {
    await patchCampaignJob(db, {
      jobId: job.id,
      userId: job.userId,
      status: "failed",
      dayAttempts: attempts,
      lastError,
      completedAt: new Date(),
    });
    return;
  }
  await patchCampaignJob(db, {
    jobId: job.id,
    userId: job.userId,
    status: "queued",
    dayAttempts: attempts,
    lastError,
  });
}

export function publicCampaign(job: CampaignJob, startDate?: string | null) {
  return {
    id: job.id,
    status: job.status,
    bookedCount: job.bookedCount,
    cap: job.cap,
    nextDate: job.nextDate,
    dayIndex: campaignDayIndex(startDate ?? null, job.nextDate),
    conversationId: job.conversationId,
    startDate: startDate ?? null,
    notice: job.notice,
    lastError: job.lastError,
  };
}

export function campaignQueueCap(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.CAMPAIGN_QUEUE_CAP);
  if (!Number.isInteger(parsed) || parsed < 1) return 30;
  return Math.min(30, parsed);
}

export function campaignBookingLine(horizonDays: number): string {
  return `Booking started. Day 1 of ${horizonDays}. Watch the Schedule tab.`;
}

export function campaignInFlightLine(): string {
  return "A campaign is already running. Pause or stop it on the Schedule tab first.";
}
