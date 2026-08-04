import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  createDraftId,
  createDraftPublishAttemptId,
  createReviewGroupId,
} from "./ids.js";
import {
  draftPublishAttempts,
  draftPublishAttemptMedia,
  draftMedia,
  drafts,
  mediaAssets,
  orchestrationConversations,
  type Draft,
  type DraftPublishAttempt,
  type DraftPublishAttemptStatus,
  type DraftPlatform,
} from "./schema.js";

export class ReviewDatabaseError extends Error {
  constructor(
    readonly code:
      | "REVIEW_NOT_FOUND"
      | "STALE_REVISION"
      | "DRAFT_LOCKED"
      | "PUBLISH_IN_PROGRESS"
      | "PUBLISH_RATE_LIMIT",
  ) {
    super(code);
    this.name = "ReviewDatabaseError";
  }
}

export type ReviewVariant = {
  platform: Exclude<DraftPlatform, "linkedin">;
  body: string;
  mediaUrls: string[];
  mediaAssetIds?: string[];
  validationErrors?: string[];
  validationWarnings?: string[];
};

export async function createReviewGroup(
  db: Database["db"],
  input: {
    userId: string;
    conversationId: string;
    variants: ReviewVariant[];
  },
): Promise<Draft[]> {
  return db.transaction(async (tx) => {
    const [conversation] = await tx
      .select({ id: orchestrationConversations.id })
      .from(orchestrationConversations)
      .where(
        and(
          eq(orchestrationConversations.id, input.conversationId),
          eq(orchestrationConversations.userId, input.userId),
        ),
      )
      .limit(1);
    if (!conversation) throw new ReviewDatabaseError("REVIEW_NOT_FOUND");
    const reviewGroupId = createReviewGroupId();
    const rows = await tx
      .insert(drafts)
      .values(
        input.variants.map((variant) => ({
          id: createDraftId(),
          userId: input.userId,
          conversationId: input.conversationId,
          reviewGroupId,
          platform: variant.platform,
          body: variant.body,
          mediaUrls: variant.mediaUrls,
          validationErrors: variant.validationErrors ?? [],
          validationWarnings: variant.validationWarnings ?? [],
        })),
      )
      .returning();
    const mediaValues = rows.flatMap((draft, index) => [
      ...(input.variants[index]?.mediaAssetIds ?? []).map((assetId, position) => ({
        draftId: draft.id,
        position,
        assetId,
      })),
      ...(input.variants[index]?.mediaUrls ?? []).map((externalUrl, urlIndex) => ({
        draftId: draft.id,
        position: (input.variants[index]?.mediaAssetIds?.length ?? 0) + urlIndex,
        externalUrl,
      })),
    ]);
    if (mediaValues.length > 0) await tx.insert(draftMedia).values(mediaValues);
    return rows;
  });
}

export async function listConversationReviewData(
  db: Database["db"],
  userId: string,
  conversationId: string,
): Promise<{
  drafts: Draft[];
  attempts: DraftPublishAttempt[];
  media: Array<{ draftId: string; position: number; assetId: string | null; externalUrl: string | null }>;
}> {
  const rows = await db
    .select({ draft: drafts })
    .from(drafts)
    .innerJoin(
      orchestrationConversations,
      eq(drafts.conversationId, orchestrationConversations.id),
    )
    .where(
      and(
        eq(drafts.conversationId, conversationId),
        eq(orchestrationConversations.userId, userId),
      ),
    )
    .orderBy(drafts.createdAt, drafts.id);
  const draftRows = rows.map((row) => row.draft);
  if (draftRows.length === 0) return { drafts: [], attempts: [], media: [] };
  const attempts = await db
    .select()
    .from(draftPublishAttempts)
    .where(
      and(
        eq(draftPublishAttempts.userId, userId),
        inArray(
          draftPublishAttempts.draftId,
          draftRows.map((draft) => draft.id),
        ),
      ),
    )
    .orderBy(desc(draftPublishAttempts.createdAt));
  const media = await db
    .select()
    .from(draftMedia)
    .where(inArray(draftMedia.draftId, draftRows.map((draft) => draft.id)))
    .orderBy(draftMedia.draftId, draftMedia.position);
  return { drafts: draftRows, attempts, media };
}

