import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  campaignJobs,
  contentGenerationJobs,
  createConversationTurn,
  createDb,
  getPlan,
  getPlanInterview,
  plans,
  provisionUser,
  requireTestDatabaseUrl,
  approvePlanDirection,
  usageAttempts,
  type Database,
  type PlanDocument,
} from "@sochestral/database";
import type { ResearchSource } from "./deepseek-search.js";
import type { OrchestrationConfig } from "./config.js";
import type { SocialMcpGateway } from "./mcp.js";
import type { ModelCompletion, ModelProvider } from "./model.js";
import { PublishingPreferenceService } from "./publishing.js";
import { DefaultOrchestrationService } from "./service.js";
import { isInterviewPause, isInterviewResume, runPlanInterview } from "./plan-interview.js";

const PLAN_MESSAGE = "Plan the next 2 weeks";

const knownSource: ResearchSource = {
  url: "https://example.com/shop", title: "Shop notes", retrievedAt: "2026-09-20T12:00:00.000Z",
  summary: "Workshop benches", claim: "Workshop benches",
};
const extraSource: ResearchSource = {
  url: "https://example.com/other", title: "Other", retrievedAt: "2026-09-20T12:00:00.000Z",
  summary: "Unrelated", claim: "Unrelated",
};

function document(sources: ResearchSource[] = []): PlanDocument {
  return { schemaVersion: 1, sections: (["goal", "audience_voice", "direction", "calendar", "sources", "missing_inputs"] as const).map(type => ({
    id: `section_${type}`, type, title: type, blocks: type === "sources" && sources.length
      ? [{ id: "block_sources", kind: "sources" as const, sources: sources.map((source, index) => ({ id: `src_${index}`, ...source })) }]
      : [{ id: `block_${type}`, kind: "paragraph" as const, text: `Discuss ${type}` }],
  })) };
}

function completion(name: string, input: unknown): ModelCompletion {
  return { content: null, thinking: null, toolCalls: [{ id: "call_1", name, input }], inputTokens: 10, outputTokens: 5, attempts: 1 };
}

function asking(goal: string | null = null) {
  return completion("record_plan_interview", {
    status: "asking",
    answers: { goal, newsAssets: null, direction: null },
    questions: goal
      ? [{ field: "direction", text: "What voice should this take?" }]
      : [{ field: "goal", text: "What should this campaign achieve?" }, { field: "direction", text: "What voice should this take?" }],
    useExistingContext: false,
  });
}

function ready(useExistingContext = true) {
  return completion("record_plan_interview", {
    status: "ready",
    answers: { goal: "Sell workshop tools", newsAssets: "New bench series", direction: "Practical shop-floor tips" },
    questions: [],
    useExistingContext,
  });
}

function delegated() {
  return completion("record_plan_interview", {
    status: "delegated",
    answers: { goal: "Sell workshop tools", newsAssets: null, direction: "Practical shop-floor tips" },
    questions: [],
    useExistingContext: false,
  });
}

function askingWhileFilled() {
  return completion("record_plan_interview", {
    status: "asking",
    answers: {
      goal: "Posts for offers, websites, and AI automation",
      newsAssets: "None specified",
      direction: "Service showcases for business owners",
    },
    questions: [
      { field: "goal", text: "What's the main goal for this content push?" },
      { field: "newsAssets", text: "Any recent news?" },
      { field: "direction", text: "Which platforms and content style?" },
    ],
    useExistingContext: false,
  });
}

const config: OrchestrationConfig = {
  theseanApiKey: "unused",
  theseanModel: "contract-model",
  theseanIntentModel: "intent-model",
  theseanVisionModel: "vision-model",
  theseanSetupModel: "setup-model",
  theseanVoiceModel: "voice-model",
  theseanVisionEnabled: true,
  theseanThinkingEnabled: false,
  theseanThinkingBudgetTokens: 2048,
  theseanTimeoutMs: 1000,
  setupAgentEnabled: false,
  deepseekApiKey: null,
  deepseekBaseUrl: "https://search.example",
  deepseekModel: "search-model",
  socialMcpUrl: "https://social.example/mcp",
  contextTokenLimit: 6000,
  outputTokenLimit: 1500,
  maxToolSteps: 4,
  dailyRunLimit: 50,
  externalTimeoutMs: 1000,
};

