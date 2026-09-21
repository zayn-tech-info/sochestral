import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, requireTestDatabaseUrl, provisionUser, createPlan, approvePlanDirection, enqueueCreateContent, getPlan,
  campaignJobs, contentItems, type Database, type PlanDocument } from "@sochestral/database";
import { processOneContentJob } from "./plan-content.js";
import type { ModelCompletion, ModelProvider } from "./model.js";

const calendarItems = [
  { id: "item_text", angle: "Shop tip", audience: "Builders", format: "text" as const, destinations: ["threads"] as ["threads"], proposedTime: null, assetNeeds: [] },
  { id: "item_image", angle: "Clamp photo", audience: "Builders", format: "image" as const, destinations: ["instagram"] as ["instagram"], proposedTime: null, assetNeeds: ["hero photo"] },
];

const document = (): PlanDocument => ({ schemaVersion: 1, sections: (["goal", "audience_voice", "direction", "calendar", "sources", "missing_inputs"] as const).map(type => ({
  id: `s_${type}`, type, title: type, blocks: type === "calendar"
    ? [{ id: "calendar_table", kind: "calendar" as const, items: calendarItems }]
    : [{ id: `b_${type}`, kind: "paragraph" as const, text: `Review ${type}` }],
})) });

describe("durable content worker", () => {
  let database: Database;
  let userId: string;
  let planId: string;
  beforeAll(() => { database = createDb(requireTestDatabaseUrl()); });
  afterAll(async () => { await database.client.end({ timeout: 5 }); });
  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "plan-content@example.test")).id;
    planId = (await createPlan(database.db, { userId, title: "Launch", document: document(), contextId: null })).plan.id;
    await approvePlanDirection(database.db, { userId, planId, version: 1 });
    await enqueueCreateContent(database.db, { userId, planId, version: 1 });
  });
  function completion(overrides?: Partial<{ items: Array<{ calendarItemId: string; caption: string }>; stopReason: ModelCompletion["stopReason"] }>): ModelCompletion {
    return {
      content: null, thinking: null, stopReason: overrides?.stopReason,
      toolCalls: [{ id: "call_1", name: "save_content_set", input: { items: overrides?.items ?? [
        { calendarItemId: "item_text", caption: "A shop-floor caption for builders." },
        { calendarItemId: "item_image", caption: "Show the clamp on the bench." },
      ] } }],
      inputTokens: 0, outputTokens: 0, attempts: 1,
    };
  }
  const run = (provider: ModelProvider) => processOneContentJob(database.db, { provider, model: "test-model", maxTokens: 5000 });

  it("persists one revision per calendar item without campaign jobs or a second model run", async () => {
    const complete = vi.fn(async (input: Parameters<ModelProvider["complete"]>[0]) => {
      expect(input.tools?.[0]?.name).toBe("save_content_set");
      expect(input.system).toContain("Brand context data follows as JSON");
      return completion();
    });
    expect(await run({ complete })).toBe("applied");
    expect(await run({ complete })).toBe("idle");
    const result = await getPlan(database.db, userId, planId);
    expect(result.contentItems).toHaveLength(2);
    expect(result.contentItems.find(item => item.calendarItemId === "item_text")?.status).toBe("ready");
    expect(result.contentItems.find(item => item.calendarItemId === "item_image")).toMatchObject({ status: "blocked", revision: { blockReason: "missing_media" } });
    expect(result.contentJob).not.toHaveProperty("claimToken");
    expect(await database.db.select().from(campaignJobs)).toHaveLength(0);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("records needs_attention with zero rows when generation crashes before commit", async () => {
    const complete = vi.fn(async () => { throw new Error("worker crashed"); });
    expect(await run({ complete })).toBe("needs_attention");
    expect(await database.db.select().from(contentItems)).toHaveLength(0);
    expect((await getPlan(database.db, userId, planId)).contentJob).toMatchObject({ status: "needs_attention", errorCode: "CONTENT_FAILED" });
    expect((await getPlan(database.db, userId, planId)).contentItems.filter(item => item.status === "ready")).toHaveLength(0);
  });

  it("rejects truncated captions without writing rows", async () => {
    expect(await run({ complete: async () => completion({ stopReason: "max_tokens" }) })).toBe("needs_attention");
    expect(await database.db.select().from(contentItems)).toHaveLength(0);
    expect((await getPlan(database.db, userId, planId)).contentJob).toMatchObject({ errorCode: "INVALID_CONTENT" });
  });

  it("rejects a mismatched caption set without writing rows", async () => {
    const otherPlan = (await createPlan(database.db, { userId, title: "Other", document: document(), contextId: null })).plan.id;
    await approvePlanDirection(database.db, { userId, planId: otherPlan, version: 1 });
    await enqueueCreateContent(database.db, { userId, planId: otherPlan, version: 1 });
    expect(await run({ complete: async () => completion({ items: [{ calendarItemId: "item_text", caption: "Only one" }] }) })).toBe("needs_attention");
    expect((await getPlan(database.db, userId, otherPlan)).contentItems).toHaveLength(0);
  });
});
