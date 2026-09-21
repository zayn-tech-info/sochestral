import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client.js";
import { requireTestDatabaseUrl } from "./env.js";
import { provisionUser } from "./users.js";
import { createPlan, getPlan, approvePlanDirection, revisePlan } from "./plans.js";
import { enqueueCreateContent, claimContentJob, finishContentJobFailure, applyContentSet, contentBlockState } from "./content.js";
import { campaignJobs, contentGenerationJobs, contentItems, contentRevisions } from "./schema.js";
import type { PlanDocument } from "./plan-document.js";

function document(items: PlanDocument["sections"][number]["blocks"] = [{ id: "block_calendar", kind: "paragraph", text: "No rows yet" }]): PlanDocument {
  return { schemaVersion: 1, sections: (["goal", "audience_voice", "direction", "calendar", "sources", "missing_inputs"] as const).map(type => ({
    id: `section_${type}`, type, title: type, blocks: type === "calendar" ? items : [{ id: `block_${type}`, kind: "paragraph" as const, text: `Discuss ${type}` }],
  })) };
}

const calendarItems = [
  { id: "item_text", angle: "Shop floor tip", audience: "Builders", format: "text" as const, destinations: ["threads"] as ["threads"], proposedTime: null, assetNeeds: [] },
  { id: "item_image", angle: "Product photo", audience: "Builders", format: "image" as const, destinations: ["instagram"] as ["instagram"], proposedTime: null, assetNeeds: ["photo"] },
];

describe("durable content generation", () => {
  let database: Database;
  let userId: string;
  let planId: string;
  beforeAll(() => { database = createDb(requireTestDatabaseUrl()); });
  afterAll(async () => { await database.client.end({ timeout: 5 }); });
  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "content@example.com")).id;
    planId = (await createPlan(database.db, { userId, title: "Launch", document: document([{ id: "calendar_table", kind: "calendar", items: calendarItems }]), contextId: null })).plan.id;
  });

  it("rejects another owner, a stale version, and a version without direction approval", async () => {
    const other = await provisionUser(database.db, "content-other@example.com");
    await expect(enqueueCreateContent(database.db, { userId: other.id, planId, version: 1 })).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });
    await expect(enqueueCreateContent(database.db, { userId, planId, version: 1 })).rejects.toMatchObject({ code: "DIRECTION_NOT_APPROVED" });
    await approvePlanDirection(database.db, { userId, planId, version: 1 });
    await expect(enqueueCreateContent(database.db, { userId, planId, version: 2 })).rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("rejects a direction-approved plan that has no calendar items", async () => {
    const emptyId = (await createPlan(database.db, { userId, title: "Empty", document: document(), contextId: null })).plan.id;
    await approvePlanDirection(database.db, { userId, planId: emptyId, version: 1 });
    await expect(enqueueCreateContent(database.db, { userId, planId: emptyId, version: 1 })).rejects.toMatchObject({ code: "NO_CALENDAR_ITEMS" });
  });

  it("enqueues one job per version and returns the same job without duplicating items", async () => {
    await approvePlanDirection(database.db, { userId, planId, version: 1 });
    const first = await enqueueCreateContent(database.db, { userId, planId, version: 1 });
    const second = await enqueueCreateContent(database.db, { userId, planId, version: 1 });
    expect(second.contentJob?.id).toBe(first.contentJob?.id);
    expect(second.contentJob).not.toHaveProperty("claimToken");
    expect(await database.db.select().from(contentGenerationJobs)).toHaveLength(1);
    expect(await database.db.select().from(contentItems)).toHaveLength(0);
    expect(await database.db.select().from(campaignJobs)).toHaveLength(0);
  });

  it("writes one revision per calendar item and blocks only the media sibling", async () => {
    await approvePlanDirection(database.db, { userId, planId, version: 1 });
    await enqueueCreateContent(database.db, { userId, planId, version: 1 });
    const claimed = await claimContentJob(database.db);
    await applyContentSet(database.db, {
      userId, planId, jobId: claimed!.job.id, claimToken: claimed!.job.claimToken!,
      document: claimed!.version.document,
      captions: [
        { calendarItemId: "item_text", caption: "A concrete shop-floor caption." },
        { calendarItemId: "item_image", caption: "Show the bench photo with the new clamp." },
      ],
    });
    const result = await getPlan(database.db, userId, planId);
    expect(result.contentJob).toMatchObject({ status: "applied" });
    expect(result.contentJob).not.toHaveProperty("claimToken");
    expect(result.contentItems).toHaveLength(2);
    expect(result.contentItems.find(item => item.calendarItemId === "item_text")).toMatchObject({ status: "ready", revision: { revision: 1, blockReason: null } });
    expect(result.contentItems.find(item => item.calendarItemId === "item_image")).toMatchObject({ status: "blocked", revision: { blockReason: "missing_media", format: "image" } });
    const replay = await enqueueCreateContent(database.db, { userId, planId, version: 1 });
    expect(replay.contentItems).toHaveLength(2);
    expect(await database.db.select().from(contentItems)).toHaveLength(2);
    expect(await database.db.select().from(contentRevisions)).toHaveLength(2);
    expect(await database.db.select().from(campaignJobs)).toHaveLength(0);
  });

  it("leaves zero content rows when a claimed job fails before commit", async () => {
    await approvePlanDirection(database.db, { userId, planId, version: 1 });
    await enqueueCreateContent(database.db, { userId, planId, version: 1 });
    const claimed = await claimContentJob(database.db);
    await finishContentJobFailure(database.db, { planId, jobId: claimed!.job.id, claimToken: claimed!.job.claimToken!, errorCode: "CONTENT_FAILED" });
    expect((await getPlan(database.db, userId, planId)).contentJob).toMatchObject({ status: "needs_attention", errorCode: "CONTENT_FAILED" });
    expect(await database.db.select().from(contentItems)).toHaveLength(0);
    expect(await database.db.select().from(contentRevisions)).toHaveLength(0);
    expect((await getPlan(database.db, userId, planId)).contentItems.filter(item => item.status === "ready")).toHaveLength(0);
  });

  it("marks unverified placeholders on an otherwise ready text item", () => {
    expect(contentBlockState(calendarItems[0]!, "See [source] for details")).toEqual({ status: "blocked", blockReason: "unverified_placeholder" });
    expect(contentBlockState(calendarItems[0]!, "Ship the clamp this week.")).toEqual({ status: "ready", blockReason: null });
  });

  it("does not apply captions after the plan version changes", async () => {
    await approvePlanDirection(database.db, { userId, planId, version: 1 });
    await enqueueCreateContent(database.db, { userId, planId, version: 1 });
    const claimed = await claimContentJob(database.db);
    await revisePlan(database.db, { userId, planId, expectedVersion: 1, document: document([{ id: "calendar_table", kind: "calendar", items: calendarItems }]), contextId: null });
    await expect(applyContentSet(database.db, {
      userId, planId, jobId: claimed!.job.id, claimToken: claimed!.job.claimToken!,
      document: claimed!.version.document,
      captions: calendarItems.map(item => ({ calendarItemId: item.id, caption: "Late caption" })),
    })).rejects.toMatchObject({ code: "INVALID_CONTENT" });
    expect(await database.db.select().from(contentItems)).toHaveLength(0);
  });
});