describe("interview pause wording", () => {
  it("recognizes pause and resume without treating ordinary chat as cancel", () => {
    expect(isInterviewPause("pause planning")).toBe(true);
    expect(isInterviewPause("cancel planning")).toBe(true);
    expect(isInterviewPause("never mind")).toBe(true);
    expect(isInterviewPause("Which social accounts are connected?")).toBe(false);
    expect(isInterviewPause("cancel the scheduled post")).toBe(false);
    expect(isInterviewResume("continue planning")).toBe(true);
    expect(isInterviewResume("back to the plan")).toBe(true);
  });
});

describe("plan interview", () => {
  let database: Database;
  let userId: string;
  beforeAll(() => { database = createDb(requireTestDatabaseUrl()); });
  afterAll(async () => { await database.client.end({ timeout: 5 }); });
  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "plan-interview@example.com")).id;
  });

  it("asks, retains a partial answer, then saves a reviewable plan without scheduling", async () => {
    const conversationId = (await createConversationTurn(database.db, {
      userId, requestId: crypto.randomUUID(), content: PLAN_MESSAGE, title: "Plan", assistantContent: "Ready",
    })).conversation.id;
    const complete = vi.fn(async (input: Parameters<ModelProvider["complete"]>[0]) => {
      if (input.toolChoice?.type === "tool" && input.toolChoice.name === "create_plan_document") {
        return completion("create_plan_document", { title: "Workshop plan", document: document() });
      }
      const payload = JSON.parse(String(input.messages[0]?.content[0] && "text" in input.messages[0].content[0] ? input.messages[0].content[0].text : "{}")) as { retained?: { answers?: { goal?: string | null } } };
      if (payload.retained?.answers?.goal) return ready();
      if (input.messages[0]?.content[0] && "text" in input.messages[0].content[0] && input.messages[0].content[0].text.includes("workshop")) return asking("Sell workshop tools");
      return asking();
    });
    const first = await runPlanInterview(database.db, {
      userId, conversationId, runId: "run_ask", message: PLAN_MESSAGE, provider: { complete }, model: "contract-model", maxTokens: 1500, search: null, searchModel: "search-model",
    });
    expect(first).toContain("What should this campaign achieve?");
    expect((await getPlanInterview(database.db, userId, conversationId))?.state.status).toBe("asking");
    const second = await runPlanInterview(database.db, {
      userId, conversationId, runId: "run_partial", message: "Sell workshop tools", provider: { complete }, model: "contract-model", maxTokens: 1500, search: null, searchModel: "search-model",
    });
    expect(second).toContain("What voice should this take?");
    expect((await getPlanInterview(database.db, userId, conversationId))?.state.answers.goal).toBe("Sell workshop tools");
    const third = await runPlanInterview(database.db, {
      userId, conversationId, runId: "run_ready", message: "Practical shop-floor tips", provider: { complete }, model: "contract-model", maxTokens: 1500, search: null, searchModel: "search-model",
    });
    const saved = await getPlanInterview(database.db, userId, conversationId);
    expect(third).toContain(`/app/plans/${saved?.planId}`);
    expect(saved?.state.status).toBe("planned");
    expect((await getPlan(database.db, userId, saved!.planId!)).plan.currentVersion).toBe(1);
    expect(await database.db.select().from(campaignJobs)).toHaveLength(0);
    const replay = await runPlanInterview(database.db, {
      userId, conversationId, runId: "run_again", message: "looks good", provider: { complete }, model: "contract-model", maxTokens: 1500, search: null, searchModel: "search-model",
    });
    expect(replay).toContain(`/app/plans/${saved?.planId}`);
    expect(replay).toContain("Open the post board");
    expect(replay).not.toContain("Approve its direction");
    expect(complete.mock.calls.filter(call => call[0].toolChoice?.type === "tool" && call[0].toolChoice.name === "create_plan_document")).toHaveLength(1);
  });

  it("keeps Thesean answers when the model still re-asks those fields", async () => {
    const conversationId = (await createConversationTurn(database.db, {
      userId, requestId: crypto.randomUUID(), content: PLAN_MESSAGE, title: "Plan", assistantContent: "Ready",
    })).conversation.id;
    const complete = vi.fn(async (input: Parameters<ModelProvider["complete"]>[0]) => {
      if (input.toolChoice?.type === "tool" && input.toolChoice.name === "create_plan_document") {
        return completion("create_plan_document", { title: "Workshop plan", document: document() });
      }
      return askingWhileFilled();
    });
    const text = await runPlanInterview(database.db, {
      userId, conversationId, runId: "run_repeat", message: "I want posts for offers and websites",
      provider: { complete }, model: "contract-model", maxTokens: 1500, search: null, searchModel: "search-model",
    });
    const saved = await getPlanInterview(database.db, userId, conversationId);
    expect(text).toContain(`/app/plans/${saved?.planId}`);
    expect(saved?.state.answers.goal).toMatch(/offers/);
    expect(await database.db.select().from(campaignJobs)).toHaveLength(0);
  });

  it("keeps saved answers when the model returns a truncated tool result", async () => {
    const conversationId = (await createConversationTurn(database.db, {
      userId, requestId: crypto.randomUUID(), content: PLAN_MESSAGE, title: "Plan", assistantContent: "Ready",
    })).conversation.id;
    await runPlanInterview(database.db, {
      userId, conversationId, runId: "run_ok", message: PLAN_MESSAGE,
      provider: { complete: vi.fn(async () => asking("Sell workshop tools")) }, model: "contract-model", maxTokens: 1500, search: null, searchModel: "search-model",
    });
    await expect(runPlanInterview(database.db, {
      userId, conversationId, runId: "run_bad", message: "Practical tips",
      provider: { complete: vi.fn(async () => ({ ...asking(), toolCalls: [], stopReason: "max_tokens" })) },
      model: "contract-model", maxTokens: 1500, search: null, searchModel: "search-model",
    })).rejects.toMatchObject({ code: "INVALID_TOOL_ARGUMENTS" });
    expect((await getPlanInterview(database.db, userId, conversationId))?.state.answers.goal).toBe("Sell workshop tools");
    expect(await database.db.select().from(plans)).toHaveLength(0);
  });

  it("pauses on cancel wording without calling the model, then resumes saved answers", async () => {
    const conversationId = (await createConversationTurn(database.db, {
      userId, requestId: crypto.randomUUID(), content: PLAN_MESSAGE, title: "Plan", assistantContent: "Ready",
    })).conversation.id;
    const complete = vi.fn(async () => asking("Sell workshop tools"));
    await runPlanInterview(database.db, {
      userId, conversationId, runId: "run_ask_pause", message: PLAN_MESSAGE, provider: { complete }, model: "contract-model", maxTokens: 1500, search: null, searchModel: "search-model",
    });
    complete.mockClear();
    const paused = await runPlanInterview(database.db, {
      userId, conversationId, runId: "run_pause", message: "pause planning", provider: { complete }, model: "contract-model", maxTokens: 1500, search: null, searchModel: "search-model",
    });
    expect(paused).toMatch(/continue planning/i);
    expect(complete).not.toHaveBeenCalled();
    expect((await getPlanInterview(database.db, userId, conversationId))?.state).toMatchObject({
      status: "canceled", answers: { goal: "Sell workshop tools" },
    });
    complete.mockImplementation(async () => asking("Sell workshop tools"));
    const resumed = await runPlanInterview(database.db, {
      userId, conversationId, runId: "run_resume", message: "continue planning", provider: { complete }, model: "contract-model", maxTokens: 1500, search: null, searchModel: "search-model",
    });
    expect(resumed).toContain("What voice should this take?");
    expect((await getPlanInterview(database.db, userId, conversationId))?.state.status).toBe("asking");
    expect((await getPlanInterview(database.db, userId, conversationId))?.state.answers.goal).toBe("Sell workshop tools");
  });

  it("keeps stated request constraints across a later partial turn", async () => {
    const conversationId = (await createConversationTurn(database.db, {
      userId, requestId: crypto.randomUUID(), content: "Plan 7 days", title: "Plan", assistantContent: "Ready",
    })).conversation.id;
    await runPlanInterview(database.db, {
      userId, conversationId, runId: "run_constraints",
      message: "Plan 7 days on Threads, about 10 posts",
      mediaAssetIds: ["media_fixture_1"],
      provider: { complete: vi.fn(async () => asking()) }, model: "contract-model", maxTokens: 1500, search: null, searchModel: "search-model",
    });
    await runPlanInterview(database.db, {
      userId, conversationId, runId: "run_constraints_partial", message: "Sell workshop tools",
      provider: { complete: vi.fn(async () => asking("Sell workshop tools")) }, model: "contract-model", maxTokens: 1500, search: null, searchModel: "search-model",
    });
    expect((await getPlanInterview(database.db, userId, conversationId))?.state.request).toMatchObject({
      originalMessage: "Plan 7 days on Threads, about 10 posts",
      horizonDays: 7, itemCount: 10, platforms: ["threads"], attachmentIds: ["media_fixture_1"],
    });
  });

  it("records interview usage with unknown tokens when the provider omits them", async () => {
    const conversationId = (await createConversationTurn(database.db, {
      userId, requestId: crypto.randomUUID(), content: PLAN_MESSAGE, title: "Plan", assistantContent: "Ready",
    })).conversation.id;
    await runPlanInterview(database.db, {
      userId, conversationId, runId: "run_usage", message: PLAN_MESSAGE,
      provider: { complete: vi.fn(async () => asking()) }, model: "contract-model", maxTokens: 1500, search: null, searchModel: "search-model",
    });
    const rows = await database.db.select().from(usageAttempts);
    expect(rows.some(row => row.role === "plan_interview" && row.parentId === "run_usage" && row.outcome === "succeeded"
      && row.inputTokens === null && row.outputTokens === null)).toBe(true);
    expect(rows.some(row => row.role === "plan_interview" && row.inputTokens === 0)).toBe(false);
  });

  it("persists delegated research sources and rejects a duplicate stand-in", async () => {
    const conversationId = (await createConversationTurn(database.db, {
      userId, requestId: crypto.randomUUID(), content: PLAN_MESSAGE, title: "Plan", assistantContent: "Ready",
    })).conversation.id;
    const search = { searchWeb: vi.fn(async () => ({ ok: true, summary: "notes", sources: [knownSource, extraSource] })) };
    const complete = vi.fn(async (input: Parameters<ModelProvider["complete"]>[0]) => {
      if (input.toolChoice?.type === "tool" && input.toolChoice.name === "create_plan_document") {
        expect(JSON.parse(String(input.messages[0]?.content[0] && "text" in input.messages[0].content[0] ? input.messages[0].content[0].text : "{}")).request).toBeTruthy();
        return completion("create_plan_document", { title: "Workshop plan", document: document([knownSource, extraSource]) });
      }
      return delegated();
    });
    const text = await runPlanInterview(database.db, {
      userId, conversationId, runId: "run_research", message: "you decide",
      provider: { complete }, model: "contract-model", maxTokens: 1500, search, searchModel: "search-model",
    });
    const saved = await getPlanInterview(database.db, userId, conversationId);
    expect(text).toContain(`/app/plans/${saved?.planId}`);
    expect(saved?.state.sources).toEqual([knownSource, extraSource]);
    const researchUsage = (await database.db.select().from(usageAttempts)).find(row => row.role === "plan_research");
    expect(researchUsage).toMatchObject({ outcome: "succeeded", inputTokens: null, outputTokens: null });

    const otherConversation = (await createConversationTurn(database.db, {
      userId, requestId: crypto.randomUUID(), content: PLAN_MESSAGE, title: "Dup", assistantContent: "Ready",
    })).conversation.id;
    const duplicate = vi.fn(async (input: Parameters<ModelProvider["complete"]>[0]) => {
      if (input.toolChoice?.type === "tool" && input.toolChoice.name === "create_plan_document") {
        return completion("create_plan_document", { title: "Bad", document: document([knownSource, knownSource]) });
      }
      return delegated();
    });
    await expect(runPlanInterview(database.db, {
      userId, conversationId: otherConversation, runId: "run_dup", message: "you decide",
      provider: { complete: duplicate }, model: "contract-model", maxTokens: 1500, search, searchModel: "search-model",
    })).rejects.toMatchObject({ code: "INVALID_TOOL_ARGUMENTS" });
    expect((await getPlanInterview(database.db, userId, otherConversation))?.state.answers.goal).toBe("Sell workshop tools");
    expect((await getPlanInterview(database.db, userId, otherConversation))?.planId).toBeNull();
  });

  it("does not draft after failed research until the user chooses existing context", async () => {
    const conversationId = (await createConversationTurn(database.db, {
      userId, requestId: crypto.randomUUID(), content: PLAN_MESSAGE, title: "Plan", assistantContent: "Ready",
    })).conversation.id;
    const search = { searchWeb: vi.fn(async () => ({ ok: false, summary: "", sources: [] })) };
    const unavailable = await runPlanInterview(database.db, {
      userId, conversationId, runId: "run_unavail", message: "you decide",
      provider: { complete: vi.fn(async () => delegated()) }, model: "contract-model", maxTokens: 1500, search, searchModel: "search-model",
    });
    expect(unavailable).toMatch(/existing business context/i);
    expect((await getPlanInterview(database.db, userId, conversationId))?.state.status).toBe("research_unavailable");
    const skipped = await runPlanInterview(database.db, {
      userId, conversationId, runId: "run_skip", message: "just write it",
      provider: { complete: vi.fn(async () => ready(false)) }, model: "contract-model", maxTokens: 1500, search, searchModel: "search-model",
    });
    expect(skipped).toMatch(/existing business context/i);
    expect((await getPlanInterview(database.db, userId, conversationId))?.planId).toBeNull();
    const complete = vi.fn(async (input: Parameters<ModelProvider["complete"]>[0]) => {
      if (input.toolChoice?.type === "tool" && input.toolChoice.name === "create_plan_document") {
        const payload = JSON.parse(String(input.messages[0]?.content[0] && "text" in input.messages[0].content[0] ? input.messages[0].content[0].text : "{}")) as { sources: unknown[] };
        expect(payload.sources).toEqual([]);
        return completion("create_plan_document", { title: "Workshop plan", document: document() });
      }
      return ready(true);
    });
    const drafted = await runPlanInterview(database.db, {
      userId, conversationId, runId: "run_continue", message: "use existing context",
      provider: { complete }, model: "contract-model", maxTokens: 1500, search, searchModel: "search-model",
    });
    const saved = await getPlanInterview(database.db, userId, conversationId);
    expect(drafted).toContain(`/app/plans/${saved?.planId}`);
    const sourcesSection = (await getPlan(database.db, userId, saved!.planId!)).version.document.sections.find(section => section.type === "sources");
    expect(sourcesSection?.blocks.some(block => block.kind === "sources")).toBeFalsy();
  });

  it("does not treat a usage bookkeeping failure as missing research", async () => {
    const conversationId = (await createConversationTurn(database.db, {
      userId, requestId: crypto.randomUUID(), content: PLAN_MESSAGE, title: "Plan", assistantContent: "Ready",
    })).conversation.id;
    await expect(runPlanInterview(database.db, {
      userId, conversationId, runId: "run_bookkeeping", message: "you decide",
      provider: { complete: vi.fn(async () => delegated()) }, model: "contract-model", maxTokens: 1500,
      search: { searchWeb: vi.fn(async () => { throw new Error("USAGE_PERSISTENCE_FAILED"); }) }, searchModel: "search-model",
    })).rejects.toMatchObject({ message: "USAGE_PERSISTENCE_FAILED" });
    expect((await getPlanInterview(database.db, userId, conversationId))?.state.status).toBe("delegated");
    expect((await getPlanInterview(database.db, userId, conversationId))?.planId).toBeNull();
  });
});

