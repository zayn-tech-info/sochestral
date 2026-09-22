import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lte, exists, notExists } from "drizzle-orm";
import type { Database } from "./client.js";
import { PlanWorkflowError } from "./plan-errors.js";
import { planCalendarItems, type PlanCalendarItem, type PlanDocument } from "./plan-document.js";
import { contentGenerationJobs, contentItems, contentRevisions, plans, planVersions, workflowApprovals, planComments, planRevisionBatches, boardScheduleOperations } from "./schema.js";

type Db = Database["db"];
const id = (prefix: string) => `${prefix}_${randomUUID()}`;

export type PublicContentJob = Omit<typeof contentGenerationJobs.$inferSelect, "claimToken">;
export type PublicContentItem = typeof contentItems.$inferSelect & {
  revision: typeof contentRevisions.$inferSelect;
};

function latestRevisions(revisions: Array<typeof contentRevisions.$inferSelect>) {
  const byItem = new Map<string, typeof contentRevisions.$inferSelect>();
  for (const revision of revisions) {
    const current = byItem.get(revision.itemId);
    if (!current || revision.revision > current.revision) byItem.set(revision.itemId, revision);
  }
  return byItem;
}

function isDismissedMediaNote(value: string): boolean {
  const text = value.trim().toLowerCase().replace(/[.!]+$/g, "").replace(/\s+/g, " ");
  return /^(none|none required|n\/a|na|not required|no media|no image|nothing)(\b|$)/.test(text)
    || text.startsWith("none required")
    || text.startsWith("no media")
    || text.startsWith("not required");
}

export function contentBlockState(item: PlanCalendarItem, caption: string): { status: "blocked" | "ready"; blockReason: "missing_media" | "unverified_placeholder" | null } {
  const realNeeds = item.assetNeeds.filter(need => !isDismissedMediaNote(need));
  const needsMedia = item.format !== "text" || realNeeds.length > 0;
  if (needsMedia) return { status: "blocked", blockReason: "missing_media" };
  if (caption.includes("[") || /\bTODO\b/i.test(caption) || /unverified/i.test(caption)) {
    return { status: "blocked", blockReason: "unverified_placeholder" };
  }
  return { status: "ready", blockReason: null };
}

async function ownPlan(db: Db, userId: string, planId: string, version?: number) {
  const [plan] = await db.select().from(plans).where(and(eq(plans.id, planId), eq(plans.userId, userId))).for("update");
  if (!plan) throw new PlanWorkflowError("PLAN_NOT_FOUND");
  if (version !== undefined && plan.currentVersion !== version) throw new PlanWorkflowError("STALE_VERSION");
  return plan;
}

function publicJob(job: typeof contentGenerationJobs.$inferSelect): PublicContentJob {
  const { claimToken: _token, ...rest } = job;
  return rest;
}

export async function loadContentForVersion(db: Db, planId: string, planVersion: number): Promise<{
  contentJob: PublicContentJob | null;
  contentItems: PublicContentItem[];
}> {
  const [job] = await db.select().from(contentGenerationJobs).where(and(eq(contentGenerationJobs.planId, planId), eq(contentGenerationJobs.planVersion, planVersion)));
  const items = await db.select().from(contentItems).where(and(eq(contentItems.planId, planId), eq(contentItems.planVersion, planVersion)));
  const revisions = items.length
    ? await db.select().from(contentRevisions).where(inArray(contentRevisions.itemId, items.map(item => item.id)))
    : [];
  const byItem = latestRevisions(revisions);
  return {
    contentJob: job ? publicJob(job) : null,
    contentItems: items.flatMap(item => {
      const revision = byItem.get(item.id);
      return revision ? [{ ...item, revision }] : [];
    }),
  };
}

