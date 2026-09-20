import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, requireTestDatabaseUrl, provisionUser, createPlan, addPlanComment, submitPlanComments, getPlan, revisePlan,
  claimPlanRevision, recoverExpiredPlanRevisions, planRevisionBatches, type Database, type PlanDocument } from "@sochestral/database";
import { processOnePlanRevision } from "./plan-revision.js";
import type { ModelCompletion, ModelProvider } from "./model.js";
const document = (): PlanDocument => ({ schemaVersion: 1, sections: (["goal", "audience_voice", "direction", "calendar", "sources", "missing_inputs"] as const).map(type => ({
  id: `s_${type}`, type, title: type, blocks: [{ id: `b_${type}`, kind: "paragraph", text: `Review ${type}` }],
})) });

describe("durable plan revision", () => {
  let database: Database;
  let userId: string;
  let planId: string;
  let commentId: string;
  let batchId: string;
  beforeAll(() => { database = createDb(requireTestDatabaseUrl()); });
  afterAll(async () => { await database.client.end({ timeout: 5 }); });
  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "revision@example.test")).id;
    planId = (await createPlan(database.db, { userId, title: "Launch", document: document(), contextId: null })).plan.id;
    commentId = (await addPlanComment(database.db, { userId, planId, version: 1, blockId: "b_goal", body: "Reach independent shops" })).id;
    batchId = (await submitPlanComments(database.db, { userId, planId, version: 1, commentIds: [commentId] })).batch.id;
  });
  function completion(): ModelCompletion {
    const next = document();
    next.sections[0]!.blocks = [{ id: "b_goal", kind: "paragraph", text: "Reach independent shops" }];
    return { content: null, thinking: null, toolCalls: [{ id: "call_1", name: "save_plan_revision", input: { document: next, handledCommentIds: [commentId] } }], inputTokens: 0, outputTokens: 0, attempts: 1 };
  }
  const run = (provider: ModelProvider) => processOnePlanRevision(database.db, { provider, model: "test-model", maxTokens: 5000 });
  it("applies only the claimed comments using a persisted context", async () => {
    const complete = vi.fn(async (input: Parameters<ModelProvider["complete"]>[0]) => {
      expect(input.system).toContain("Brand context data follows as JSON");
      expect(input.messages[0]?.content[0]).toMatchObject({ text: expect.stringContaining(commentId) });
      await addPlanComment(database.db, { userId, planId, version: 1, blockId: "b_direction", body: "A later thought" });
      return completion();
    });
    expect(await run({ complete })).toBe("applied");
    const result = await getPlan(database.db, userId, planId);
    expect(result.version).toMatchObject({ version: 2, handledCommentIds: [commentId], contextId: expect.stringMatching(/^gctx_/) });
    expect(result.comments.find(row => row.id !== commentId)?.status).toBe("pending");
    expect(result.batches[0]?.status).toBe("applied");
    expect(result.batches[0]).not.toHaveProperty("claimToken");
  });
  it("prevents overlapping workers from invoking the model twice", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const complete = vi.fn(async () => { started(); await gate; return completion(); });
    const first = run({ complete });
    await ready;
    try { expect(await run({ complete })).toBe("idle"); } finally { release(); }
    expect(await first).toBe("applied");
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it("does not overwrite a manual revision committed during generation", async () => {
    const complete = vi.fn(async () => {
      await revisePlan(database.db, { userId, planId, expectedVersion: 1, document: document(), contextId: null });
      return completion();
    });
    expect(await run({ complete })).toBe("needs_attention");
    const result = await getPlan(database.db, userId, planId);
    expect(result.version.version).toBe(2);
    expect(result.version.document).toEqual(document());
    expect(result.batches[0]?.status).toBe("stale");
  });
  it("keeps malformed results visible without changing the document or automatically retrying", async () => {
    const complete = vi.fn(async () => ({ ...completion(), toolCalls: [] }));
    expect(await run({ complete })).toBe("needs_attention");
    expect(await run({ complete })).toBe("idle");
    const result = await getPlan(database.db, userId, planId);
    expect(result.version.version).toBe(1);
    expect(result.batches[0]).toMatchObject({ status: "needs_attention", errorCode: "INVALID_DOCUMENT" });
    expect(result.comments[0]?.status).toBe("pending");
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it("recovers a lost worker and rejects its late result", async () => {
    const claimed = await claimPlanRevision(database.db);
    await database.db.update(planRevisionBatches).set({ leaseExpiresAt: new Date(0) }).where(eq(planRevisionBatches.id, batchId));
    expect(await recoverExpiredPlanRevisions(database.db)).toBe(1);
    await expect(revisePlan(database.db, { userId, planId, expectedVersion: 1, document: document(), contextId: null,
      batchId, claimToken: claimed!.batch.claimToken!, handledCommentIds: [commentId] })).rejects.toMatchObject({ code: "INVALID_BATCH" });
    expect((await getPlan(database.db, userId, planId)).batches[0]).toMatchObject({ status: "needs_attention", errorCode: "REVISION_INTERRUPTED" });
    expect(await claimPlanRevision(database.db)).toBeNull();
  });
});
