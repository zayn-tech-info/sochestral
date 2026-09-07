import { and, eq } from "drizzle-orm";
import { createContentPlanId } from "./ids.js";
import {
  conversationContentPlans,
  type ConversationContentPlan,
  type PlanCadence,
  type PlanTimeMode,
} from "./schema.js";
import type { TargetPlatform } from "./orchestration.js";
import type { Database } from "./client.js";

type Db = Database["db"];

export type ContentPlanPatch = {
  horizonDays?: number;
  platforms?: string[];
  contentType?: string | null;
  direction?: string | null;
  themes?: string[];
  acceptedItems?: Array<Record<string, unknown>>;
  researchSummary?: string | null;
  startDate?: string | null;
  timezone?: string | null;
  cadence?: PlanCadence;
  timeMode?: PlanTimeMode | null;
  lockedAt?: Date | null;
};

export async function getConversationContentPlan(
  db: Db,
  userId: string,
  conversationId: string,
): Promise<ConversationContentPlan | null> {
  const [row] = await db
    .select()
    .from(conversationContentPlans)
    .where(
      and(
        eq(conversationContentPlans.userId, userId),
        eq(conversationContentPlans.conversationId, conversationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertConversationContentPlan(
  db: Db,
  input: {
    userId: string;
    conversationId: string;
  } & ContentPlanPatch,
): Promise<ConversationContentPlan> {
  const existing = await getConversationContentPlan(
    db,
    input.userId,
    input.conversationId,
  );
  const horizonDays = clampHorizon(
    input.horizonDays ?? existing?.horizonDays ?? 14,
  );
  const platforms = input.platforms ?? existing?.platforms ?? [];
  const themes = input.themes ?? existing?.themes ?? [];
  const acceptedItems = input.acceptedItems ?? existing?.acceptedItems ?? [];
  const contentType =
    input.contentType === undefined
      ? existing?.contentType ?? null
      : input.contentType;
  const direction =
    input.direction === undefined ? existing?.direction ?? null : input.direction;
  const researchSummary =
    input.researchSummary === undefined
      ? existing?.researchSummary ?? null
      : input.researchSummary;
  const startDate =
    input.startDate === undefined ? existing?.startDate ?? null : input.startDate;
  const timezone =
    input.timezone === undefined ? existing?.timezone ?? null : input.timezone;
  const cadence = input.cadence ?? existing?.cadence ?? {};
  const timeMode =
    input.timeMode === undefined ? existing?.timeMode ?? null : input.timeMode;
  const lockedAt =
    input.lockedAt === undefined ? existing?.lockedAt ?? null : input.lockedAt;

  if (existing) {
    const [updated] = await db
      .update(conversationContentPlans)
      .set({
        horizonDays,
        platforms,
        contentType,
        direction,
        themes,
        acceptedItems,
        researchSummary,
        startDate,
        timezone,
        cadence,
        timeMode,
        lockedAt,
        updatedAt: new Date(),
      })
      .where(eq(conversationContentPlans.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(conversationContentPlans)
    .values({
      id: createContentPlanId(),
      conversationId: input.conversationId,
      userId: input.userId,
      horizonDays,
      platforms,
      contentType,
      direction,
      themes,
      acceptedItems,
      researchSummary,
      startDate,
      timezone,
      cadence,
      timeMode,
      lockedAt,
    })
    .returning();
  return created!;
}

export function contentPlanHasBrief(plan: ConversationContentPlan | null): boolean {
  if (!plan) return false;
  return Boolean(plan.contentType?.trim() && plan.direction?.trim());
}

/** Operator gave direction, topics, or accepted items. Profile facts do not count. */
export function contentPlanHasUserIdeas(
  plan: ConversationContentPlan | null,
): boolean {
  if (!plan) return false;
  return Boolean(
    plan.direction?.trim() ||
      plan.themes.some((theme) => theme.trim()) ||
      plan.acceptedItems.length > 0,
  );
}

export function formatContentPlanNote(
  plan: ConversationContentPlan | null,
): string | null {
  if (!plan) return null;
  const lines = [
    "# Conversation content plan (authoritative)",
    `Horizon days: ${plan.horizonDays}`,
    plan.platforms.length
      ? `Platforms: ${plan.platforms.join(", ")}`
      : "Platforms: not set",
    plan.contentType?.trim()
      ? `Content type: ${plan.contentType.trim()}`
      : "Content type: not set",
    plan.direction?.trim()
      ? `Direction: ${plan.direction.trim()}`
      : "Direction: not set",
  ];
  if (plan.themes.length) {
    lines.push(`Themes: ${plan.themes.join("; ")}`);
  }
  if (plan.acceptedItems.length) {
    lines.push(`Accepted items: ${JSON.stringify(plan.acceptedItems)}`);
  }
  if (plan.researchSummary?.trim()) {
    lines.push("", "## Research notes", plan.researchSummary.trim());
  }
  if (plan.startDate) lines.push(`Start date: ${plan.startDate}`);
  if (plan.timezone) lines.push(`Timezone: ${plan.timezone}`);
  const daily = dailyCadenceTotal(plan.cadence);
  if (daily > 0) {
    lines.push(`Cadence per day: ${JSON.stringify(plan.cadence)}`);
  }
  if (plan.timeMode) lines.push(`Time mode: ${plan.timeMode}`);
  if (plan.lockedAt) lines.push("Lock: complete. Do not re ask filled fields.");
  return lines.join("\n");
}

export function dailyCadenceTotal(cadence: PlanCadence | null | undefined): number {
  if (!cadence) return 0;
  return (
    (cadence.threadsPerDay ?? 0) +
    (cadence.linkedinPerDay ?? 0) +
    (cadence.instagramPerDay ?? 0)
  );
}

export function isContentPlanLockComplete(
  plan: ConversationContentPlan | null,
): boolean {
  if (!plan) return false;
  const hasDirection = Boolean(
    plan.direction?.trim() || plan.themes.some((theme) => theme.trim()),
  );
  return Boolean(
    hasDirection &&
      plan.platforms.length > 0 &&
      dailyCadenceTotal(plan.cadence) > 0 &&
      plan.startDate,
  );
}

export function plannedPostCount(plan: ConversationContentPlan | null): number {
  if (!plan) return 0;
  const namedItems = plan.acceptedItems.length;
  const remainingDays = plan.horizonDays;
  return Math.max(namedItems, dailyCadenceTotal(plan.cadence) * remainingDays);
}

export function isContentPlanPlatform(value: string): value is TargetPlatform {
  return (
    value === "threads" ||
    value === "linkedin_personal" ||
    value === "instagram"
  );
}

function clampHorizon(value: number): number {
  if (!Number.isFinite(value)) return 14;
  return Math.min(30, Math.max(1, Math.round(value)));
}
