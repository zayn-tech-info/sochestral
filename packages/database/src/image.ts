import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  createBrandAssetId,
  createImageJobId,
  createImageJobInputId,
} from "./ids.js";
import {
  brandAssets,
  brandDesignBriefs,
  imageCreditWallets,
  imageJobInputs,
  imageJobs,
  mediaAssets,
  type BrandAsset,
  type BrandAssetKind,
  type BrandDesignBrief,
  type ImageJob,
  type ImageJobInput,
  type ImageJobInputRole,
  type ImageJobKind,
  type ImageJobStatus,
  type ImageSizePreset,
  type MediaAsset,
} from "./schema.js";
import type { Database } from "./client.js";

type Db = Database["db"];

export class ImageDatabaseError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "CONFLICT"
      | "INVALID"
      | "BUDGET_EXCEEDED"
      | "IN_FLIGHT"
      | "DISABLED",
    message: string,
  ) {
    super(message);
    this.name = "ImageDatabaseError";
  }
}

export const IMAGE_SIZE_PRESETS: Record<
  ImageSizePreset,
  { width: number; height: number }
> = {
  square: { width: 1024, height: 1024 },
  portrait_4_5: { width: 1080, height: 1350 },
  story_9_16: { width: 1080, height: 1920 },
  linkedin_landscape: { width: 1200, height: 627 },
};

export function isImageSizePreset(value: string): value is ImageSizePreset {
  return value in IMAGE_SIZE_PRESETS;
}

export function isBrandAssetKind(value: string): value is BrandAssetKind {
  return (
    value === "logo" ||
    value === "reference_image" ||
    value === "color" ||
    value === "design_note"
  );
}

export function isImageJobKind(value: string): value is ImageJobKind {
  return (
    value === "generate" ||
    value === "reframe" ||
    value === "vary" ||
    value === "prompt_edit"
  );
}

export function currentPeriodYm(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function listBrandAssets(
  db: Db,
  input: { userId: string; kind?: BrandAssetKind },
): Promise<BrandAsset[]> {
  const filters = [
    eq(brandAssets.userId, input.userId),
    isNull(brandAssets.archivedAt),
  ];
  if (input.kind) filters.push(eq(brandAssets.kind, input.kind));
  return db
    .select()
    .from(brandAssets)
    .where(and(...filters))
    .orderBy(asc(brandAssets.sortOrder), asc(brandAssets.createdAt));
}

export async function getOwnedBrandAsset(
  db: Db,
  userId: string,
  id: string,
): Promise<BrandAsset | null> {
  const [row] = await db
    .select()
    .from(brandAssets)
    .where(and(eq(brandAssets.id, id), eq(brandAssets.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function createBrandAsset(
  db: Db,
  input: {
    userId: string;
    kind: BrandAssetKind;
    name: string;
    mediaAssetId?: string | null;
    colorValue?: string | null;
    noteText?: string | null;
    sortOrder?: number;
  },
): Promise<BrandAsset> {
  const name = input.name.trim();
  if (!name) throw new ImageDatabaseError("INVALID", "name required");
  if (
    (input.kind === "logo" || input.kind === "reference_image") &&
    !input.mediaAssetId
  ) {
    throw new ImageDatabaseError("INVALID", "mediaAssetId required");
  }
  if (input.kind === "color" && !input.colorValue?.trim()) {
    throw new ImageDatabaseError("INVALID", "colorValue required");
  }
  if (input.kind === "design_note") {
    const note = input.noteText?.trim() ?? "";
    if (!note) throw new ImageDatabaseError("INVALID", "noteText required");
    if (note.length > 2000) {
      throw new ImageDatabaseError("INVALID", "noteText too long");
    }
  }
  if (input.mediaAssetId) {
    const [media] = await db
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, input.mediaAssetId),
          eq(mediaAssets.userId, input.userId),
          eq(mediaAssets.state, "ready"),
        ),
      )
      .limit(1);
    if (!media) throw new ImageDatabaseError("NOT_FOUND", "media not found");
  }
  const [row] = await db
    .insert(brandAssets)
    .values({
      id: createBrandAssetId(),
      userId: input.userId,
      kind: input.kind,
      name,
      mediaAssetId: input.mediaAssetId ?? null,
      colorValue: input.colorValue?.trim() || null,
      noteText: input.noteText?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  return row!;
}

export async function patchBrandAsset(
  db: Db,
  input: {
    userId: string;
    id: string;
    name?: string;
    sortOrder?: number;
    colorValue?: string | null;
    noteText?: string | null;
  },
): Promise<BrandAsset> {
  const existing = await getOwnedBrandAsset(db, input.userId, input.id);
  if (!existing || existing.archivedAt) {
    throw new ImageDatabaseError("NOT_FOUND", "brand asset not found");
  }
  const patch: Partial<BrandAsset> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new ImageDatabaseError("INVALID", "name required");
    patch.name = name;
  }
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.colorValue !== undefined) {
    patch.colorValue = input.colorValue?.trim() || null;
  }
  if (input.noteText !== undefined) {
    const note = input.noteText?.trim() || null;
    if (note && note.length > 2000) {
      throw new ImageDatabaseError("INVALID", "noteText too long");
    }
    patch.noteText = note;
  }
  const [row] = await db
    .update(brandAssets)
    .set(patch)
    .where(and(eq(brandAssets.id, input.id), eq(brandAssets.userId, input.userId)))
    .returning();
  if (!row) throw new ImageDatabaseError("NOT_FOUND", "brand asset not found");
  return row;
}

export async function archiveBrandAsset(
  db: Db,
  userId: string,
  id: string,
): Promise<BrandAsset> {
  const [row] = await db
    .update(brandAssets)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(brandAssets.id, id),
        eq(brandAssets.userId, userId),
        isNull(brandAssets.archivedAt),
      ),
    )
    .returning();
  if (!row) throw new ImageDatabaseError("NOT_FOUND", "brand asset not found");
  return row;
}

