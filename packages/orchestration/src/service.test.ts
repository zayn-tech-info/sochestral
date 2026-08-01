import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  appendConversationTurn,
  createConversationTurn,
  createDb,
  orchestrationMessages,
  orchestrationRuns,
  orchestrationToolCalls,
  provisionUser,
  requireTestDatabaseUrl,
  type Database,
} from "@sochestral/database";
import type { OrchestrationConfig } from "./config.js";
import { OrchestrationError } from "./errors.js";
import type { SocialMcpGateway } from "./mcp.js";
import type { ModelProvider } from "./model.js";
import { DefaultOrchestrationService } from "./service.js";

const config: OrchestrationConfig = {
  theseanApiKey: "unused",
  theseanModel: "contract-model",
  socialMcpUrl: "https://social.example/mcp",
  contextTokenLimit: 6000,
  outputTokenLimit: 1500,
  maxToolSteps: 4,
  dailyRunLimit: 50,
  externalTimeoutMs: 1000,
};

function modelCompletion(
  input: {
    content?: string | null;
    toolCalls?: Array<{ id: string; name: string; input: unknown }>;
    attempts?: number;
  } = {},
) {
  return {
    content: input.content ?? null,
    toolCalls: input.toolCalls ?? [],
    inputTokens: 10,
    outputTokens: 5,
    attempts: input.attempts ?? 1,
  };
}

function toolCall(
  id: string,
  name: string,
  args: Record<string, unknown>,
) {
  return {
    id,
    name,
    input: args,
  };
}