export async function getOwnedReviewDraft(
  db: Database["db"],
  userId: string,
  draftId: string,
): Promise<Draft | null> {
  const [row] = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listOwnedReviewGroup(
  db: Database["db"],
  userId: string,
  groupId: string,
): Promise<Draft[]> {
  return db
    .select()
    .from(drafts)
    .where(
      and(eq(drafts.userId, userId), eq(drafts.reviewGroupId, groupId)),
    )
    .orderBy(drafts.createdAt, drafts.id);
}

export async function listDraftMediaItems(
  db: Database["db"],
  draftIds: string[],
): Promise<Array<{ draftId: string; position: number; assetId: string | null; externalUrl: string | null }>> {
  if (draftIds.length === 0) return [];
  return db
    .select()
    .from(draftMedia)
    .where(inArray(draftMedia.draftId, draftIds))
    .orderBy(draftMedia.draftId, draftMedia.position);
}

export async function updateOwnedReviewDraft(
  db: Database["db"],
  input: {
    userId: string;
    draftId: string;
    expectedRevision: number;
    body: string;
    mediaUrls: string[];
    mediaItems?: Array<{ assetId: string | null; externalUrl: string | null }>;
    selectedAccountId: string | null;
    validationErrors: string[];
    validationWarnings: string[];
  },
): Promise<Draft> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(drafts)
      .where(and(eq(drafts.id, input.draftId), eq(drafts.userId, input.userId)))
      .for("update")
      .limit(1);
    if (!current?.reviewGroupId || !current.conversationId) {
      throw new ReviewDatabaseError("REVIEW_NOT_FOUND");
    }
    if (current.revision !== input.expectedRevision) {
      throw new ReviewDatabaseError("STALE_REVISION");
    }
    if (current.status === "published" || current.status === "unknown") {
      throw new ReviewDatabaseError("DRAFT_LOCKED");
    }
    const mediaItems = input.mediaItems ?? input.mediaUrls.map((externalUrl) => ({
      assetId: null,
      externalUrl,
    }));
    if (mediaItems.length > 5) {
      throw new ReviewDatabaseError("DRAFT_LOCKED");
    }
    const currentMedia = await tx
      .select()
      .from(draftMedia)
      .where(eq(draftMedia.draftId, current.id))
      .orderBy(draftMedia.position);
    const previousMedia = currentMedia.length > 0
      ? currentMedia.map((item) => ({ assetId: item.assetId, externalUrl: item.externalUrl }))
      : current.mediaUrls.map((externalUrl) => ({ assetId: null, externalUrl }));
    const assetIds = mediaItems.flatMap((item) => item.assetId ? [item.assetId] : []);
    if (new Set(assetIds).size !== assetIds.length) {
      throw new ReviewDatabaseError("REVIEW_NOT_FOUND");
    }
    if (assetIds.length > 0) {
      const ownedAssets = await tx
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.userId, input.userId),
            eq(mediaAssets.state, "ready"),
            inArray(mediaAssets.id, assetIds),
            sql`(${mediaAssets.conversationId} is null or ${mediaAssets.conversationId} = ${current.conversationId})`,
          ),
        );
      if (ownedAssets.length !== assetIds.length) {
        throw new ReviewDatabaseError("REVIEW_NOT_FOUND");
      }
    }
    const normalizedBody = input.body.trim();
    const changed =
      current.body.trim() !== normalizedBody ||
      JSON.stringify(previousMedia) !== JSON.stringify(mediaItems) ||
      current.selectedAccountId !== input.selectedAccountId;
    const revision = changed ? current.revision + 1 : current.revision;
    const [updated] = await tx
      .update(drafts)
      .set({
        body: normalizedBody,
        mediaUrls: input.mediaUrls,
        selectedAccountId: input.selectedAccountId,
        revision,
        validationErrors: input.validationErrors,
        validationWarnings: input.validationWarnings,
        validatedRevision:
          input.validationErrors.length === 0 ? revision : null,
        status: changed ? "draft" : current.status,
        lastError: null,
        updatedAt: changed ? new Date() : current.updatedAt,
      })
      .where(eq(drafts.id, current.id))
      .returning();
    if (!updated) throw new Error("Review draft update returned no row");
    await tx.delete(draftMedia).where(eq(draftMedia.draftId, current.id));
    if (mediaItems.length > 0) {
      await tx.insert(draftMedia).values(
        mediaItems.map((item, position) => ({
          draftId: current.id,
          position,
          assetId: item.assetId,
          externalUrl: item.externalUrl,
        })),
      );
    }
    if (assetIds.length > 0) {
      await tx
        .update(mediaAssets)
        .set({ conversationId: current.conversationId, updatedAt: new Date() })
        .where(inArray(mediaAssets.id, assetIds));
    }
    return updated;
  });
}

