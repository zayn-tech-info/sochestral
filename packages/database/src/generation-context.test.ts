import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client.js";
import { requireTestDatabaseUrl } from "./env.js";
import { provisionUser } from "./users.js";
import { createConversationTurn } from "./orchestration.js";
import { createProfileEntry, patchBusinessProfile } from "./profile.js";
import { assembleGenerationContext, generationContextNote } from "./generation-context.js";
import { generationContexts, generationContextUses, voiceBibles } from "./schema.js";

describe("shared generation context", () => {
  let database: Database;
  let userId: string;
  let conversationId: string;
  beforeAll(() => { database = createDb(requireTestDatabaseUrl()); });
  afterAll(async () => { await database.client.end({ timeout: 5 }); });
  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "context-owner@example.com")).id;
    conversationId = (await createConversationTurn(database.db, {
      userId, requestId: crypto.randomUUID(), content: "Build a plan", title: "Plan", assistantContent: "Ready",
    })).conversation.id;
  });
  const assemble = (role = "chat", parentId = "run_1") => assembleGenerationContext(database.db, {
    userId, conversationId, role, parentId,
  });

  it("uses identical versioned facts for chat and worker and deduplicates repeat uses", async () => {
    await createProfileEntry(database.db, { userId, category: "tone", body: "Use concrete workshop examples", source: "settings", status: "active" });
    const chat = await assemble();
    const worker = await assemble("campaign_draft", "job_1");
    await assemble();
    expect(worker.context.id).toBe(chat.context.id);
    expect(generationContextNote(chat.context.payload)).toContain("Use concrete workshop examples");
    expect(await database.db.select().from(generationContexts)).toHaveLength(1);
    expect(await database.db.select().from(generationContextUses)).toHaveLength(2);
  });

  it("concurrent callers reuse one snapshot", async () => {
    await patchBusinessProfile(database.db, userId, { businessName: "Concurrent brand" });
    const results = await Promise.all([assemble("chat", "a"), assemble("campaign_draft", "b")]);
    expect(results[0].context.id).toBe(results[1].context.id);
    expect(await database.db.select().from(generationContexts)).toHaveLength(1);
  });

  it("retains old provenance when preferences change and excludes proposed facts and stale voice", async () => {
    const old = await assemble();
    await createProfileEntry(database.db, { userId, category: "do_not", body: "Never mention unverified discounts", source: "settings", status: "active" });
    await createProfileEntry(database.db, { userId, category: "brand_fact", body: "Unapproved secret", source: "research", status: "proposed" });
    await database.db.insert(voiceBibles).values({ userId, sourceHash: "new", status: "compiling", briefText: "Stale voice instructions" });
    const next = await assemble();
    expect(next.context.version).not.toBe(old.context.version);
    expect(JSON.stringify(next.context.payload)).toContain("Never mention unverified discounts");
    expect(JSON.stringify(next.context.payload)).not.toContain("Unapproved secret");
    expect(JSON.stringify(next.context.payload)).not.toContain("Stale voice instructions");
    expect(JSON.stringify(old.context.payload)).not.toContain("Never mention unverified discounts");
    expect(await database.db.select().from(generationContexts)).toHaveLength(2);
  });

  it("rejects another owner's conversation and never retrieves that owner's facts", async () => {
    const other = await provisionUser(database.db, "context-other@example.com");
    await patchBusinessProfile(database.db, other.id, { businessName: "Private competitor data" });
    await expect(assembleGenerationContext(database.db, { userId: other.id, conversationId, role: "chat", parentId: "bad" })).rejects.toThrow("CONTEXT_CONVERSATION_NOT_FOUND");
    expect(JSON.stringify((await assemble()).context.payload)).not.toContain("Private competitor data");
  });

  it("bounds selected preferences and records omissions", async () => {
    for (let n = 0; n < 26; n++) {
      await createProfileEntry(database.db, { userId, category: "brand_fact", body: `Fact ${n} ${"a".repeat(1800)}`, source: "settings", status: "active" });
    }
    const result = await assemble();
    expect(result.context.payload.preferences).toHaveLength(24);
    expect(result.context.payload.selection).toMatchObject({ omittedPreferences: 2 });
    expect(JSON.stringify(result.context.payload).length).toBeLessThan(40_000);
  });
});
