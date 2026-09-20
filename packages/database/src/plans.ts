import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, lte, exists, notExists } from "drizzle-orm";
import type { Database } from "./client.js";
import { getOwnedConversation } from "./orchestration.js";
import { generationContexts, plans, planVersions, planComments, planRevisionBatches, workflowApprovals } from "./schema.js";
import { planAnchorText, planDocumentSchema, type PlanDocument } from "./plan-document.js";

type Db = Database["db"];
export class PlanWorkflowError extends Error {
  constructor(public readonly code: "PLAN_NOT_FOUND" | "STALE_VERSION" | "INVALID_DOCUMENT" | "INVALID_ANCHOR" | "INVALID_COMMENT" | "INVALID_BATCH" | "CONTEXT_NOT_FOUND" | "CONTENT_NOT_READY") {
    super(code);
  }
}
const id = (prefix: string) => `${prefix}_${randomUUID()}`;
function documentFrom(value: unknown): PlanDocument {
  const parsed = planDocumentSchema.safeParse(value);
  if (!parsed.success) throw new PlanWorkflowError("INVALID_DOCUMENT");
  return parsed.data;
}
async function ownPlan(db: Db, userId: string, planId: string, version?: number) {
  const [plan] = await db.select().from(plans).where(and(eq(plans.id, planId), eq(plans.userId, userId))).for("update");
  if (!plan) throw new PlanWorkflowError("PLAN_NOT_FOUND");
  if (version !== undefined && plan.currentVersion !== version) throw new PlanWorkflowError("STALE_VERSION");
  return plan;
}
async function ownContext(db: Db, userId: string, contextId: string | null) {
  if (!contextId) return;
  const [context] = await db.select({ id: generationContexts.id }).from(generationContexts)
    .where(and(eq(generationContexts.id, contextId), eq(generationContexts.userId, userId)));
  if (!context) throw new PlanWorkflowError("CONTEXT_NOT_FOUND");
}

export async function createPlan(db: Db, input: { userId: string; conversationId?: string | null; title: string; document: unknown; contextId: string | null }) {
  const document = documentFrom(input.document);
  if (!input.title.trim() || input.title.length > 200) throw new PlanWorkflowError("INVALID_DOCUMENT");
  return db.transaction(async tx => {
    const connection = tx as unknown as Db;
    if (input.conversationId && !await getOwnedConversation(connection, input.userId, input.conversationId)) throw new PlanWorkflowError("PLAN_NOT_FOUND");
    await ownContext(connection, input.userId, input.contextId);
    const [plan] = await tx.insert(plans).values({ id: id("plan"), userId: input.userId, conversationId: input.conversationId, title: input.title.trim() }).returning();
    const [version] = await tx.insert(planVersions).values({ id: id("pver"), planId: plan!.id, version: 1, document, contextId: input.contextId }).returning();
    return { plan: plan!, version: version! };
  });
}