export type ImageJobInputSpec = {
  mediaAssetId?: string;
  brandAssetId?: string;
  role: ImageJobInputRole;
};

export async function isImageJobResultAsset(
  db: Db,
  userId: string,
  assetId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: imageJobs.id })
    .from(imageJobs)
    .where(
      and(
        eq(imageJobs.userId, userId),
        or(
          eq(imageJobs.resultMediaAssetId, assetId),
          eq(imageJobs.sourceMediaAssetId, assetId),
          sql`${imageJobs.resultMediaAssetIds} @> ${JSON.stringify([assetId])}::jsonb`,
        ),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function getOwnedImageJob(
  db: Db,
  userId: string,
  id: string,
): Promise<ImageJob | null> {
  const [row] = await db
    .select()
    .from(imageJobs)
    .where(and(eq(imageJobs.id, id), eq(imageJobs.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getImageJobByRequestId(
  db: Db,
  userId: string,
  requestId: string,
): Promise<ImageJob | null> {
  const [row] = await db
    .select()
    .from(imageJobs)
    .where(
      and(eq(imageJobs.userId, userId), eq(imageJobs.requestId, requestId)),
    )
    .limit(1);
  return row ?? null;
}

export function listImageJobInputs(
  db: Db,
  jobId: string,
): Promise<ImageJobInput[]> {
  return db
    .select()
    .from(imageJobInputs)
    .where(eq(imageJobInputs.jobId, jobId))
    .orderBy(asc(imageJobInputs.position));
}

export async function listRecentImageJobs(
  db: Db,
  input: { userId: string; limit: number; cursor?: string },
): Promise<{ items: ImageJob[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(input.limit, 1), 50);
  const filters = [eq(imageJobs.userId, input.userId)];
  if (input.cursor) {
    const [cursorRow] = await db
      .select()
      .from(imageJobs)
      .where(
        and(eq(imageJobs.id, input.cursor), eq(imageJobs.userId, input.userId)),
      )
      .limit(1);
    if (cursorRow) {
      filters.push(
        or(
          lt(imageJobs.createdAt, cursorRow.createdAt),
          and(
            eq(imageJobs.createdAt, cursorRow.createdAt),
            lt(imageJobs.id, cursorRow.id),
          ),
        )!,
      );
    }
  }
  const rows = await db
    .select()
    .from(imageJobs)
    .where(and(...filters))
    .orderBy(desc(imageJobs.createdAt), desc(imageJobs.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit);
  const nextCursor =
    rows.length > limit ? (items[items.length - 1]?.id ?? null) : null;
  return { items, nextCursor };
}

export async function listSucceededGenerations(
  db: Db,
  userId: string,
  limit = 12,
): Promise<ImageJob[]> {
  return db
    .select()
    .from(imageJobs)
    .where(
      and(
        eq(imageJobs.userId, userId),
        eq(imageJobs.status, "succeeded"),
        sql`${imageJobs.resultMediaAssetId} is not null`,
      ),
    )
    .orderBy(desc(imageJobs.completedAt), desc(imageJobs.id))
    .limit(limit);
}

export async function countInFlightJobs(
  db: Db,
  userId: string,
): Promise<number> {
  const rows = await db
    .select({ id: imageJobs.id })
    .from(imageJobs)
    .where(
      and(
        eq(imageJobs.userId, userId),
        inArray(imageJobs.status, ["queued", "running"]),
      ),
    );
  return rows.length;
}

export async function getOrCreateWallet(
  db: Db,
  userId: string,
  periodYm = currentPeriodYm(),
) {
  const [existing] = await db
    .select()
    .from(imageCreditWallets)
    .where(
      and(
        eq(imageCreditWallets.userId, userId),
        eq(imageCreditWallets.periodYm, periodYm),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(imageCreditWallets)
    .values({ userId, periodYm, creditsUsed: 0 })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await db
    .select()
    .from(imageCreditWallets)
    .where(
      and(
        eq(imageCreditWallets.userId, userId),
        eq(imageCreditWallets.periodYm, periodYm),
      ),
    )
    .limit(1);
  return again!;
}

export async function chargeCredits(
  db: Db,
  input: { userId: string; credits: number; budget: number },
): Promise<{ creditsUsed: number; remaining: number }> {
  if (input.credits < 0) {
    throw new ImageDatabaseError("INVALID", "credits must be >= 0");
  }
  const periodYm = currentPeriodYm();
  await getOrCreateWallet(db, input.userId, periodYm);
  if (input.credits === 0) {
    const wallet = await getOrCreateWallet(db, input.userId, periodYm);
    return {
      creditsUsed: wallet.creditsUsed,
      remaining: Math.max(0, input.budget - wallet.creditsUsed),
    };
  }
  const [updated] = await db
    .update(imageCreditWallets)
    .set({
      creditsUsed: sql`${imageCreditWallets.creditsUsed} + ${input.credits}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(imageCreditWallets.userId, input.userId),
        eq(imageCreditWallets.periodYm, periodYm),
        sql`${imageCreditWallets.creditsUsed} + ${input.credits} <= ${input.budget}`,
      ),
    )
    .returning();
  if (!updated) {
    throw new ImageDatabaseError("BUDGET_EXCEEDED", "monthly credit budget exceeded");
  }
  return {
    creditsUsed: updated.creditsUsed,
    remaining: Math.max(0, input.budget - updated.creditsUsed),
  };
}

export async function refundCredits(
  db: Db,
  input: { userId: string; credits: number },
): Promise<void> {
  if (input.credits <= 0) return;
  const periodYm = currentPeriodYm();
  await db
    .update(imageCreditWallets)
    .set({
      creditsUsed: sql`GREATEST(0, ${imageCreditWallets.creditsUsed} - ${input.credits})`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(imageCreditWallets.userId, input.userId),
        eq(imageCreditWallets.periodYm, periodYm),
      ),
    );
}

export async function createPendingImageJob(
  db: Db,
  input: {
    userId: string;
    kind: ImageJobKind;
    prompt?: string | null;
    sizePreset: ImageSizePreset;
    sourceMediaAssetId?: string | null;
    conversationId?: string | null;
    requestId?: string | null;
    provider: string;
    model: string;
    estimatedCostCents: number;
    creditsCharged: number;
    variantCount?: number;
    inputs: ImageJobInputSpec[];
  },
): Promise<{ job: ImageJob; inputs: ImageJobInput[] }> {
  if (input.requestId) {
    const existing = await getImageJobByRequestId(
      db,
      input.userId,
      input.requestId,
    );
    if (existing) {
      const inputs = await listImageJobInputs(db, existing.id);
      return { job: existing, inputs };
    }
  }
  if (input.prompt && input.prompt.length > 8000) {
    throw new ImageDatabaseError("INVALID", "prompt too long");
  }
  if (input.sourceMediaAssetId) {
    const [media] = await db
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, input.sourceMediaAssetId),
          eq(mediaAssets.userId, input.userId),
          eq(mediaAssets.state, "ready"),
        ),
      )
      .limit(1);
    if (!media) throw new ImageDatabaseError("NOT_FOUND", "source media not found");
  }
  const dims = IMAGE_SIZE_PRESETS[input.sizePreset];
  const jobId = createImageJobId();
  const inputRows: ImageJobInput[] = [];

  await db.transaction(async (tx) => {
    const [job] = await tx
      .insert(imageJobs)
      .values({
        id: jobId,
        userId: input.userId,
        conversationId: input.conversationId ?? null,
        requestId: input.requestId ?? null,
        kind: input.kind,
        status: "pending_confirm",
        prompt: input.prompt?.trim() || null,
        sizePreset: input.sizePreset,
        width: dims.width,
        height: dims.height,
        sourceMediaAssetId: input.sourceMediaAssetId ?? null,
        provider: input.provider,
        model: input.model,
        estimatedCostCents: input.estimatedCostCents,
        creditsCharged: input.creditsCharged,
        variantCount: input.variantCount ?? 1,
        resultMediaAssetIds: [],
      })
      .returning();
    if (!job) throw new ImageDatabaseError("INVALID", "failed to create job");

    for (let i = 0; i < input.inputs.length; i++) {
      const spec = input.inputs[i]!;
      if (!spec.mediaAssetId && !spec.brandAssetId) {
        throw new ImageDatabaseError("INVALID", "input source required");
      }
      if (spec.mediaAssetId && spec.brandAssetId) {
        throw new ImageDatabaseError("INVALID", "exactly one input source");
      }
      if (spec.mediaAssetId) {
        const [media] = await tx
          .select()
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.id, spec.mediaAssetId),
              eq(mediaAssets.userId, input.userId),
              eq(mediaAssets.state, "ready"),
            ),
          )
          .limit(1);
        if (!media) {
          throw new ImageDatabaseError("NOT_FOUND", "reference media not found");
        }
      }
      if (spec.brandAssetId) {
        const [brand] = await tx
          .select()
          .from(brandAssets)
          .where(
            and(
              eq(brandAssets.id, spec.brandAssetId),
              eq(brandAssets.userId, input.userId),
              isNull(brandAssets.archivedAt),
            ),
          )
          .limit(1);
        if (!brand) {
          throw new ImageDatabaseError("NOT_FOUND", "brand asset not found");
        }
      }
      const [row] = await tx
        .insert(imageJobInputs)
        .values({
          id: createImageJobInputId(),
          jobId,
          position: i,
          mediaAssetId: spec.mediaAssetId ?? null,
          brandAssetId: spec.brandAssetId ?? null,
          role: spec.role,
        })
        .returning();
      inputRows.push(row!);
    }
  });

  const job = (await getOwnedImageJob(db, input.userId, jobId))!;
  return { job, inputs: inputRows };
}

export async function confirmImageJob(
  db: Db,
  input: {
    userId: string;
    jobId: string;
    requestId?: string | null;
    sizePreset?: ImageSizePreset;
    brandAssetIds?: string[];
    variantCount?: number;
    creditsCharged?: number;
    estimatedCostCents?: number;
    referenceCap?: number;
    budget: number;
  },
): Promise<ImageJob> {
  const job = await getOwnedImageJob(db, input.userId, input.jobId);
  if (!job) throw new ImageDatabaseError("NOT_FOUND", "job not found");
  if (
    job.status === "queued" ||
    job.status === "running" ||
    job.status === "succeeded"
  ) {
    return job;
  }
  if (job.status !== "pending_confirm") {
    throw new ImageDatabaseError("CONFLICT", "job not confirmable");
  }
  const ageMs = Date.now() - job.createdAt.getTime();
  if (ageMs > 30 * 60 * 1000) {
    await db
      .update(imageJobs)
      .set({
        status: "cancelled",
        completedAt: new Date(),
        errorCode: "EXPIRED",
        errorMessage: "proposal expired",
      })
      .where(eq(imageJobs.id, job.id));
    throw new ImageDatabaseError("CONFLICT", "proposal expired");
  }
  if ((await countInFlightJobs(db, input.userId)) > 0) {
    throw new ImageDatabaseError("IN_FLIGHT", "another image job is in flight");
  }

  let sizePreset = job.sizePreset as ImageSizePreset;
  let width = job.width;
  let height = job.height;
  if (input.sizePreset) {
    sizePreset = input.sizePreset;
    const dims = IMAGE_SIZE_PRESETS[sizePreset];
    width = dims.width;
    height = dims.height;
  }

  if (input.brandAssetIds) {
    const cap = input.referenceCap ?? 5;
    const existing = await listImageJobInputs(db, job.id);
    const refs = existing.filter((row) => row.role === "reference");
    if (refs.length + input.brandAssetIds.length > cap) {
      throw new ImageDatabaseError("INVALID", "too many references");
    }
    await db
      .delete(imageJobInputs)
      .where(
        and(
          eq(imageJobInputs.jobId, job.id),
          eq(imageJobInputs.role, "brand"),
        ),
      );
    let position = refs.length;
    for (const brandAssetId of input.brandAssetIds) {
      const brand = await getOwnedBrandAsset(db, input.userId, brandAssetId);
      if (!brand || brand.archivedAt) {
        throw new ImageDatabaseError("NOT_FOUND", "brand asset not found");
      }
      await db.insert(imageJobInputs).values({
        id: createImageJobInputId(),
        jobId: job.id,
        position,
        brandAssetId,
        mediaAssetId: null,
        role: "brand",
      });
      position += 1;
    }
  }

  await chargeCredits(db, {
    userId: input.userId,
    credits: input.creditsCharged ?? job.creditsCharged,
    budget: input.budget,
  });

  const [updated] = await db
    .update(imageJobs)
    .set({
      status: "queued",
      sizePreset,
      width,
      height,
      requestId: input.requestId ?? job.requestId,
      variantCount: input.variantCount ?? job.variantCount,
      creditsCharged: input.creditsCharged ?? job.creditsCharged,
      estimatedCostCents: input.estimatedCostCents ?? job.estimatedCostCents,
    })
    .where(
      and(
        eq(imageJobs.id, job.id),
        eq(imageJobs.userId, input.userId),
        eq(imageJobs.status, "pending_confirm"),
      ),
    )
    .returning();
  if (!updated) {
    await refundCredits(db, {
      userId: input.userId,
      credits: input.creditsCharged ?? job.creditsCharged,
    });
    throw new ImageDatabaseError("CONFLICT", "job not confirmable");
  }
  return updated;
}

export async function cancelImageJob(
  db: Db,
  userId: string,
  jobId: string,
): Promise<ImageJob> {
  const job = await getOwnedImageJob(db, userId, jobId);
  if (!job) throw new ImageDatabaseError("NOT_FOUND", "job not found");
  if (job.status !== "pending_confirm" && job.status !== "queued") {
    throw new ImageDatabaseError("CONFLICT", "job not cancellable");
  }
  if (job.status === "queued" && job.creditsCharged > 0) {
    await refundCredits(db, { userId, credits: job.creditsCharged });
  }
  const [updated] = await db
    .update(imageJobs)
    .set({
      status: "cancelled",
      completedAt: new Date(),
      creditsCharged: job.status === "queued" ? 0 : job.creditsCharged,
    })
    .where(
      and(
        eq(imageJobs.id, jobId),
        eq(imageJobs.userId, userId),
        inArray(imageJobs.status, ["pending_confirm", "queued"]),
      ),
    )
    .returning();
  if (!updated) throw new ImageDatabaseError("CONFLICT", "job not cancellable");
  return updated;
}

export async function claimNextQueuedJob(db: Db): Promise<ImageJob | null> {
  return db.transaction(async (tx) => {
    const [next] = await tx
      .select()
      .from(imageJobs)
      .where(eq(imageJobs.status, "queued"))
      .orderBy(asc(imageJobs.createdAt), asc(imageJobs.id))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!next) return null;
    const [claimed] = await tx
      .update(imageJobs)
      .set({ status: "running", startedAt: new Date() })
      .where(
        and(eq(imageJobs.id, next.id), eq(imageJobs.status, "queued")),
      )
      .returning();
    return claimed ?? null;
  });
}

export async function markImageJobSucceeded(
  db: Db,
  input: {
    jobId: string;
    userId: string;
    resultMediaAssetId: string;
    resultMediaAssetIds?: string[];
  },
): Promise<ImageJob> {
  const ids =
    input.resultMediaAssetIds && input.resultMediaAssetIds.length > 0
      ? input.resultMediaAssetIds
      : [input.resultMediaAssetId];
  const [row] = await db
    .update(imageJobs)
    .set({
      status: "succeeded",
      resultMediaAssetId: ids[0] ?? input.resultMediaAssetId,
      resultMediaAssetIds: ids,
      completedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    })
    .where(
      and(
        eq(imageJobs.id, input.jobId),
        eq(imageJobs.userId, input.userId),
        eq(imageJobs.status, "running"),
      ),
    )
    .returning();
  if (!row) throw new ImageDatabaseError("CONFLICT", "job not running");
  return row;
}

export async function markImageJobFailed(
  db: Db,
  input: {
    jobId: string;
    userId: string;
    errorCode: string;
    errorMessage: string;
    refund: boolean;
  },
): Promise<ImageJob> {
  const job = await getOwnedImageJob(db, input.userId, input.jobId);
  if (!job) throw new ImageDatabaseError("NOT_FOUND", "job not found");
  if (input.refund && job.creditsCharged > 0) {
    await refundCredits(db, {
      userId: input.userId,
      credits: job.creditsCharged,
    });
  }
  const [row] = await db
    .update(imageJobs)
    .set({
      status: "failed",
      completedAt: new Date(),
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      creditsCharged: input.refund ? 0 : job.creditsCharged,
    })
    .where(
      and(
        eq(imageJobs.id, input.jobId),
        eq(imageJobs.userId, input.userId),
        inArray(imageJobs.status, ["queued", "running"]),
      ),
    )
    .returning();
  if (!row) throw new ImageDatabaseError("CONFLICT", "job not failable");
  return row;
}

export async function reclaimStaleRunningJobs(
  db: Db,
  reclaimMs: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - reclaimMs);
  const stale = await db
    .select()
    .from(imageJobs)
    .where(
      and(
        eq(imageJobs.status, "running"),
        lt(imageJobs.startedAt, cutoff),
      ),
    );
  for (const job of stale) {
    await markImageJobFailed(db, {
      jobId: job.id,
      userId: job.userId,
      errorCode: "RECLAIMED",
      errorMessage: "job timed out",
      refund: true,
    });
  }
  return stale.length;
}

export function computeBrandSourceHash(assets: BrandAsset[]): string {
  const lines = [...assets]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((asset) =>
      [
        asset.id,
        asset.kind,
        asset.updatedAt.toISOString(),
        asset.colorValue ?? "",
        asset.noteText ?? "",
        asset.mediaAssetId ?? "",
      ].join("|"),
    );
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

export function pickBrandCompilePack(
  assets: BrandAsset[],
  cap = 8,
): BrandAsset[] {
  const logos = assets
    .filter((item) => item.kind === "logo" && item.mediaAssetId)
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    );
  const refs = assets
    .filter((item) => item.kind === "reference_image" && item.mediaAssetId)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const picked: BrandAsset[] = [];
  const seen = new Set<string>();
  for (const item of [...logos.slice(0, 1), ...refs]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    picked.push(item);
    if (picked.length >= cap) break;
  }
  return picked;
}

export function pickBrandJobExemplars(assets: BrandAsset[]): BrandAsset[] {
  const logo = assets
    .filter((item) => item.kind === "logo" && item.mediaAssetId)
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    )[0];
  const refs = assets
    .filter(
      (item) =>
        item.kind === "reference_image" &&
        item.mediaAssetId &&
        item.id !== logo?.id,
    )
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 2);
  return [...(logo ? [logo] : []), ...refs];
}

export function fallbackBrandBriefText(assets: BrandAsset[]): string {
  const colors = assets.filter((item) => item.kind === "color" && item.colorValue);
  const notes = assets.filter((item) => item.kind === "design_note" && item.noteText);
  const lines = [
    "Brand design system:",
    ...colors.map((item) => `- Color ${item.name}: ${item.colorValue}`),
    ...notes.map((item) => `- Note: ${item.noteText}`),
  ];
  if (lines.length === 1) {
    lines.push("- Follow uploaded logo and reference images closely.");
  }
  return lines.join("\n").slice(0, 4000);
}

export async function getBrandDesignBrief(
  db: Db,
  userId: string,
): Promise<BrandDesignBrief | null> {
  const [row] = await db
    .select()
    .from(brandDesignBriefs)
    .where(eq(brandDesignBriefs.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function scheduleBrandBriefCompile(
  db: Db,
  userId: string,
): Promise<{ scheduled: boolean; hash: string; brief: BrandDesignBrief | null }> {
  const assets = await listBrandAssets(db, { userId });
  const hash = computeBrandSourceHash(assets);
  const existing = await getBrandDesignBrief(db, userId);
  if (existing?.status === "ready" && existing.sourceHash === hash) {
    return { scheduled: false, hash, brief: existing };
  }
  const now = new Date();
  if (existing) {
    const [row] = await db
      .update(brandDesignBriefs)
      .set({
        sourceHash: hash,
        status: "pending",
        pendingAt: now,
        errorCode: null,
        updatedAt: now,
      })
      .where(eq(brandDesignBriefs.userId, userId))
      .returning();
    return { scheduled: true, hash, brief: row ?? existing };
  }
  const [row] = await db
    .insert(brandDesignBriefs)
    .values({
      userId,
      sourceHash: hash,
      status: "pending",
      pendingAt: now,
    })
    .returning();
  return { scheduled: true, hash, brief: row ?? null };
}

export async function claimDueBrandBriefCompile(
  db: Db,
  debounceMs: number,
): Promise<BrandDesignBrief | null> {
  const cutoff = new Date(Date.now() - debounceMs);
  const [row] = await db
    .select()
    .from(brandDesignBriefs)
    .where(
      and(
        eq(brandDesignBriefs.status, "pending"),
        lt(brandDesignBriefs.pendingAt, cutoff),
      ),
    )
    .orderBy(asc(brandDesignBriefs.pendingAt))
    .limit(1);
  return row ?? null;
}

export async function markBrandBriefReady(
  db: Db,
  input: { userId: string; sourceHash: string; briefText: string },
): Promise<BrandDesignBrief> {
  const now = new Date();
  const [row] = await db
    .update(brandDesignBriefs)
    .set({
      briefText: input.briefText.slice(0, 4000),
      sourceHash: input.sourceHash,
      status: "ready",
      compiledAt: now,
      pendingAt: null,
      errorCode: null,
      updatedAt: now,
    })
    .where(eq(brandDesignBriefs.userId, input.userId))
    .returning();
  if (!row) throw new ImageDatabaseError("NOT_FOUND", "brand brief not found");
  return row;
}

export async function markBrandBriefFailed(
  db: Db,
  input: { userId: string; sourceHash: string; errorCode: string },
): Promise<BrandDesignBrief> {
  const now = new Date();
  const [row] = await db
    .update(brandDesignBriefs)
    .set({
      sourceHash: input.sourceHash,
      status: "failed",
      pendingAt: null,
      errorCode: input.errorCode.slice(0, 64),
      updatedAt: now,
    })
    .where(eq(brandDesignBriefs.userId, input.userId))
    .returning();
  if (!row) throw new ImageDatabaseError("NOT_FOUND", "brand brief not found");
  return row;
}

export type { BrandAsset, BrandDesignBrief, ImageJob, ImageJobInput, MediaAsset, ImageJobStatus };