/** Enqueue one job per approved plan version. A second POST returns the existing job. */
export async function enqueueCreateContent(db: Db, input: { userId: string; planId: string; version: number }) {
  return db.transaction(async tx => {
    const connection = tx as unknown as Db;
    await ownPlan(connection, input.userId, input.planId, input.version);
    const [approval] = await tx.select({ id: workflowApprovals.id }).from(workflowApprovals).where(and(
      eq(workflowApprovals.userId, input.userId), eq(workflowApprovals.planId, input.planId),
      eq(workflowApprovals.scope, "plan_direction"), eq(workflowApprovals.revision, input.version),
      isNull(workflowApprovals.invalidatedAt),
    ));
    if (!approval) throw new PlanWorkflowError("DIRECTION_NOT_APPROVED");
    const [version] = await tx.select().from(planVersions).where(and(eq(planVersions.planId, input.planId), eq(planVersions.version, input.version)));
    if (!version) throw new PlanWorkflowError("PLAN_NOT_FOUND");
    if (!planCalendarItems(version.document).length) throw new PlanWorkflowError("NO_CALENDAR_ITEMS");
    const existing = await loadContentForVersion(connection, input.planId, input.version);
    const have = new Set(existing.contentItems.map(item => item.calendarItemId));
    const missing = planCalendarItems(version.document).some(item => !have.has(item.id));
    if (existing.contentJob && !missing) return existing;
    if (existing.contentJob && (existing.contentJob.status === "submitted" || existing.contentJob.status === "running")) return existing;
    if (existing.contentJob && missing) {
      const [retried] = await tx.update(contentGenerationJobs).set({
        status: "submitted", errorCode: null, completedAt: null, claimToken: null, leaseExpiresAt: null,
      }).where(and(
        eq(contentGenerationJobs.id, existing.contentJob.id),
        inArray(contentGenerationJobs.status, ["needs_attention", "applied"]),
        eq(contentGenerationJobs.planVersion, input.version),
      )).returning();
      if (retried) return { contentJob: publicJob(retried), contentItems: existing.contentItems };
    }
    if (existing.contentJob) return existing;
    await tx.insert(contentGenerationJobs).values({
      id: id("cjob"), userId: input.userId, planId: input.planId, planVersion: input.version,
    }).onConflictDoNothing({ target: [contentGenerationJobs.planId, contentGenerationJobs.planVersion] });
    const snapshot = await loadContentForVersion(connection, input.planId, input.version);
    if (!snapshot.contentJob) throw new PlanWorkflowError("PLAN_NOT_FOUND");
    return snapshot;
  });
}

export async function claimContentJob(db: Db, leaseMs = 600_000) {
  return db.transaction(async tx => {
    const [plan] = await tx.select().from(plans).where(and(
      notExists(tx.select({ id: contentGenerationJobs.id }).from(contentGenerationJobs).where(and(
        eq(contentGenerationJobs.planId, plans.id), eq(contentGenerationJobs.status, "running"),
      ))),
      exists(tx.select({ id: contentGenerationJobs.id }).from(contentGenerationJobs).where(and(
        eq(contentGenerationJobs.planId, plans.id), eq(contentGenerationJobs.status, "submitted"),
        eq(contentGenerationJobs.planVersion, plans.currentVersion),
      ))),
    )).orderBy(plans.updatedAt).limit(1).for("update", { skipLocked: true });
    if (!plan) return null;
    const running = await tx.select({ id: contentGenerationJobs.id }).from(contentGenerationJobs).where(and(
      eq(contentGenerationJobs.planId, plan.id), eq(contentGenerationJobs.status, "running"),
    ));
    if (running.length) return null;
    const [job] = await tx.select().from(contentGenerationJobs).where(and(
      eq(contentGenerationJobs.planId, plan.id), eq(contentGenerationJobs.status, "submitted"),
      eq(contentGenerationJobs.planVersion, plan.currentVersion),
    )).orderBy(contentGenerationJobs.createdAt).limit(1);
    if (!job) return null;
    const [claimed] = await tx.update(contentGenerationJobs).set({
      status: "running", claimToken: id("cclaim"), leaseExpiresAt: new Date(Date.now() + leaseMs),
    }).where(eq(contentGenerationJobs.id, job.id)).returning();
    const [version] = await tx.select().from(planVersions).where(and(eq(planVersions.planId, plan.id), eq(planVersions.version, job.planVersion)));
    return { plan, version: version!, job: claimed! };
  });
}

export async function finishContentJobFailure(db: Db, input: { planId: string; jobId: string; claimToken: string; errorCode: string }) {
  return db.transaction(async tx => {
    const [plan] = await tx.select().from(plans).where(eq(plans.id, input.planId)).for("update");
    if (!plan) return false;
    const [job] = await tx.update(contentGenerationJobs).set({
      status: "needs_attention", errorCode: input.errorCode, completedAt: new Date(), claimToken: null, leaseExpiresAt: null,
    }).where(and(
      eq(contentGenerationJobs.id, input.jobId), eq(contentGenerationJobs.planId, input.planId),
      eq(contentGenerationJobs.status, "running"), eq(contentGenerationJobs.claimToken, input.claimToken),
    )).returning();
    return Boolean(job);
  });
}

