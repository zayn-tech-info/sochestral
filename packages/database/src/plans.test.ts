import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client.js";
import { requireTestDatabaseUrl } from "./env.js";
import { provisionUser } from "./users.js";
import { reattachPlanComment, claimPlanRevision, finishPlanRevisionFailure, createPlan, getPlan, addPlanComment, submitPlanComments, revisePlan, approvePlanDirection } from "./plans.js";
import { enqueueCreateContent } from "./content.js";
import { campaignJobs, planVersions, workflowApprovals } from "./schema.js";
import type { PlanDocument } from "./plan-document.js";

function document(): PlanDocument {
  return { schemaVersion: 1, sections: (["goal", "audience_voice", "direction", "calendar", "sources", "missing_inputs"] as const).map(type => ({
    id: `section_${type}`, type, title: type, blocks: [{ id: `block_${type}`, kind: "paragraph" as const, text: `Discuss ${type}` }],
  })) };
}

describe("versioned plan workflow", () => {
  let database: Database;
  let userId: string;
  let planId: string;
  beforeAll(() => { database = createDb(requireTestDatabaseUrl()); });
  afterAll(async () => { await database.client.end({ timeout: 5 }); });
  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "plans@example.com")).id;
    planId = (await createPlan(database.db, { userId, title: "Launch", document: document(), contextId: null })).plan.id;
  });
  const comment = (blockId = "block_goal") => addPlanComment(database.db, { userId, planId, version: 1, blockId, body: "Make this concrete" });
  const revise = (next = document(), extra = {}) => revisePlan(database.db, { userId, planId, expectedVersion: 1, document: next, contextId: null, ...extra });

  it("retains immutable versions and invalidates direction approval without granting scheduling", async () => {
    const approval = await approvePlanDirection(database.db, { userId, planId, version: 1 });
    expect(approval.scope).toBe("plan_direction");
    const next = document();
    next.sections[0]!.blocks = [{ id: "block_goal", kind: "paragraph", text: "Reach workshop owners" }];
    await revise(next);
    expect((await getPlan(database.db, userId, planId)).plan.currentVersion).toBe(2);
    const versions = await database.db.select().from(planVersions);
    expect(versions).toHaveLength(2);
    expect(versions.find(row => row.version === 1)?.document.sections[0]?.blocks[0]).toMatchObject({ text: "Discuss goal" });
    expect((await database.db.select().from(workflowApprovals))[0]?.invalidationReason).toBe("Plan revised");
    await expect(approvePlanDirection(database.db, { userId, planId, version: 1 })).rejects.toMatchObject({ code: "STALE_VERSION" });
    await expect(enqueueCreateContent(database.db, { userId, planId, version: 2 })).rejects.toMatchObject({ code: "DIRECTION_NOT_APPROVED" });
    expect(await database.db.select().from(campaignJobs)).toHaveLength(0);
  });

  it("only resolves submitted comments and retains comments arriving during revision", async () => {
    const first = await comment();
    const { batch } = await submitPlanComments(database.db, { userId, planId, version: 1, commentIds: [first.id] });
    const later = await comment("block_direction");
    await revise(document(), { batchId: batch.id, handledCommentIds: [first.id] });
    const result = await getPlan(database.db, userId, planId);
    expect(result.comments.find(row => row.id === first.id)?.status).toBe("addressed");
    expect(result.comments.find(row => row.id === later.id)?.status).toBe("pending");
    expect(result.version.handledCommentIds).toEqual([first.id]);
  });

  it("keeps removed anchors visible for reattachment and rejects fabricated selections", async () => {
    await comment();
    await expect(addPlanComment(database.db, { userId, planId, version: 1, blockId: "block_goal", quote: "Not present", body: "Change it" })).rejects.toMatchObject({ code: "INVALID_ANCHOR" });
    const next = document();
    next.sections[0]!.blocks = [{ id: "replacement_goal", kind: "paragraph", text: "Different direction" }];
    await revise(next);
    expect((await getPlan(database.db, userId, planId)).comments[0]?.status).toBe("needs_reattachment");
  });

  it("reattaches explicitly while preserving original feedback and rejecting stale or foreign requests", async () => {
    const original = await comment();
    const next = document();
    next.sections[0]!.blocks = [{ id: "new_goal", kind: "paragraph", text: "Reach independent shops" }];
    await revise(next);
    const input = { userId, planId, commentId: original.id, version: 2, blockId: "new_goal", quote: "independent shops" };
    await expect(reattachPlanComment(database.db, { ...input, version: 1 })).rejects.toMatchObject({ code: "STALE_VERSION" });
    await expect(reattachPlanComment(database.db, { ...input, quote: "invented" })).rejects.toMatchObject({ code: "INVALID_ANCHOR" });
    const other = await provisionUser(database.db, "reattach-other@example.com");
    await expect(reattachPlanComment(database.db, { ...input, userId: other.id })).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });
    const [saved, replay] = await Promise.all([reattachPlanComment(database.db, input), reattachPlanComment(database.db, input)]);
    expect(saved.id).toBe(replay.id);
    expect(saved).toMatchObject({ version: 2, blockId: "new_goal", body: original.body, reattachedFromId: original.id, status: "pending" });
    const result = await getPlan(database.db, userId, planId);
    expect(result.comments).toHaveLength(2);
    expect(result.comments.find(row => row.id === original.id)).toMatchObject({ version: 1, blockId: "block_goal", status: "reattached" });
    await expect(reattachPlanComment(database.db, { ...input, blockId: "block_direction", quote: undefined })).rejects.toMatchObject({ code: "INVALID_COMMENT" });
  });

  it("retains submitted membership after failed feedback is explicitly submitted again", async () => {
    const first = await comment();
    const { batch } = await submitPlanComments(database.db, { userId, planId, version: 1, commentIds: [first.id] });
    const claimed = await claimPlanRevision(database.db);
    await finishPlanRevisionFailure(database.db, { planId, batchId: batch.id, claimToken: claimed!.batch.claimToken!, errorCode: "REVISION_FAILED" });
    const retry = await submitPlanComments(database.db, { userId, planId, version: 1, commentIds: [first.id] });
    const result = await getPlan(database.db, userId, planId);
    expect(result.batches.find(row => row.id === batch.id)?.commentIds).toEqual([first.id]);
    expect(result.batches.find(row => row.id === retry.batch.id)?.commentIds).toEqual([first.id]);
    expect(result.comments[0]?.batchId).toBe(retry.batch.id);
  });

  it("rejects renaming an unchanged block", async () => {
    const next = document();
    next.sections[0]!.blocks[0]!.id = "new_id_same_text";
    await expect(revise(next)).rejects.toMatchObject({ code: "INVALID_DOCUMENT" });
  });

  it("rejects stale overwrites even when revisions race", async () => {
    const results = await Promise.allSettled([revise(), revise()]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "STALE_VERSION" } });
    expect(await database.db.select().from(planVersions)).toHaveLength(2);
  });

  it("rejects another owner and duplicate block identities", async () => {
    const other = await provisionUser(database.db, "plans-other@example.com");
    await expect(getPlan(database.db, other.id, planId)).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });
    await expect(approvePlanDirection(database.db, { userId: other.id, planId, version: 1 })).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });
    const bad = document();
    bad.sections[1]!.blocks[0]!.id = "block_goal";
    await expect(revise(bad)).rejects.toMatchObject({ code: "INVALID_DOCUMENT" });
  });

  it("stores 100 proposed items without a 30-item truncation", async () => {
    const next = document();
    next.sections[3]!.blocks = [{ id: "calendar_table", kind: "calendar", items: Array.from({ length: 100 }, (_, n) => ({
      id: `item_${n}`, angle: `Angle ${n}`, audience: "Builders", format: "text", destinations: ["threads"], proposedTime: null, assetNeeds: [],
    })) }];
    const saved = await revise(next);
    const calendar = saved.document.sections[3]!.blocks[0]!;
    expect(calendar.kind === "calendar" && calendar.items.length).toBe(100);
  });
});