describe("DefaultOrchestrationService", () => {
  let database: Database;
  let userId: string;
  let model: ModelProvider;
  let mcp: SocialMcpGateway;
  let service: DefaultOrchestrationService;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "orchestration@example.com")).id;
    model = { complete: vi.fn() };
    mcp = { callTool: vi.fn(), listTools: vi.fn() };
    service = new DefaultOrchestrationService(
      database.db,
      config,
      model,
      mcp,
    );
  });

  it("runs one authenticated dry run turn and stores safe history (AC-1, AC-3, AC-4, AC-5, AC-6, AC-9, AC-10, AC-11)", async () => {
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_1", "publish_now", {
              platforms: ["threads"],
              text: "Launch day",
              dryRun: false,
              confirm: true,
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({ content: "Your Threads preview is ready." }),
      );
    vi.mocked(mcp.callTool).mockResolvedValue({
      attempts: 1,
      value: {
        ok: true,
        dryRun: true,
        wouldPublishTo: ["threads"],
        preview: {
          textPlan: "Launch day",
          mediaPlan: { count: 0 },
          risks: [],
        },
        internalPostId: "private-id",
      },
    });

    const result = await service.createConversation(userId, {
      message: "Post Launch day on Threads",
      requestId: "00000000-0000-4000-8000-000000000001",
    });

    expect(mcp.callTool).toHaveBeenCalledWith({
      userId,
      name: "publish_now",
      arguments: {
        platforms: ["threads"],
        text: "Launch day",
        dryRun: true,
      },
    });
    expect(result.run).toMatchObject({
      status: "completed",
      model: "contract-model",
      modelStepCount: 2,
      targetPlatforms: ["threads"],
    });
    expect(result.toolSummaries[0]?.summary).toEqual({
      ok: true,
      dryRun: true,
      platforms: ["threads"],
      previewText: "Launch day",
      mediaItemCount: 0,
      warnings: [],
    });
    expect(JSON.stringify(result)).not.toContain("private-id");
  });

  it("stores a clarification without calling external services (AC-2)", async () => {
    const result = await service.createConversation(userId, {
      message: "Post this everywhere",
      requestId: "00000000-0000-4000-8000-000000000002",
    });

    expect(result.run).toBeNull();
    expect(result.assistantMessage.content).toContain(
      "Please name Threads, LinkedIn, Instagram",
    );
    expect(model.complete).not.toHaveBeenCalled();
    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it("returns the original terminal result for a repeated request id (AC-1)", async () => {
    vi.mocked(model.complete).mockResolvedValue(
      modelCompletion({ content: "Ready" }),
    );
    const input = {
      message: "Preview this on Threads",
      requestId: "00000000-0000-4000-8000-000000000003",
    };

    const first = await service.createConversation(userId, input);
    const repeated = await service.createConversation(userId, input);

    expect(repeated).toEqual(first);
    expect(model.complete).toHaveBeenCalledTimes(1);
    const messages = await database.db
      .select()
      .from(orchestrationMessages)
      .where(eq(orchestrationMessages.conversationId, first.conversation.id));
    expect(messages).toHaveLength(2);
  });

  it("redacts MCP errors before they reach the model or database (AC-6, AC-7, AC-9)", async () => {
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_secret", "validate_post", {
              platforms: ["threads"],
              text: "Launch",
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(modelCompletion({ content: "Safe result" }));
    vi.mocked(mcp.callTool).mockResolvedValue({
      attempts: 1,
      value: {
        ok: false,
        valid: false,
        errors: ["Bearer top.secret-token"],
        authorization: "Bearer top.secret-token",
      },
    });

    const result = await service.createConversation(userId, {
      message: "Validate Launch on Threads",
      requestId: "00000000-0000-4000-8000-000000000004",
    });

    const secondModelInput = vi.mocked(model.complete).mock.calls[1]?.[0];
    expect(JSON.stringify(secondModelInput)).not.toContain("top.secret-token");
    expect(JSON.stringify(result)).not.toContain("top.secret-token");
    const stored = await database.db
      .select()
      .from(orchestrationToolCalls)
      .where(eq(orchestrationToolCalls.runId, result.run!.id));
    expect(JSON.stringify(stored)).not.toContain("top.secret-token");
  });

  it("stops at the configured tool step cap (AC-3, AC-10)", async () => {
    service = new DefaultOrchestrationService(
      database.db,
      { ...config, maxToolSteps: 2 },
      model,
      mcp,
    );
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_1", "validate_post", {
              platforms: ["threads"],
              text: "Launch",
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_2", "validate_post", {
              platforms: ["threads"],
              text: "Launch",
            }),
          ],
        }),
      );
    vi.mocked(mcp.callTool).mockResolvedValue({
      attempts: 1,
      value: { ok: true, valid: true },
    });

    await expect(
      service.createConversation(userId, {
        message: "Validate Launch on Threads",
        requestId: "00000000-0000-4000-8000-000000000005",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_TOOL_ARGUMENTS",
      status: 422,
    });
    expect(model.complete).toHaveBeenCalledTimes(2);
    expect(mcp.callTool).toHaveBeenCalledTimes(1);
  });

  it("persists a safe failed run after SocialMCP terminal failure (AC-7)", async () => {
    vi.mocked(model.complete).mockResolvedValue(
      modelCompletion({
        toolCalls: [
          toolCall("call_fail", "publish_now", {
            platforms: ["threads"],
            text: "Launch",
          }),
        ],
      }),
    );
    vi.mocked(mcp.callTool).mockRejectedValue(
      new OrchestrationError(
        "SOCIALMCP_UNAVAILABLE",
        502,
        "Bearer private-secret",
      ),
    );

    let rejection: OrchestrationError | undefined;
    try {
      await service.createConversation(userId, {
        message: "Post Launch on Threads",
        requestId: "00000000-0000-4000-8000-000000000006",
      });
    } catch (error) {
      rejection = error as OrchestrationError;
    }

    expect(rejection).toMatchObject({
      code: "SOCIALMCP_UNAVAILABLE",
      status: 502,
    });
    expect(JSON.stringify(rejection!.details)).not.toContain("private-secret");
    const [run] = await database.db
      .select()
      .from(orchestrationRuns)
      .where(
        eq(
          orchestrationRuns.id,
          String(rejection!.details?.runId),
        ),
      );
    expect(run).toMatchObject({
      status: "failed",
      safeError: "SOCIALMCP_UNAVAILABLE",
    });
  });

  it("rejects oversized input before model or MCP execution (AC-10)", async () => {
    await expect(
      service.createConversation(userId, {
        message: "x".repeat(8001),
        requestId: "00000000-0000-4000-8000-000000000007",
      }),
    ).rejects.toMatchObject({ code: "INVALID_MESSAGE", status: 422 });
    expect(model.complete).not.toHaveBeenCalled();
    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it("keeps the triggering message while omitting old history outside the context budget (AC-8)", async () => {
    const oldMarker = `old-marker-${"x".repeat(900)}`;
    const turn = await createConversationTurn(database.db, {
      userId,
      requestId: "00000000-0000-4000-8000-000000000009",
      content: oldMarker,
      title: "Old context",
      assistantContent: "Old response",
    });
    for (let index = 0; index < 3; index += 1) {
      await appendConversationTurn(database.db, turn.conversation.id, {
        userId,
        requestId: `00000000-0000-4000-8000-00000000001${index}`,
        content: `middle-${index}-${"y".repeat(900)}`,
        assistantContent: `middle response ${index}`,
      });
    }
    service = new DefaultOrchestrationService(
      database.db,
      {
        ...config,
        contextTokenLimit: 2500,
        outputTokenLimit: 500,
      },
      model,
      mcp,
    );
    vi.mocked(model.complete).mockResolvedValue(
      modelCompletion({ content: "Ready" }),
    );

    await service.addMessage(userId, turn.conversation.id, {
      message: "Preview the current update on Threads",
      requestId: "00000000-0000-4000-8000-000000000020",
    });

    const sentMessages = vi.mocked(model.complete).mock.calls[0]?.[0].messages;
    expect(JSON.stringify(sentMessages)).toContain(
      "Preview the current update on Threads",
    );
    expect(JSON.stringify(sentMessages)).not.toContain("old-marker");
    const storedMessages = await database.db
      .select()
      .from(orchestrationMessages)
      .where(eq(orchestrationMessages.conversationId, turn.conversation.id));
    expect(storedMessages.some((row) => row.content === oldMarker)).toBe(true);
  });

  it("paginates conversation lists and message history without overlap (AC-1, AC-9)", async () => {
    const conversationIds: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const created = await service.createConversation(userId, {
        message: `Post this everywhere ${index}`,
        requestId: `00000000-0000-4000-8000-00000000003${index}`,
      });
      conversationIds.push(created.conversation.id);
    }
    const firstList = await service.listConversations(userId, { limit: 2 });
    const secondList = await service.listConversations(userId, {
      limit: 2,
      cursor: firstList.nextCursor!,
    });

    expect(firstList.conversations).toHaveLength(2);
    expect(secondList.conversations).toHaveLength(1);
    expect(
      new Set(
        [...firstList.conversations, ...secondList.conversations].map(
          (row) => row.id,
        ),
      ),
    ).toEqual(new Set(conversationIds));

    const targetId = conversationIds[0]!;
    await service.addMessage(userId, targetId, {
      message: "Post this everywhere again",
      requestId: "00000000-0000-4000-8000-000000000040",
    });
    await service.addMessage(userId, targetId, {
      message: "Post this everywhere once more",
      requestId: "00000000-0000-4000-8000-000000000041",
    });
    const firstHistory = await service.getConversation(userId, targetId, {
      limit: 2,
    });
    const secondHistory = await service.getConversation(userId, targetId, {
      limit: 2,
      cursor: firstHistory.nextCursor!,
    });

    expect(firstHistory.messages).toHaveLength(2);
    expect(secondHistory.messages).toHaveLength(2);
    expect(
      firstHistory.messages.some((first) =>
        secondHistory.messages.some((second) => second.id === first.id),
      ),
    ).toBe(false);
  });

  it("returns invalid model tool names for correction without calling MCP (AC-3, AC-7)", async () => {
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [toolCall("call_unknown", "delete_account", {})],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({ content: "I need a supported action." }),
      );

    const result = await service.createConversation(userId, {
      message: "Preview this on Threads",
      requestId: "00000000-0000-4000-8000-000000000050",
    });

    expect(result.run?.status).toBe("completed");
    expect(mcp.callTool).not.toHaveBeenCalled();
    const correctionInput = vi.mocked(model.complete).mock.calls[1]?.[0];
    expect(JSON.stringify(correctionInput)).toContain(
      "INVALID_TOOL_ARGUMENTS",
    );
  });

  it("makes no external call when the initial database transaction fails (AC-7)", async () => {
    await expect(
      service.createConversation("user_missing", {
        message: "Post Launch on Threads",
        requestId: "00000000-0000-4000-8000-000000000008",
      }),
    ).rejects.toBeDefined();
    expect(model.complete).not.toHaveBeenCalled();
    expect(mcp.callTool).not.toHaveBeenCalled();
  });
});
