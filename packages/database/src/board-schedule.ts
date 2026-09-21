import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "./client.js";
import { PlanWorkflowError } from "./plan-errors.js";
import { boardScheduleConfirmations, boardScheduleOperations, contentItems, plans } from "./schema.js";

type Db = Database["db"];
const id = (prefix: string) => `${prefix}_${randomUUID()}`;

export type BoardScheduleDestination = {
  itemId: string;
  revisionId: string;
  destination: "threads" | "instagram" | "linkedin_personal";
  connectedAccountId: string;
  localTime: string;
  publishAt: Date;
  timezone: string;
};

export async function persistBoardSchedule(db: Db, input: {
  userId: string;
  planId: string;
  planVersion: number;
  timezone: string;
  destinations: BoardScheduleDestination[];
  excludedItemIds: string[];
}) {
  return db.transaction(async tx => {
    const [plan] = await tx.select().from(plans).where(and(eq(plans.id, input.planId), eq(plans.userId, input.userId))).for("update");
    if (!plan || plan.currentVersion !== input.planVersion) throw new PlanWorkflowError("STALE_VERSION");
    if (input.excludedItemIds.length) {
      await tx.update(contentItems).set({ excludedAt: new Date() }).where(and(
        eq(contentItems.planId, input.planId), eq(contentItems.planVersion, input.planVersion),
        inArray(contentItems.id, input.excludedItemIds),
      ));
    }
    const [confirmation] = await tx.insert(boardScheduleConfirmations).values({
      id: id("bconf"), userId: input.userId, planId: input.planId, planVersion: input.planVersion, timezone: input.timezone,
    }).returning();
    const operations = [];
    for (const row of input.destinations) {
      const [operation] = await tx.insert(boardScheduleOperations).values({
        id: id("bop"), confirmationId: confirmation!.id, userId: input.userId, planId: input.planId,
        itemId: row.itemId, revisionId: row.revisionId, destination: row.destination,
        connectedAccountId: row.connectedAccountId, localTime: row.localTime, publishAt: row.publishAt,
        timezone: row.timezone, status: "queued", idempotencyKey: `board:${row.itemId}:${row.revisionId}:${row.destination}:${row.publishAt.toISOString()}`,
      }).returning();
      operations.push(operation!);
    }
    return { confirmation: confirmation!, operations };
  });
}

export async function markBoardScheduleOperation(db: Db, input: {
  operationId: string;
  status: "scheduling" | "scheduled" | "needs_attention";
  receipt?: Record<string, unknown> | null;
  errorCode?: string | null;
}) {
  const [row] = await db.update(boardScheduleOperations).set({
    status: input.status, receipt: input.receipt ?? null, errorCode: input.errorCode ?? null,
  }).where(eq(boardScheduleOperations.id, input.operationId)).returning();
  return row ?? null;
}