export async function recoverExpiredContentJobs(db: Db) {
  const expired = await db.select().from(contentGenerationJobs).where(and(
    eq(contentGenerationJobs.status, "running"), lte(contentGenerationJobs.leaseExpiresAt, new Date()),
  )).limit(50);
  for (const job of expired) {
    if (job.claimToken) await finishContentJobFailure(db, { planId: job.planId, jobId: job.id, claimToken: job.claimToken, errorCode: "CONTENT_INTERRUPTED" });
  }
  return expired.length;
}

export async function applyContentSet(db: Db, input: {
  userId: string;
  planId: string;
  jobId: string;
  claimToken: string;
  captions: Array<{ calendarItemId: string; caption: string }>;
  document: PlanDocument;
}) {
  const calendar = planCalendarItems(input.document);
  const byCalendar = new Map(calendar.map(item => [item.id, item]));
  const captionById = new Map<string, string>();
  for (const row of input.captions) {
    const caption = row.caption.trim();
    if (!byCalendar.has(row.calendarItemId) || !caption || caption.length > 10_000 || captionById.has(row.calendarItemId)) continue;
    captionById.set(row.calendarItemId, caption);
  }
  return db.transaction(async tx => {
    const [plan] = await tx.select().from(plans).where(and(eq(plans.id, input.planId), eq(plans.userId, input.userId))).for("update");
    if (!plan) throw new PlanWorkflowError("PLAN_NOT_FOUND");
    const [job] = await tx.select().from(contentGenerationJobs).where(and(
      eq(contentGenerationJobs.id, input.jobId), eq(contentGenerationJobs.planId, input.planId),
      eq(contentGenerationJobs.status, "running"), eq(contentGenerationJobs.claimToken, input.claimToken),
    )).for("update");
    if (!job || !job.leaseExpiresAt || job.leaseExpiresAt <= new Date() || job.planVersion !== plan.currentVersion) {
      throw new PlanWorkflowError("INVALID_CONTENT");
    }
    const existing = await tx.select({ calendarItemId: contentItems.calendarItemId }).from(contentItems).where(and(
      eq(contentItems.planId, input.planId), eq(contentItems.planVersion, job.planVersion),
    ));
    const have = new Set(existing.map(item => item.calendarItemId));
    const pending = calendar.filter(item => !have.has(item.id));
    const toInsert = pending.filter(item => captionById.has(item.id));
    if (!toInsert.length && pending.length) throw new PlanWorkflowError("INVALID_CONTENT");
    for (const item of toInsert) {
      const caption = captionById.get(item.id)!;
      const state = contentBlockState(item, caption);
      const [row] = await tx.insert(contentItems).values({
        id: id("citem"), userId: input.userId, planId: input.planId, planVersion: job.planVersion,
        calendarItemId: item.id, status: state.status,
      }).returning();
      await tx.insert(contentRevisions).values({
        id: id("crev"), userId: input.userId, itemId: row!.id, revision: 1, caption,
        destinations: item.destinations, format: item.format, assetNeeds: item.assetNeeds, blockReason: state.blockReason,
      });
    }
    await tx.update(contentGenerationJobs).set({
      status: "applied", completedAt: new Date(), claimToken: null, leaseExpiresAt: null, errorCode: null,
    }).where(eq(contentGenerationJobs.id, job.id));
  });
}

export async function setContentExcluded(db: Db, input: { userId: string; planId: string; version: number; itemId: string; excluded: boolean }) {
  return db.transaction(async tx => {
    await ownPlan(tx as unknown as Db, input.userId, input.planId, input.version);
    const [item] = await tx.select().from(contentItems).where(and(
      eq(contentItems.id, input.itemId), eq(contentItems.planId, input.planId), eq(contentItems.planVersion, input.version), eq(contentItems.userId, input.userId),
    ));
    if (!item) throw new PlanWorkflowError("INVALID_CONTENT");
    const [updated] = await tx.update(contentItems).set({ excludedAt: input.excluded ? new Date() : null }).where(eq(contentItems.id, item.id)).returning();
    return updated!;
  });
}