export async function replaceDraftValidation(
  db: Database["db"],
  draftId: string,
  input: { errors: string[]; warnings: string[] },
): Promise<Draft> {
  const [updated] = await db
    .update(drafts)
    .set({
      validationErrors: input.errors,
      validationWarnings: input.warnings,
      validatedRevision:
        input.errors.length === 0 ? drafts.revision : null,
    })
    .where(eq(drafts.id, draftId))
    .returning();
  if (!updated) throw new ReviewDatabaseError("REVIEW_NOT_FOUND");
  return updated;
}

export type AttemptSnapshot = {
  draftId: string;
  platform: "threads" | "linkedin_personal" | "instagram";
  body: string;
  mediaUrls: string[];
  selectedAccountId: string;
  revision: number;
  idempotencyKey: string;
};

export async function createPublishAttempts(
  db: Database["db"],
  input: {
    userId: string;
    approvalRequestId: string;
    snapshots: AttemptSnapshot[];
    hourlyLimit: number;
    authorizationKind?: "manual" | "approve_for_me" | "full_access";
    triggeringMessageId?: string | null;
    consentVersion?: string | null;
  },
): Promise<{ attempts: DraftPublishAttempt[]; replayed: boolean }> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`review:${input.userId}`}))`,
    );
    const existing = await tx
      .select()
      .from(draftPublishAttempts)
      .where(
        and(
          eq(draftPublishAttempts.userId, input.userId),
          eq(draftPublishAttempts.approvalRequestId, input.approvalRequestId),
        ),
      )
      .orderBy(draftPublishAttempts.createdAt);
    if (existing.length > 0) {
      const snapshots = new Map(
        input.snapshots.map((snapshot) => [
          snapshot.draftId,
          snapshot.revision,
        ]),
      );
      if (
        existing.length !== snapshots.size ||
        existing.some(
          (attempt) => snapshots.get(attempt.draftId) !== attempt.revision,
        )
      ) {
        throw new ReviewDatabaseError("PUBLISH_IN_PROGRESS");
      }
      return { attempts: existing, replayed: true };
    }

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const [usage] = await tx
      .select({ value: count() })
      .from(draftPublishAttempts)
      .where(
        and(
          eq(draftPublishAttempts.userId, input.userId),
          gt(draftPublishAttempts.createdAt, since),
        ),
      );
    if ((usage?.value ?? 0) + input.snapshots.length > input.hourlyLimit) {
      throw new ReviewDatabaseError("PUBLISH_RATE_LIMIT");
    }

    const draftIds = input.snapshots.map((snapshot) => snapshot.draftId);
    const active = draftIds.length
      ? await tx
          .select({ id: draftPublishAttempts.id })
          .from(draftPublishAttempts)
          .where(
            and(
              inArray(draftPublishAttempts.draftId, draftIds),
              eq(draftPublishAttempts.status, "publishing"),
            ),
          )
          .limit(1)
      : [];
    if (active.length > 0) {
      throw new ReviewDatabaseError("PUBLISH_IN_PROGRESS");
    }

    const attempts = await tx
      .insert(draftPublishAttempts)
      .values(
        input.snapshots.map((snapshot) => ({
          id: createDraftPublishAttemptId(),
          userId: input.userId,
          approvalRequestId: input.approvalRequestId,
          authorizationKind: input.authorizationKind ?? "manual",
          triggeringMessageId: input.triggeringMessageId ?? null,
          consentVersion: input.consentVersion ?? null,
          ...snapshot,
        })),
      )
      .returning();
    const sourceMedia = await tx
      .select()
      .from(draftMedia)
      .where(inArray(draftMedia.draftId, draftIds))
      .orderBy(draftMedia.draftId, draftMedia.position);
    const attemptByDraft = new Map(attempts.map((attempt) => [attempt.draftId, attempt.id]));
    const attemptMedia = sourceMedia.flatMap((item) => {
      const attemptId = attemptByDraft.get(item.draftId);
      return attemptId
        ? [{
            attemptId,
            position: item.position,
            assetId: item.assetId,
            externalUrl: item.externalUrl,
          }]
        : [];
    });
    if (attemptMedia.length > 0) {
      await tx.insert(draftPublishAttemptMedia).values(attemptMedia);
    }
    await tx
      .update(drafts)
      .set({ status: "publish_requested", updatedAt: new Date() })
      .where(inArray(drafts.id, draftIds));
    return { attempts, replayed: false };
  });
}

export async function finishPublishAttempt(
  db: Database["db"],
  input: {
    attemptId: string;
    status: Exclude<DraftPublishAttemptStatus, "publishing">;
    mcpPostId?: string | null;
    safeErrorCode?: string | null;
    safeErrorMessage?: string | null;
  },
): Promise<DraftPublishAttempt> {
  return db.transaction(async (tx) => {
    const [attempt] = await tx
      .update(draftPublishAttempts)
      .set({
        status: input.status,
        mcpPostId: input.mcpPostId ?? null,
        safeErrorCode: input.safeErrorCode ?? null,
        safeErrorMessage: input.safeErrorMessage ?? null,
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(eq(draftPublishAttempts.id, input.attemptId))
      .returning();
    if (!attempt) throw new ReviewDatabaseError("REVIEW_NOT_FOUND");
    await tx
      .update(drafts)
      .set({
        status:
          input.status === "succeeded"
            ? "published"
            : input.status === "unknown"
              ? "unknown"
              : "failed",
        mcpPostId: input.mcpPostId ?? null,
        lastError: input.safeErrorCode ?? null,
        updatedAt: new Date(),
      })
      .where(eq(drafts.id, attempt.draftId));
    return attempt;
  });
}

export async function getOwnedPublishAttempt(
  db: Database["db"],
  userId: string,
  attemptId: string,
): Promise<DraftPublishAttempt | null> {
  const [row] = await db
    .select()
    .from(draftPublishAttempts)
    .where(
      and(
        eq(draftPublishAttempts.id, attemptId),
        eq(draftPublishAttempts.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listOwnedAttemptsByApprovalRequestId(
  db: Database["db"],
  userId: string,
  approvalRequestId: string,
): Promise<DraftPublishAttempt[]> {
  return db
    .select()
    .from(draftPublishAttempts)
    .where(
      and(
        eq(draftPublishAttempts.userId, userId),
        eq(draftPublishAttempts.approvalRequestId, approvalRequestId),
      ),
    )
    .orderBy(draftPublishAttempts.createdAt, draftPublishAttempts.id);
}