/** Read document, comments and approvals from one snapshot while revisions may commit. */
export async function getPlan(db: Db, userId: string, planId: string, requestedVersion?: number) {
  if (requestedVersion !== undefined && (!Number.isSafeInteger(requestedVersion) || requestedVersion < 1)) throw new PlanWorkflowError("INVALID_DOCUMENT");
  return db.transaction(async tx => {
    const [plan] = await tx.select().from(plans).where(and(eq(plans.id, planId), eq(plans.userId, userId)));
    if (!plan) throw new PlanWorkflowError("PLAN_NOT_FOUND");
    const [version] = await tx.select().from(planVersions).where(and(eq(planVersions.planId, planId), eq(planVersions.version, requestedVersion ?? plan.currentVersion)));
    if (!version) throw new PlanWorkflowError("PLAN_NOT_FOUND");
    const comments = await tx.select().from(planComments).where(eq(planComments.planId, planId)).orderBy(planComments.createdAt);
    const approvals = await tx.select().from(workflowApprovals).where(and(eq(workflowApprovals.planId, planId), isNull(workflowApprovals.invalidatedAt)));
    const batches = await tx.select().from(planRevisionBatches).where(eq(planRevisionBatches.planId, planId)).orderBy(desc(planRevisionBatches.createdAt));
    return { plan, version, comments, approvals, batches: batches.map(({ claimToken: _token, ...batch }) => batch) };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function listPlans(db: Db, userId: string) {
  return db.select().from(plans).where(eq(plans.userId, userId)).orderBy(desc(plans.updatedAt)).limit(100);
}

type Anchor = { blockId: string; quote?: string | null; quoteContext?: string | null; rangeStart?: number | null; rangeEnd?: number | null };
function anchorMatches(anchors: Map<string, string>, anchor: Anchor) {
  const text = anchors.get(anchor.blockId);
  if (text === undefined) return false;
  if (anchor.quote != null && (!anchor.quote || !text.includes(anchor.quote))) return false;
  if (anchor.rangeStart != null || anchor.rangeEnd != null) {
    if (!Number.isInteger(anchor.rangeStart) || !Number.isInteger(anchor.rangeEnd) || anchor.rangeStart! < 0 || anchor.rangeEnd! <= anchor.rangeStart! || anchor.rangeEnd! > text.length || !anchor.quote) return false;
    if (text.slice(anchor.rangeStart!, anchor.rangeEnd!) !== anchor.quote) return false;
  }
  return !anchor.quoteContext || text.includes(anchor.quoteContext);
}

export async function addPlanComment(db: Db, input: { userId: string; planId: string; version: number; body: string } & Anchor) {
  if (!input.body.trim() || input.body.length > 4000) throw new PlanWorkflowError("INVALID_COMMENT");
  return db.transaction(async tx => {
    await ownPlan(tx as unknown as Db, input.userId, input.planId, input.version);
    const [version] = await tx.select().from(planVersions).where(and(eq(planVersions.planId, input.planId), eq(planVersions.version, input.version)));
    if (!version || !anchorMatches(planAnchorText(version.document), input)) throw new PlanWorkflowError("INVALID_ANCHOR");
    const [comment] = await tx.insert(planComments).values({
      id: id("pcomment"), planId: input.planId, version: input.version, body: input.body.trim(),
      blockId: input.blockId, quote: input.quote, quoteContext: input.quoteContext, rangeStart: input.rangeStart, rangeEnd: input.rangeEnd,
    }).returning();
    return comment!;
  });
}

export async function submitPlanComments(db: Db, input: { userId: string; planId: string; version: number; commentIds: string[] }) {
  if (!input.commentIds.length || input.commentIds.length > 200 || new Set(input.commentIds).size !== input.commentIds.length) throw new PlanWorkflowError("INVALID_BATCH");
  return db.transaction(async tx => {
    await ownPlan(tx as unknown as Db, input.userId, input.planId, input.version);
    const comments = await tx.select().from(planComments).where(and(eq(planComments.planId, input.planId), inArray(planComments.id, input.commentIds), eq(planComments.status, "pending")));
    const [version] = await tx.select().from(planVersions).where(and(eq(planVersions.planId, input.planId), eq(planVersions.version, input.version)));
    if (comments.length !== input.commentIds.length) throw new PlanWorkflowError("INVALID_BATCH");
    if (!version || comments.some(comment => !anchorMatches(planAnchorText(version.document), comment))) throw new PlanWorkflowError("INVALID_ANCHOR");
    const [batch] = await tx.insert(planRevisionBatches).values({ id: id("pbatch"), planId: input.planId, version: input.version, commentIds: input.commentIds }).returning();
    await tx.update(planComments).set({ status: "submitted", batchId: batch!.id }).where(inArray(planComments.id, input.commentIds));
    return { batch: batch!, comments };
  });
}

export async function revisePlan(db: Db, input: { userId: string; planId: string; expectedVersion: number; document: unknown; contextId: string | null; batchId?: string; claimToken?: string; handledCommentIds?: string[] }) {
  const document = documentFrom(input.document);
  return db.transaction(async tx => {
    const connection = tx as unknown as Db;
    await ownPlan(connection, input.userId, input.planId, input.expectedVersion);
    await ownContext(connection, input.userId, input.contextId);
    const [previous] = await tx.select().from(planVersions).where(and(eq(planVersions.planId, input.planId), eq(planVersions.version, input.expectedVersion)));
    if (!previous) throw new PlanWorkflowError("STALE_VERSION");
    for (const section of previous.document.sections) {
      if (document.sections.find(next => next.type === section.type)?.id !== section.id) throw new PlanWorkflowError("INVALID_DOCUMENT");
    }
    const oldAnchors = planAnchorText(previous.document);
    const newAnchors = planAnchorText(document);
    const handled = input.handledCommentIds ?? [];
    if (new Set(handled).size !== handled.length || (!input.batchId && handled.length)) throw new PlanWorkflowError("INVALID_BATCH");
    let submitted: typeof planComments.$inferSelect[] = [];
    if (input.batchId) {
      const [batch] = await tx.select().from(planRevisionBatches).where(and(eq(planRevisionBatches.id, input.batchId), eq(planRevisionBatches.planId, input.planId), eq(planRevisionBatches.version, input.expectedVersion), eq(planRevisionBatches.status, input.claimToken ? "running" : "submitted"))).for("update");
      if (batch && input.claimToken && (batch.claimToken !== input.claimToken || !batch.leaseExpiresAt || batch.leaseExpiresAt <= new Date())) throw new PlanWorkflowError("INVALID_BATCH");
      if (!batch) throw new PlanWorkflowError("INVALID_BATCH");
      submitted = batch.commentIds.length ? await tx.select().from(planComments).where(and(eq(planComments.planId, input.planId), inArray(planComments.id, batch.commentIds))) : [];
      if (handled.some(commentId => !submitted.some(comment => comment.id === commentId))) throw new PlanWorkflowError("INVALID_BATCH");
    }
    // Preserve IDs for unchanged blocks instead of detaching comments during a model rewrite.
    const fingerprint = (block: { id: string }) => {
      const { id: _id, ...content } = block;
      return JSON.stringify(content);
    };
    const elements = (doc: PlanDocument): Array<{ id: string }> => {
      const result: Array<{ id: string }> = [];
      for (const section of doc.sections) for (const block of section.blocks) {
        result.push(block);
        if (block.kind === "calendar") result.push(...block.items);
        if (block.kind === "sources") result.push(...block.sources);
      }
      return result;
    };
    const oldBlocks = elements(previous.document);
    const newBlocks = elements(document);
    for (const oldBlock of oldBlocks) {
      if (!newBlocks.some(block => block.id === oldBlock.id) && newBlocks.some(block => fingerprint(block) === fingerprint(oldBlock))) throw new PlanWorkflowError("INVALID_DOCUMENT");
    }
    const effectiveHandled = handled.filter(commentId => newAnchors.has(submitted.find(comment => comment.id === commentId)!.blockId));
    const changedBlockIds = [...new Set([...oldAnchors.keys(), ...newAnchors.keys()])].filter(key => oldAnchors.get(key) !== newAnchors.get(key));
    const nextVersion = input.expectedVersion + 1;
    const [version] = await tx.insert(planVersions).values({ id: id("pver"), planId: input.planId, version: nextVersion, parentVersion: input.expectedVersion, document, contextId: input.contextId, changedBlockIds, handledCommentIds: effectiveHandled }).returning();
    await tx.update(plans).set({ currentVersion: nextVersion, updatedAt: new Date() }).where(eq(plans.id, input.planId));
    await tx.update(workflowApprovals).set({ invalidatedAt: new Date(), invalidationReason: "Plan revised" }).where(and(eq(workflowApprovals.planId, input.planId), eq(workflowApprovals.scope, "plan_direction"), isNull(workflowApprovals.invalidatedAt)));
    const pending = await tx.select().from(planComments).where(and(eq(planComments.planId, input.planId), inArray(planComments.status, ["pending", "submitted"])));
    for (const comment of pending) {
      // A comment arriving after submission is never implicitly included or resolved.
      const addressed = effectiveHandled.includes(comment.id);
      const status = !newAnchors.has(comment.blockId) ? "needs_reattachment" : addressed ? "addressed" : anchorMatches(newAnchors, comment) ? "pending" : "needs_reattachment";
      await tx.update(planComments).set({ status }).where(eq(planComments.id, comment.id));
    }
    await tx.update(planRevisionBatches).set({ status: "stale" }).where(and(eq(planRevisionBatches.planId, input.planId), inArray(planRevisionBatches.status, ["submitted", "running"])));
    if (input.batchId) await tx.update(planRevisionBatches).set({ status: "applied", completedAt: new Date(), claimToken: null, leaseExpiresAt: null }).where(eq(planRevisionBatches.id, input.batchId));
    return version!;
  });
}

/** Direction approval grants no content approval or scheduling authority. */
export async function approvePlanDirection(db: Db, input: { userId: string; planId: string; version: number }) {
  return db.transaction(async tx => {
    await ownPlan(tx as unknown as Db, input.userId, input.planId, input.version);
    await tx.insert(workflowApprovals).values({ id: id("approval"), userId: input.userId, planId: input.planId, scope: "plan_direction", targetId: input.planId, revision: input.version }).onConflictDoNothing();
    const [approval] = await tx.select().from(workflowApprovals).where(and(eq(workflowApprovals.userId, input.userId), eq(workflowApprovals.targetId, input.planId), eq(workflowApprovals.scope, "plan_direction"), eq(workflowApprovals.revision, input.version)));
    return approval!;
  });
}

/** L4 stub: direction approval never generates captions. L5 owns creation. */
export async function refuseCreateContent(db: Db, input: { userId: string; planId: string; version: number }): Promise<never> {
  await ownPlan(db, input.userId, input.planId, input.version);
  throw new PlanWorkflowError("CONTENT_NOT_READY");
}

/** Claim one plan at a time; every plan mutation takes this same parent lock first. */
export async function claimPlanRevision(db: Db, leaseMs = 600_000) {
  return db.transaction(async tx => {
    const [plan] = await tx.select().from(plans).where(and(notExists(tx.select({ id: planRevisionBatches.id }).from(planRevisionBatches).where(and(eq(planRevisionBatches.planId, plans.id), eq(planRevisionBatches.status, "running")))), exists(tx.select({ id: planRevisionBatches.id }).from(planRevisionBatches).where(and(
      eq(planRevisionBatches.planId, plans.id), eq(planRevisionBatches.status, "submitted"), eq(planRevisionBatches.version, plans.currentVersion),
    ))))).orderBy(plans.updatedAt).limit(1).for("update", { skipLocked: true });
    if (!plan) return null;
    // Only one model request may run per plan, even if another comment batch arrived.
    const running = await tx.select({ id: planRevisionBatches.id }).from(planRevisionBatches).where(and(eq(planRevisionBatches.planId, plan.id), eq(planRevisionBatches.status, "running")));
    if (running.length) return null;
    const [batch] = await tx.select().from(planRevisionBatches).where(and(eq(planRevisionBatches.planId, plan.id), eq(planRevisionBatches.status, "submitted"))).orderBy(planRevisionBatches.createdAt).limit(1);
    if (!batch) return null;
    const [claimed] = await tx.update(planRevisionBatches).set({ status: "running", claimToken: id("pclaim"), leaseExpiresAt: new Date(Date.now() + leaseMs) }).where(eq(planRevisionBatches.id, batch.id)).returning();
    const [version] = await tx.select().from(planVersions).where(and(eq(planVersions.planId, plan.id), eq(planVersions.version, batch.version)));
    const comments = batch.commentIds.length ? await tx.select().from(planComments).where(and(eq(planComments.planId, plan.id), inArray(planComments.id, batch.commentIds))) : [];
    return { plan, version: version!, batch: claimed!, comments };
  });
}

/** Interrupted attempts need review, never an automatic duplicate model request. */
export async function finishPlanRevisionFailure(db: Db, input: { planId: string; batchId: string; claimToken: string; errorCode: string }) {
  return db.transaction(async tx => {
    const [plan] = await tx.select().from(plans).where(eq(plans.id, input.planId)).for("update");
    if (!plan) return false;
    const [batch] = await tx.update(planRevisionBatches).set({ status: "needs_attention", errorCode: input.errorCode, completedAt: new Date(), claimToken: null, leaseExpiresAt: null }).where(and(eq(planRevisionBatches.id, input.batchId), eq(planRevisionBatches.planId, input.planId), eq(planRevisionBatches.status, "running"), eq(planRevisionBatches.claimToken, input.claimToken))).returning();
    if (!batch) return false;
    await tx.update(planComments).set({ status: "pending" }).where(and(eq(planComments.batchId, batch.id), eq(planComments.status, "submitted")));
    return true;
  });
}

export async function recoverExpiredPlanRevisions(db: Db) {
  const expired = await db.select().from(planRevisionBatches).where(and(eq(planRevisionBatches.status, "running"), lte(planRevisionBatches.leaseExpiresAt, new Date()))).limit(50);
  for (const batch of expired) if (batch.claimToken) await finishPlanRevisionFailure(db, { planId: batch.planId, batchId: batch.id, claimToken: batch.claimToken, errorCode: "REVISION_INTERRUPTED" });
  return expired.length;
}

/** Append a new anchor while retaining the original comment and submitted batch history. */
export async function reattachPlanComment(db: Db, input: { userId: string; planId: string; commentId: string; version: number } & Anchor) {
  return db.transaction(async tx => {
    await ownPlan(tx as unknown as Db, input.userId, input.planId, input.version);
    const [original] = await tx.select().from(planComments).where(and(eq(planComments.planId, input.planId), eq(planComments.id, input.commentId)));
    if (!original) throw new PlanWorkflowError("INVALID_COMMENT");
    const [version] = await tx.select().from(planVersions).where(and(eq(planVersions.planId, input.planId), eq(planVersions.version, input.version)));
    if (!version || !anchorMatches(planAnchorText(version.document), input)) throw new PlanWorkflowError("INVALID_ANCHOR");
    const [existing] = await tx.select().from(planComments).where(eq(planComments.reattachedFromId, original.id));
    if (existing) {
      if (existing.version === input.version && existing.blockId === input.blockId && existing.quote === (input.quote ?? null) && existing.quoteContext === (input.quoteContext ?? null) && existing.rangeStart === (input.rangeStart ?? null) && existing.rangeEnd === (input.rangeEnd ?? null)) return existing;
      throw new PlanWorkflowError("INVALID_COMMENT");
    }
    if (original.status !== "needs_reattachment") throw new PlanWorkflowError("INVALID_COMMENT");
    const [comment] = await tx.insert(planComments).values({ id: id("pcomment"), planId: input.planId, version: input.version,
      blockId: input.blockId, quote: input.quote, quoteContext: input.quoteContext, rangeStart: input.rangeStart, rangeEnd: input.rangeEnd,
      body: original.body, reattachedFromId: original.id }).returning();
    await tx.update(planComments).set({ status: "reattached" }).where(eq(planComments.id, original.id));
    return comment!;
  });
}