describe("plan interview chat routing", () => {
  let database: Database;
  let userId: string;
  let model: ModelProvider;
  let mcp: SocialMcpGateway;
  let service: DefaultOrchestrationService;
  beforeAll(() => { database = createDb(requireTestDatabaseUrl()); });
  afterAll(async () => { await database.client.end({ timeout: 5 }); });
  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "plan-interview-chat@example.com")).id;
    model = { complete: vi.fn() };
    mcp = { callTool: vi.fn(), listTools: vi.fn() };
    service = new DefaultOrchestrationService(database.db, config, model, mcp);
  });

  it("opens an interview from chat, replays the same request, and never calls SocialMCP", async () => {
    vi.mocked(model.complete).mockImplementation(async (input) => {
      if (input.toolChoice?.type === "tool" && input.toolChoice.name === "create_plan_document") {
        return completion("create_plan_document", { title: "Workshop plan", document: document() });
      }
      return asking();
    });
    const input = { message: PLAN_MESSAGE, requestId: "00000000-0000-4000-8000-00000000c001" };
    const first = await service.createConversation(userId, input);
    const replayed = await service.createConversation(userId, input);
    expect(first.assistantMessage?.content).toContain("What should this campaign achieve?");
    expect(replayed.run?.id).toBe(first.run?.id);
    expect(model.complete).toHaveBeenCalledTimes(1);
    expect(mcp.callTool).not.toHaveBeenCalled();
    expect(await database.db.select().from(campaignJobs)).toHaveLength(0);

    vi.mocked(model.complete).mockImplementation(async (input) => {
      if (input.toolChoice?.type === "tool" && input.toolChoice.name === "create_plan_document") {
        return completion("create_plan_document", { title: "Workshop plan", document: document() });
      }
      return ready();
    });
    const planned = await service.addMessage(userId, first.conversation.id, {
      message: "Sell workshop tools with practical shop-floor tips",
      requestId: "00000000-0000-4000-8000-00000000c002",
    });
    const saved = await getPlanInterview(database.db, userId, first.conversation.id);
    expect(planned.assistantMessage?.content).toContain(`/app/plans/${saved?.planId}`);
    expect(planned.assistantMessage?.content).toContain("Open the post board");
    expect(await database.db.select().from(contentGenerationJobs)).toHaveLength(0);
    expect(mcp.callTool).not.toHaveBeenCalled();

    const accepted = await service.addMessage(userId, first.conversation.id, {
      message: "looks good",
      requestId: "00000000-0000-4000-8000-00000000c003",
    });
    expect(accepted.assistantMessage?.content).toContain("Open the post board");
    expect(accepted.assistantMessage?.content).not.toContain("Approve its direction");
    const goAhead = await service.addMessage(userId, first.conversation.id, {
      message: "go ahead",
      requestId: "00000000-0000-4000-8000-00000000c004",
    });
    expect(goAhead.assistantMessage?.content).toContain(`/app/plans/${saved?.planId}`);
    expect(mcp.callTool).not.toHaveBeenCalled();
    expect(await database.db.select().from(campaignJobs)).toHaveLength(0);
  });

  it("keeps ordinary follow-up in chat after a saved plan", async () => {
    const chat = new DefaultOrchestrationService(
      database.db,
      { ...config, theseanIntentModel: "gpt-intent" },
      model,
      mcp,
      new PublishingPreferenceService(database.db),
      undefined,
      undefined,
      model,
    );
    vi.mocked(model.complete).mockImplementation(async (input) => {
      const name = input.toolChoice?.type === "tool" ? input.toolChoice.name : "";
      if (name === "record_plan_clerk") {
        return completion("record_plan_clerk", {
          intent: "plan", startDate: null, timezone: null, cadence: {}, platforms: null, timeMode: null,
          isGo: false, isIncomplete: false, isConversationMeta: false,
        });
      }
      if (name === "create_plan_document") return completion("create_plan_document", { title: "Workshop plan", document: document() });
      if (name === "record_plan_interview") return input.messages[0]?.content[0] && "text" in input.messages[0].content[0] && input.messages[0].content[0].text.includes("workshop") ? ready() : asking();
      return { content: "What would you like to talk about?", thinking: null, toolCalls: [], inputTokens: 1, outputTokens: 1, attempts: 1 };
    });
    const first = await chat.createConversation(userId, {
      message: PLAN_MESSAGE, requestId: "00000000-0000-4000-8000-00000000c091",
    });
    await chat.addMessage(userId, first.conversation.id, {
      message: "Sell workshop tools with practical shop-floor tips",
      requestId: "00000000-0000-4000-8000-00000000c092",
    });
    const hey = await chat.addMessage(userId, first.conversation.id, {
      message: "Hey", requestId: "00000000-0000-4000-8000-00000000c093",
    });
    expect(hey.assistantMessage?.content).toContain("What would you like to talk about?");
    expect(hey.assistantMessage?.content).not.toContain("Approve its direction");
    expect(hey.assistantMessage?.content).not.toContain("Open the post board");
    vi.mocked(model.complete).mockImplementation(async (input) => {
      const name = input.toolChoice?.type === "tool" ? input.toolChoice.name : "";
      if (name === "record_plan_clerk") {
        return completion("record_plan_clerk", {
          intent: "accept", startDate: null, timezone: null, cadence: {}, platforms: null, timeMode: null,
          isGo: true, isIncomplete: false, isConversationMeta: false,
        });
      }
      return { content: "We can talk about something else.", thinking: null, toolCalls: [], inputTokens: 1, outputTokens: 1, attempts: 1 };
    });
    const aside = await chat.addMessage(userId, first.conversation.id, {
      message: "That's not what I want to talk about",
      requestId: "00000000-0000-4000-8000-00000000c094",
    });
    expect(aside.assistantMessage?.content).toContain("We can talk about something else.");
    expect(aside.assistantMessage?.content).not.toContain("Approve its direction");
    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it("keeps create-content, schedule, and publish-now on review after a saved plan", async () => {
    vi.mocked(model.complete).mockImplementation(async (input) => {
      if (input.toolChoice?.type === "tool" && input.toolChoice.name === "create_plan_document") {
        return completion("create_plan_document", { title: "Workshop plan", document: document() });
      }
      return asking();
    });
    const first = await service.createConversation(userId, {
      message: PLAN_MESSAGE, requestId: "00000000-0000-4000-8000-00000000c031",
    });
    vi.mocked(model.complete).mockImplementation(async (input) => {
      if (input.toolChoice?.type === "tool" && input.toolChoice.name === "create_plan_document") {
        return completion("create_plan_document", { title: "Workshop plan", document: document() });
      }
      return ready();
    });
    const planned = await service.addMessage(userId, first.conversation.id, {
      message: "Sell workshop tools with practical shop-floor tips",
      requestId: "00000000-0000-4000-8000-00000000c032",
    });
    const saved = await getPlanInterview(database.db, userId, first.conversation.id);
    expect(planned.assistantMessage?.content).toContain(`/app/plans/${saved?.planId}`);
    await approvePlanDirection(database.db, { userId, planId: saved!.planId!, version: 1 });
    vi.mocked(model.complete).mockClear();
    for (const [index, message] of ["create content", "the plan is approved, schedule it", "publish now"].entries()) {
      const reply = await service.addMessage(userId, first.conversation.id, {
        message, requestId: `00000000-0000-4000-8000-00000000c04${index}`,
      });
      expect(reply.assistantMessage?.content).toContain(`/app/plans/${saved?.planId}`);
    }
    expect(mcp.callTool).not.toHaveBeenCalled();
    expect(vi.mocked(model.complete)).not.toHaveBeenCalled();
    expect(await database.db.select().from(campaignJobs)).toHaveLength(0);
  });

  it("stops capturing chat after pause until the user resumes planning", async () => {
    vi.mocked(model.complete).mockImplementation(async () => asking("Sell workshop tools"));
    const first = await service.createConversation(userId, {
      message: PLAN_MESSAGE, requestId: "00000000-0000-4000-8000-00000000c021",
    });
    const paused = await service.addMessage(userId, first.conversation.id, {
      message: "cancel planning", requestId: "00000000-0000-4000-8000-00000000c022",
    });
    expect(paused.assistantMessage?.content).toMatch(/continue planning/i);
    expect((await getPlanInterview(database.db, userId, first.conversation.id))?.state.status).toBe("canceled");
    vi.mocked(model.complete).mockClear();
    vi.mocked(model.complete).mockImplementation(async (input) => {
      if (input.tools?.some(tool => tool.name === "record_plan_interview")) return asking("Sell workshop tools");
      return {
        content: "Threads and LinkedIn Personal are the connected destinations I can check.",
        thinking: null, toolCalls: [], inputTokens: 4, outputTokens: 8, attempts: 1,
      };
    });
    const unrelated = await service.addMessage(userId, first.conversation.id, {
      message: "Which social accounts are connected?", requestId: "00000000-0000-4000-8000-00000000c023",
    });
    expect(unrelated.assistantMessage?.content).toMatch(/connected/i);
    expect((await getPlanInterview(database.db, userId, first.conversation.id))?.state.status).toBe("canceled");
    expect(mcp.callTool).not.toHaveBeenCalled();
    vi.mocked(model.complete).mockImplementation(async () => asking("Sell workshop tools"));
    const resumed = await service.addMessage(userId, first.conversation.id, {
      message: "continue planning", requestId: "00000000-0000-4000-8000-00000000c024",
    });
    expect(resumed.assistantMessage?.content).toContain("What voice should this take?");
    expect((await getPlanInterview(database.db, userId, first.conversation.id))?.state.status).toBe("asking");
  });

  it("fails the run visibly on a malformed classifier without scheduling", async () => {
    vi.mocked(model.complete)
      .mockResolvedValueOnce(asking("Sell workshop tools"))
      .mockResolvedValueOnce({ ...asking(), toolCalls: [], stopReason: "max_tokens" });
    const first = await service.createConversation(userId, {
      message: PLAN_MESSAGE, requestId: "00000000-0000-4000-8000-00000000c011",
    });
    const failed = await service.addMessage(userId, first.conversation.id, {
      message: "Practical tips", requestId: "00000000-0000-4000-8000-00000000c012",
    });
    expect(failed.run?.status).toBe("failed");
    expect(failed.assistantMessage?.content).toMatch(/saved answers/i);
    expect((await getPlanInterview(database.db, userId, first.conversation.id))?.state.answers.goal).toBe("Sell workshop tools");
    expect(mcp.callTool).not.toHaveBeenCalled();
  });
});
