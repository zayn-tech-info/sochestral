import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, provisionUser, requireTestDatabaseUrl, usageAttempts, type Database } from "@sochestral/database";
import { TheseanOpenAIModelProvider } from "./openai-model.js";
import { withUsageContext } from "./usage.js";

describe("provider attempt accounting", () => {
  let database: Database;
  let userId: string;
  beforeAll(() => { database = createDb(requireTestDatabaseUrl()); });
  afterAll(async () => { await database.client.end({ timeout: 5 }); });
  afterEach(() => { vi.unstubAllGlobals(); });
  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "usage@example.com")).id;
  });
  const complete = () => new TheseanOpenAIModelProvider("test-only", 1000, "https://provider.invalid/v1").complete({
    system: "Write a caption", messages: [], tools: [], model: "test/model-exact", maxTokens: 100,
  });
  const run = () => withUsageContext({ db: database.db, userId, parentId: "job_1", role: "campaign_draft" }, complete);

  it("records a failed provider attempt and its retry separately with actual token categories", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("unavailable", { status: 503, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: "Caption" } }], usage: {
        prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 80 }, completion_tokens_details: { reasoning_tokens: 10 },
      } }));
    vi.stubGlobal("fetch", fetch);
    await run();
    const rows = (await database.db.select().from(usageAttempts)).sort((a, b) => a.attempt - b.attempt);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ userId, parentId: "job_1", role: "campaign_draft", outcome: "failed", attempt: 1, inputTokens: null });
    expect(rows[1]).toMatchObject({ outcome: "succeeded", attempt: 2, model: "test/model-exact", inputTokens: 120, outputTokens: 30, cacheReadTokens: 80, reasoningTokens: 10 });
    for (const row of rows) expect(row).toMatchObject({ costStatus: "unresolved", internalCostUsd: null, customerChargeStatus: "unassessed", rateCardVersion: null });
  });

  it("persists before the request and leaves omitted usage unknown", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      const rows = await database.db.select().from(usageAttempts);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.outcome).toBe("started");
      return Response.json({ choices: [{ message: { content: "Caption" } }] });
    }));
    await run();
    expect((await database.db.select().from(usageAttempts))[0]).toMatchObject({ outcome: "succeeded", inputTokens: null, outputTokens: null });
  });

  it("keeps concurrent users and parents separate", async () => {
    const other = await provisionUser(database.db, "usage-other@example.com");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { content: "Caption" } }] })));
    await Promise.all([run(), withUsageContext({ db: database.db, userId: other.id, parentId: "job_2", role: "voice_compile" }, complete)]);
    const rows = await database.db.select().from(usageAttempts);
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.userId === userId)).toMatchObject({ parentId: "job_1", role: "campaign_draft" });
    expect(rows.find(row => row.userId === other.id)).toMatchObject({ parentId: "job_2", role: "voice_compile" });
  });
});
