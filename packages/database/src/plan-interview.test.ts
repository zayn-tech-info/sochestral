import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client.js";
import { requireTestDatabaseUrl } from "./env.js";
import { provisionUser } from "./users.js";
import { createConversationTurn } from "./orchestration.js";
import { assembleGenerationContext } from "./generation-context.js";
import { getPlanInterview, savePlanInterview, type PlanInterviewState } from "./plan-interview.js";
import { getPlan } from "./plans.js";
import { plans } from "./schema.js";
import type { PlanDocument } from "./plan-document.js";

function document(): PlanDocument {
  return { schemaVersion: 1, sections: (["goal", "audience_voice", "direction", "calendar", "sources", "missing_inputs"] as const).map(type => ({
    id: `section_${type}`, type, title: type, blocks: [{ id: `block_${type}`, kind: "paragraph" as const, text: `Discuss ${type}` }],
  })) };
}

function asking(answers: PlanInterviewState["answers"] = { goal: null, newsAssets: null, direction: null }): PlanInterviewState {
  return {
    status: "asking",
    answers,
    questions: [{ field: "goal", text: "What should this campaign achieve?" }],
    useExistingContext: false,
    sources: [],
  };
}

describe("plan interview persistence", () => {
  let database: Database;
  let userId: string;
  let conversationId: string;
  beforeAll(() => { database = createDb(requireTestDatabaseUrl()); });
  afterAll(async () => { await database.client.end({ timeout: 5 }); });
  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "interview@example.com")).id;
    conversationId = (await createConversationTurn(database.db, {
      userId, requestId: crypto.randomUUID(), content: "Plan the next 2 weeks", title: "Plan", assistantContent: "Ready",
    })).conversation.id;
  });
  const save = (input: Parameters<typeof savePlanInterview>[1]) => savePlanInterview(database.db, input);

  it("keeps partial answers, ignores another owner, and rejects a foreign context", async () => {
    const { context } = await assembleGenerationContext(database.db, { userId, conversationId, role: "plan_interview", parentId: "run_1" });
    await save({ userId, conversationId, expectedRevision: 0, contextId: context.id, state: asking({ goal: "Sell workshop tools", newsAssets: null, direction: null }) });
    const saved = await getPlanInterview(database.db, userId, conversationId);
    expect(saved).toMatchObject({ revision: 1, contextId: context.id, planId: null });
    expect(saved?.state.answers.goal).toBe("Sell workshop tools");
    expect(saved?.state.answers.direction).toBeNull();
    const other = await provisionUser(database.db, "interview-other@example.com");
    expect(await getPlanInterview(database.db, other.id, conversationId)).toBeNull();
    const foreignConversation = (await createConversationTurn(database.db, {
      userId: other.id, requestId: crypto.randomUUID(), content: "Plan the next 2 weeks", title: "Other", assistantContent: "Ready",
    })).conversation.id;
    await expect(save({ userId: other.id, conversationId, expectedRevision: 0, contextId: null, state: asking() })).rejects.toMatchObject({ code: "PLAN_NOT_FOUND" });
    await expect(save({ userId: other.id, conversationId: foreignConversation, expectedRevision: 0, contextId: context.id, state: asking() })).rejects.toMatchObject({ code: "CONTEXT_NOT_FOUND" });
  });

  it("rejects stale concurrent updates", async () => {
    await save({ userId, conversationId, expectedRevision: 0, contextId: null, state: asking() });
    const results = await Promise.allSettled([
      save({ userId, conversationId, expectedRevision: 1, contextId: null, state: asking({ goal: "A", newsAssets: null, direction: null }) }),
      save({ userId, conversationId, expectedRevision: 1, contextId: null, state: asking({ goal: "B", newsAssets: null, direction: null }) }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "STALE_VERSION" } });
    expect((await getPlanInterview(database.db, userId, conversationId))?.revision).toBe(2);
  });

  it("creates the versioned plan in the same transaction as the interview link", async () => {
    const created = await save({
      userId, conversationId, expectedRevision: 0, contextId: null, state: asking(),
      generated: { title: "Workshop plan", document: document() },
    });
    expect(created.state.status).toBe("planned");
    expect(created.planId).toMatch(/^plan_/);
    expect((await getPlan(database.db, userId, created.planId!)).plan.conversationId).toBe(conversationId);
    await expect(save({
      userId, conversationId, expectedRevision: created.revision, contextId: null, state: asking(),
      generated: { title: "Second", document: document() },
    })).rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("rolls back when generated document is invalid", async () => {
    await expect(save({
      userId, conversationId, expectedRevision: 0, contextId: null, state: asking(),
      generated: { title: "Broken", document: { schemaVersion: 1, sections: [] } },
    })).rejects.toMatchObject({ code: "INVALID_DOCUMENT" });
    expect(await getPlanInterview(database.db, userId, conversationId)).toBeNull();
    expect(await database.db.select().from(plans)).toHaveLength(0);
  });
});
