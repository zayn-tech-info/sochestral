import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { createCampaignJobId } from "./ids.js";
import {
  campaignJobs,
  type CampaignJob,
  type CampaignJobStatus,
} from "./schema.js";
import type { Database } from "./client.js";

type Db = Database["db"];

const IN_FLIGHT: CampaignJobStatus[] = ["queued", "running", "paused"];
const TERMINAL: CampaignJobStatus[] = ["succeeded", "stopped", "failed"];

export class CampaignDatabaseError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "CONFLICT" | "IN_FLIGHT",
    message: string,
  ) {
    super(message);
    this.name = "CampaignDatabaseError";
  }
}

export async function getInFlightCampaignJob(
  db: Db,
  userId: string,
): Promise<CampaignJob | null> {
  const [row] = await db
    .select()
    .from(campaignJobs)
    .where(
      and(
        eq(campaignJobs.userId, userId),
        inArray(campaignJobs.status, IN_FLIGHT),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getLatestCampaignJob(
  db: Db,
  userId: string,
): Promise<CampaignJob | null> {
  const inFlight = await getInFlightCampaignJob(db, userId);
  if (inFlight) return inFlight;
  const [row] = await db
    .select()
    .from(campaignJobs)
    .where(eq(campaignJobs.userId, userId))
    .orderBy(desc(campaignJobs.createdAt), desc(campaignJobs.id))
    .limit(1);
  return row ?? null;
}

export async function getOwnedCampaignJob(
  db: Db,
  userId: string,
  id: string,
): Promise<CampaignJob | null> {
  const [row] = await db
    .select()
    .from(campaignJobs)
    .where(and(eq(campaignJobs.id, id), eq(campaignJobs.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function enqueueCampaignJob(
  db: Db,
  input: {
    userId: string;
    conversationId: string;
    planId: string;
    nextDate: string;
    cap: number;
  },
): Promise<CampaignJob> {
  const existing = await getInFlightCampaignJob(db, input.userId);
  if (existing) {
    throw new CampaignDatabaseError(
      "IN_FLIGHT",
      "A campaign is already in flight",
    );
  }
  const [row] = await db
    .insert(campaignJobs)
    .values({
      id: createCampaignJobId(),
      userId: input.userId,
      conversationId: input.conversationId,
      planId: input.planId,
      status: "queued",
      cap: Math.min(30, Math.max(1, input.cap)),
      bookedCount: 0,
      nextDate: input.nextDate,
      dayAttempts: 0,
      bookedPublishAts: [],
    })
    .returning();
  return row!;
}

export async function claimNextQueuedCampaignJob(
  db: Db,
): Promise<CampaignJob | null> {
  return db.transaction(async (tx) => {
    const [next] = await tx
      .select()
      .from(campaignJobs)
      .where(eq(campaignJobs.status, "queued"))
      .orderBy(asc(campaignJobs.createdAt), asc(campaignJobs.id))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!next) return null;
    const [claimed] = await tx
      .update(campaignJobs)
      .set({
        status: "running",
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(campaignJobs.id, next.id), eq(campaignJobs.status, "queued")),
      )
      .returning();
    return claimed ?? null;
  });
}

export async function reclaimStaleRunningCampaignJobs(
  db: Db,
  leaseMs: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - leaseMs);
  const rows = await db
    .update(campaignJobs)
    .set({ status: "queued", updatedAt: new Date() })
    .where(
      and(
        eq(campaignJobs.status, "running"),
        lt(campaignJobs.startedAt, cutoff),
      ),
    )
    .returning({ id: campaignJobs.id });
  return rows.length;
}

export async function recordCampaignBooking(
  db: Db,
  input: {
    jobId: string;
    userId: string;
    publishAt: string;
    notice?: string | null;
  },
): Promise<CampaignJob> {
  const [row] = await db
    .update(campaignJobs)
    .set({
      bookedCount: sql`${campaignJobs.bookedCount} + 1`,
      bookedPublishAts: sql`${campaignJobs.bookedPublishAts} || ${JSON.stringify([input.publishAt])}::jsonb`,
      notice: input.notice === undefined ? campaignJobs.notice : input.notice,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(campaignJobs.id, input.jobId),
        eq(campaignJobs.userId, input.userId),
      ),
    )
    .returning();
  if (!row) throw new CampaignDatabaseError("NOT_FOUND", "job not found");
  return row;
}

export async function patchCampaignJob(
  db: Db,
  input: {
    jobId: string;
    userId?: string;
    status?: CampaignJobStatus;
    nextDate?: string;
    dayAttempts?: number;
    notice?: string | null;
    lastError?: string | null;
    completedAt?: Date | null;
  },
): Promise<CampaignJob> {
  const filters = [eq(campaignJobs.id, input.jobId)];
  if (input.userId) filters.push(eq(campaignJobs.userId, input.userId));
  const [row] = await db
    .update(campaignJobs)
    .set({
      ...(input.status ? { status: input.status } : {}),
      ...(input.nextDate ? { nextDate: input.nextDate } : {}),
      ...(input.dayAttempts !== undefined
        ? { dayAttempts: input.dayAttempts }
        : {}),
      ...(input.notice !== undefined ? { notice: input.notice } : {}),
      ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
      ...(input.completedAt !== undefined
        ? { completedAt: input.completedAt }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(...filters))
    .returning();
  if (!row) throw new CampaignDatabaseError("NOT_FOUND", "job not found");
  return row;
}

export async function pauseCampaignJob(
  db: Db,
  userId: string,
  id: string,
): Promise<CampaignJob> {
  const job = await getOwnedCampaignJob(db, userId, id);
  if (!job) throw new CampaignDatabaseError("NOT_FOUND", "job not found");
  if (TERMINAL.includes(job.status as CampaignJobStatus)) {
    throw new CampaignDatabaseError("CONFLICT", "job is finished");
  }
  if (job.status !== "queued" && job.status !== "running") {
    throw new CampaignDatabaseError("CONFLICT", "job is not pausable");
  }
  return patchCampaignJob(db, { jobId: id, userId, status: "paused" });
}

export async function resumeCampaignJob(
  db: Db,
  userId: string,
  id: string,
): Promise<CampaignJob> {
  const job = await getOwnedCampaignJob(db, userId, id);
  if (!job) throw new CampaignDatabaseError("NOT_FOUND", "job not found");
  if (job.status !== "paused") {
    throw new CampaignDatabaseError("CONFLICT", "job is not paused");
  }
  return patchCampaignJob(db, { jobId: id, userId, status: "queued" });
}

export async function stopCampaignJob(
  db: Db,
  userId: string,
  id: string,
): Promise<CampaignJob> {
  const job = await getOwnedCampaignJob(db, userId, id);
  if (!job) throw new CampaignDatabaseError("NOT_FOUND", "job not found");
  if (TERMINAL.includes(job.status as CampaignJobStatus)) {
    throw new CampaignDatabaseError("CONFLICT", "job is finished");
  }
  return patchCampaignJob(db, {
    jobId: id,
    userId,
    status: "stopped",
    completedAt: new Date(),
  });
}

export function campaignDayIndex(
  startDate: string | null | undefined,
  nextDate: string,
): number {
  if (!startDate) return 1;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const next = Date.parse(`${nextDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(next)) return 1;
  const days = Math.round((next - start) / 86_400_000);
  return Math.max(1, days + 1);
}
