import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  campaignJobs,
  createConversationTurn,
  createDb,
  getPlan,
  getPlanInterview,
  plans,
  provisionUser,
  requireTestDatabaseUrl,
  type Database,
  type PlanDocument,
} from "@sochestral/database";
import type { OrchestrationConfig } from "./config.js";
import type { SocialMcpGateway } from "./mcp.js";
import type { ModelCompletion, ModelProvider } from "./model.js";
import { DefaultOrchestrationService } from "./service.js";
import { runPlanInterview } from "./plan-interview.js";

const PLAN_MESSAGE = "Plan the next 2 weeks";

function document(): PlanDocument {
  return { schemaVersion: 1, sections: (["goal", "audience_voice", "direction", "calendar", "sources", "missing_inputs"] as const).map(type => ({
    id: `section_${type}`, type, title: type, blocks: [{ id: `block_${type}`, kind: "paragraph" as const, text: `Discuss ${type}` }],
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

function ready() {
  return completion("record_plan_interview", {
    status: "ready",
    answers: { goal: "Sell workshop tools", newsAssets: "New bench series", direction: "Practical shop-floor tips" },
    questions: [],
    useExistingContext: true,
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
    expect(complete.mock.calls.filter(call => call[0].toolChoice?.type === "tool" && call[0].toolChoice.name === "create_plan_document")).toHaveLength(1);
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
    expect(mcp.callTool).not.toHaveBeenCalled();

    const accepted = await service.addMessage(userId, first.conversation.id, {
      message: "looks good",
      requestId: "00000000-0000-4000-8000-00000000c003",
    });
    expect(accepted.assistantMessage?.content).toContain(`/app/plans/${saved?.planId}`);
    expect(mcp.callTool).not.toHaveBeenCalled();
    expect(await database.db.select().from(campaignJobs)).toHaveLength(0);
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