export async function applyContentReview(db: Db, input: {
  userId: string;
  planId: string;
  batchId: string;
  claimToken: string;
  captions: Array<{ itemId: string; caption: string }>;
  handledCommentIds: string[];
}) {
  const captions = input.captions.map(row => ({ itemId: row.itemId, caption: row.caption.trim() }));
  if (!captions.length || captions.some(row => !row.caption || row.caption.length > 10_000) || new Set(captions.map(row => row.itemId)).size !== captions.length) {
    throw new PlanWorkflowError("INVALID_CONTENT");
  }
  if (new Set(input.handledCommentIds).size !== input.handledCommentIds.length) throw new PlanWorkflowError("INVALID_BATCH");
  return db.transaction(async tx => {
    const [plan] = await tx.select().from(plans).where(and(eq(plans.id, input.planId), eq(plans.userId, input.userId))).for("update");
    if (!plan) throw new PlanWorkflowError("PLAN_NOT_FOUND");
    const [batch] = await tx.select().from(planRevisionBatches).where(and(
      eq(planRevisionBatches.id, input.batchId), eq(planRevisionBatches.planId, input.planId),
      eq(planRevisionBatches.kind, "content"), eq(planRevisionBatches.status, "running"), eq(planRevisionBatches.claimToken, input.claimToken),
    )).for("update");
    if (!batch || !batch.leaseExpiresAt || batch.leaseExpiresAt <= new Date() || batch.version !== plan.currentVersion) {
      throw new PlanWorkflowError("INVALID_BATCH");
    }
    const submitted = batch.commentIds.length
      ? await tx.select().from(planComments).where(and(eq(planComments.planId, input.planId), inArray(planComments.id, batch.commentIds)))
      : [];
    if (input.handledCommentIds.some(commentId => !submitted.some(comment => comment.id === commentId))) throw new PlanWorkflowError("INVALID_BATCH");
    const items = await tx.select().from(contentItems).where(and(eq(contentItems.planId, input.planId), eq(contentItems.planVersion, plan.currentVersion)));
    const byId = new Map(items.map(item => [item.id, item]));
    if (captions.some(row => !byId.has(row.itemId))) throw new PlanWorkflowError("INVALID_CONTENT");
    const scheduled = items.length
      ? await tx.select({ itemId: boardScheduleOperations.itemId }).from(boardScheduleOperations).where(and(
        inArray(boardScheduleOperations.itemId, items.map(item => item.id)), eq(boardScheduleOperations.status, "scheduled"),
      ))
      : [];
    const locked = new Set(scheduled.map(row => row.itemId));
    const [version] = await tx.select().from(planVersions).where(and(eq(planVersions.planId, input.planId), eq(planVersions.version, plan.currentVersion)));
    const calendar = new Map(planCalendarItems(version!.document).map(item => [item.id, item]));
    const existingRevisions = items.length
      ? await tx.select().from(contentRevisions).where(inArray(contentRevisions.itemId, items.map(item => item.id)))
      : [];
    const latest = latestRevisions(existingRevisions);
    for (const row of captions) {
      if (locked.has(row.itemId)) continue;
      const item = byId.get(row.itemId)!;
      const current = latest.get(row.itemId);
      if (!current) throw new PlanWorkflowError("INVALID_CONTENT");
      const calendarItem = calendar.get(item.calendarItemId);
      if (!calendarItem) throw new PlanWorkflowError("INVALID_CONTENT");
      const state = contentBlockState(calendarItem, row.caption);
      await tx.insert(contentRevisions).values({
        id: id("crev"), userId: input.userId, itemId: item.id, revision: current.revision + 1, caption: row.caption,
        destinations: current.destinations, format: current.format, assetNeeds: current.assetNeeds, blockReason: state.blockReason,
      });
      await tx.update(contentItems).set({ status: state.status }).where(eq(contentItems.id, item.id));
    }
    for (const comment of submitted) {
      const status = input.handledCommentIds.includes(comment.id) ? "addressed" : "pending";
      await tx.update(planComments).set({ status, batchId: status === "pending" ? null : comment.batchId }).where(eq(planComments.id, comment.id));
    }
    await tx.update(planRevisionBatches).set({ status: "applied", completedAt: new Date(), claimToken: null, leaseExpiresAt: null }).where(eq(planRevisionBatches.id, batch.id));
  });
}
