import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDb,
  provisionUser,
  requireTestDatabaseUrl,
  type Database,
} from "@sochestral/database";
import {
  createSession,
  SESSION_COOKIE_NAME,
} from "@sochestral/auth";
import {
  OrchestrationError,
  type OrchestrationService,
  type TurnResponse,
} from "@sochestral/orchestration";
import { createApp } from "./app.js";

const turnResponse: TurnResponse = {
  conversation: {
    id: "conv_public",
    title: "Post on Threads",
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:01.000Z",
  },
  userMessage: {
    id: "msg_user",
    role: "user",
    content: "Post on Threads",
    sequence: 1,
    createdAt: "2026-07-26T00:00:00.000Z",
  },
  assistantMessage: {
    id: "msg_assistant",
    role: "assistant",
    content: "Preview ready",
    sequence: 2,
    createdAt: "2026-07-26T00:00:01.000Z",
  },
  run: {
    id: "run_public",
    status: "completed",
    provider: "thesean",
    model: "contract-model",
    targetPlatforms: ["threads"],
    modelStepCount: 1,
    inputTokens: 10,
    outputTokens: 2,
    durationMs: 5,
    safeError: null,
    createdAt: "2026-07-26T00:00:00.000Z",
    completedAt: "2026-07-26T00:00:01.000Z",
  },
  toolSummaries: [],
};

function serviceMock(): OrchestrationService {
  return {
    createConversation: vi.fn().mockResolvedValue(turnResponse),
    addMessage: vi.fn().mockResolvedValue(turnResponse),
    listConversations: vi.fn().mockResolvedValue({
      conversations: [turnResponse.conversation],
      nextCursor: null,
    }),
    getConversation: vi.fn().mockResolvedValue({
      conversation: turnResponse.conversation,
      messages: [turnResponse.userMessage, turnResponse.assistantMessage],
      runs: [turnResponse.run],
      toolSummaries: [],
      nextCursor: null,
    }),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
  };
}

describe("orchestration API routes", () => {
  let database: Database;
  let userId: string;
  let cookie: string;
  let service: OrchestrationService;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.client`delete from users`;
    const user = await provisionUser(database.db, "route-owner@example.com");
    userId = user.id;
    const session = await createSession(database.db, user.id);
    cookie = `${SESSION_COOKIE_NAME}=${session.rawToken}`;
    service = serviceMock();
    app = createApp(database.db, service);
  });

  it.each([
    ["POST", "/orchestration/conversations"],
    ["GET", "/orchestration/conversations"],
    ["POST", "/orchestration/conversations/conv_1/messages"],
    ["GET", "/orchestration/conversations/conv_1"],
    ["DELETE", "/orchestration/conversations/conv_1"],
  ])("requires a session for %s %s (AC-1, AC-11)", async (method, path) => {
    const response = await app.request(path, { method });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "UNAUTHORIZED" });
  });

  it("creates a conversation for the session user only (AC-1, AC-9, AC-11)", async () => {
    const response = await app.request("/orchestration/conversations", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Post on Threads",
        requestId: "20000000-0000-4000-8000-000000000001",
        userId: "user_attacker",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(turnResponse);
    expect(service.createConversation).toHaveBeenCalledWith(userId, {
      message: "Post on Threads",
      requestId: "20000000-0000-4000-8000-000000000001",
    });
    expect(JSON.stringify(vi.mocked(service.createConversation).mock.calls)).not
      .toContain("user_attacker");
  });

  it("passes cursor and numeric limits to conversation listing (AC-9)", async () => {
    const response = await app.request(
      "/orchestration/conversations?cursor=opaque&limit=12",
      { headers: { Cookie: cookie } },
    );

    expect(response.status).toBe(200);
    expect(service.listConversations).toHaveBeenCalledWith(userId, {
      cursor: "opaque",
      limit: 12,
    });
  });

  it("delegates message, history, and delete operations to the owner service (AC-1, AC-6, AC-9)", async () => {
    const message = await app.request(
      "/orchestration/conversations/conv_public/messages",
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Continue on Threads",
          requestId: "20000000-0000-4000-8000-000000000002",
        }),
      },
    );
    const history = await app.request(
      "/orchestration/conversations/conv_public?cursor=older&limit=5",
      { headers: { Cookie: cookie } },
    );
    const removed = await app.request(
      "/orchestration/conversations/conv_public",
      { method: "DELETE", headers: { Cookie: cookie } },
    );

    expect(message.status).toBe(200);
    expect(service.addMessage).toHaveBeenCalledWith(
      userId,
      "conv_public",
      {
        message: "Continue on Threads",
        requestId: "20000000-0000-4000-8000-000000000002",
      },
    );
    expect(history.status).toBe(200);
    expect(service.getConversation).toHaveBeenCalledWith(
      userId,
      "conv_public",
      { cursor: "older", limit: 5 },
    );
    expect(removed.status).toBe(204);
    expect(service.deleteConversation).toHaveBeenCalledWith(
      userId,
      "conv_public",
    );
  });

  it("maps stable orchestration failures and keeps recovery details (AC-7, AC-9)", async () => {
    vi.mocked(service.createConversation).mockRejectedValue(
      new OrchestrationError(
        "SOCIALMCP_UNAVAILABLE",
        502,
        "safe message",
        {
          conversationId: "conv_public",
          runId: "run_public",
          assistantMessage: turnResponse.assistantMessage,
        },
      ),
    );

    const response = await app.request("/orchestration/conversations", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Post on Threads",
        requestId: "20000000-0000-4000-8000-000000000003",
      }),
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "SOCIALMCP_UNAVAILABLE",
      conversationId: "conv_public",
      runId: "run_public",
      assistantMessage: turnResponse.assistantMessage,
    });
  });

  it("returns a stable internal error without leaking exception text (AC-9)", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.mocked(service.getConversation).mockRejectedValue(
      new Error("Bearer private-secret and stack trace"),
    );

    const response = await app.request(
      "/orchestration/conversations/conv_public",
      { headers: { Cookie: cookie } },
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "INTERNAL_ERROR" });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "private-secret",
    );
    consoleError.mockRestore();
  });
});
