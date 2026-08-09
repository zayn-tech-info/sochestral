import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Database } from "./client.js";
import { requireTestDatabaseUrl } from "./env.js";
import {
  appendConversationTurn,
  completeOrchestrationRun,
  createConversationTurn,
  createOrchestrationToolCall,
  deleteOwnedConversation,
  findOwnedTurnByRequestId,
  finishOrchestrationToolCall,
  getOwnedConversation,
  listAllConversationMessages,
  listConversationRuns,
  listOwnedConversations,
  listRunToolCalls,
  OrchestrationDatabaseError,
  updateOwnedConversationTitle,
} from "./orchestration.js";
import {
  orchestrationConversations,
  orchestrationMessages,
  orchestrationRuns,
  orchestrationToolCalls,
} from "./schema.js";
import { provisionUser } from "./users.js";

describe("orchestration database", () => {
  let database: Database;
  let ownerId: string;
  let otherId: string;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.client`delete from users`;
    ownerId = (await provisionUser(database.db, "db-owner@example.com")).id;
    otherId = (await provisionUser(database.db, "db-other@example.com")).id;
  });

  it("stores ordered clarification turns without a run (AC-1, AC-2, AC-6)", async () => {
    const first = await createConversationTurn(database.db, {
      userId: ownerId,
      requestId: "10000000-0000-4000-8000-000000000001",
      content: "Post this everywhere",
      title: "Post this everywhere",
      assistantContent: "Name a platform",
    });
    const second = await appendConversationTurn(
      database.db,
      first.conversation.id,
      {
        userId: ownerId,
        requestId: "10000000-0000-4000-8000-000000000002",
        content: "Use Threads",
        assistantContent: "Thanks",
      },
    );

    expect(first.run).toBeNull();
    expect(second.userMessage.sequence).toBe(3);
    expect(second.assistantMessage?.sequence).toBe(4);
    const messages = await listAllConversationMessages(
      database.db,
      first.conversation.id,
    );
    expect(messages.map((row) => row.content)).toEqual([
      "Post this everywhere",
      "Name a platform",
      "Use Threads",
      "Thanks",
    ]);
  });

  it("scopes reads and request id lookup to the owner (AC-1, AC-11)", async () => {
    const turn = await createConversationTurn(database.db, {
      userId: ownerId,
      requestId: "10000000-0000-4000-8000-000000000003",
      content: "Preview on Threads",
      title: "Preview on Threads",
      assistantContent: "Ready",
    });

    await expect(
      getOwnedConversation(database.db, ownerId, turn.conversation.id),
    ).resolves.toMatchObject({ id: turn.conversation.id });
    await expect(
      getOwnedConversation(database.db, otherId, turn.conversation.id),
    ).resolves.toBeNull();
    await expect(
      findOwnedTurnByRequestId(
        database.db,
        otherId,
        "10000000-0000-4000-8000-000000000003",
      ),
    ).resolves.toBeNull();
    await expect(
      listOwnedConversations(database.db, otherId, 25),
    ).resolves.toEqual([]);
  });

  it("blocks a second active run while one is running (AC-8)", async () => {
    const turn = await createConversationTurn(database.db, {
      userId: ownerId,
      requestId: "10000000-0000-4000-8000-000000000004",
      content: "Post on Threads",
      title: "Post on Threads",
      provider: "thesean",
      model: "contract-model",
      targetPlatforms: ["threads"],
    });

    await expect(
      appendConversationTurn(database.db, turn.conversation.id, {
        userId: ownerId,
        requestId: "10000000-0000-4000-8000-000000000005",
        content: "Another post on Threads",
        provider: "thesean",
        model: "contract-model",
        targetPlatforms: ["threads"],
      }),
    ).rejects.toMatchObject({
      code: "RUN_IN_PROGRESS",
    } satisfies Partial<OrchestrationDatabaseError>);
  });

  it("cancels a running chat turn when the conversation is deleted", async () => {
    const turn = await createConversationTurn(database.db, {
      userId: ownerId,
      requestId: "10000000-0000-4000-8000-000000000042",
      content: "Post on Threads",
      title: "Post on Threads",
      provider: "thesean",
      model: "contract-model",
      targetPlatforms: ["threads"],
    });

    expect(
      await deleteOwnedConversation(database.db, ownerId, turn.conversation.id),
    ).toBe(true);
    expect(
      await getOwnedConversation(database.db, ownerId, turn.conversation.id),
    ).toBeNull();
  });

  it("recovers an interrupted stale run before appending a retry", async () => {
    const turn = await createConversationTurn(database.db, {
      userId: ownerId,
      requestId: "10000000-0000-4000-8000-000000000040",
      content: "Publish this image on Threads",
      title: "Publish this image on Threads",
      provider: "thesean",
      model: "contract-model",
      targetPlatforms: ["threads"],
    });
    const staleCreatedAt = new Date(Date.now() - 120_000);
    await database.db
      .update(orchestrationRuns)
      .set({ createdAt: staleCreatedAt })
      .where(eq(orchestrationRuns.id, turn.run!.id));

    const retry = await appendConversationTurn(
      database.db,
      turn.conversation.id,
      {
        userId: ownerId,
        requestId: "10000000-0000-4000-8000-000000000041",
        content: "Try publishing it again",
        provider: "thesean",
        model: "contract-model",
        targetPlatforms: ["threads"],
        staleRunBefore: new Date(Date.now() - 60_000),
      },
    );

    const runs = await listConversationRuns(
      database.db,
      turn.conversation.id,
    );
    expect(runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: turn.run!.id,
          status: "failed",
          safeError: "RUN_INTERRUPTED",
        }),
        expect.objectContaining({ id: retry.run!.id, status: "running" }),
      ]),
    );
    const messages = await listAllConversationMessages(
      database.db,
      turn.conversation.id,
    );
    expect(messages.map((message) => message.content)).toEqual([
      "Publish this image on Threads",
      "The previous request was interrupted before it finished. You can retry safely.",
      "Try publishing it again",
    ]);
  });

  it("enforces the rolling run limit inside the create transaction (AC-8)", async () => {
    await createConversationTurn(database.db, {
      userId: ownerId,
      requestId: "10000000-0000-4000-8000-000000000006",
      content: "Post on Threads",
      title: "Post on Threads",
      provider: "thesean",
      model: "contract-model",
      targetPlatforms: ["threads"],
      dailyRunLimit: 1,
    });

    await expect(
      createConversationTurn(database.db, {
        userId: ownerId,
        requestId: "10000000-0000-4000-8000-000000000007",
        content: "Post again on Threads",
        title: "Post again on Threads",
        provider: "thesean",
        model: "contract-model",
        targetPlatforms: ["threads"],
        dailyRunLimit: 1,
      }),
    ).rejects.toMatchObject({ code: "DAILY_RUN_LIMIT" });
  });

  it("stores terminal tool and run state, then cascades deletion (AC-6, AC-7)", async () => {
    const turn = await createConversationTurn(database.db, {
      userId: ownerId,
      requestId: "10000000-0000-4000-8000-000000000008",
      content: "Validate on Threads",
      title: "Validate on Threads",
      provider: "thesean",
      model: "contract-model",
      targetPlatforms: ["threads"],
    });
    const tool = await createOrchestrationToolCall(database.db, {
      runId: turn.run!.id,
      providerCallId: "provider_1",
      toolName: "validate_post",
      arguments: { platforms: ["threads"] },
    });
    await finishOrchestrationToolCall(database.db, tool.id, {
      status: "succeeded",
      result: { ok: true, valid: true },
      attemptCount: 2,
      durationMs: 10,
    });
    await completeOrchestrationRun(database.db, turn.run!.id, "Ready", 20);

    expect(await listConversationRuns(database.db, turn.conversation.id)).toEqual([
      expect.objectContaining({ status: "completed" }),
    ]);
    expect(await listRunToolCalls(database.db, turn.run!.id)).toEqual([
      expect.objectContaining({
        status: "succeeded",
        attemptCount: 2,
        result: { ok: true, valid: true },
      }),
    ]);
    await expect(
      deleteOwnedConversation(database.db, ownerId, turn.conversation.id),
    ).resolves.toBe(true);
    expect(
      await database.db
        .select()
        .from(orchestrationMessages)
        .where(eq(orchestrationMessages.conversationId, turn.conversation.id)),
    ).toHaveLength(0);
    expect(
      await database.db
        .select()
        .from(orchestrationRuns)
        .where(eq(orchestrationRuns.conversationId, turn.conversation.id)),
    ).toHaveLength(0);
    expect(
      await database.db
        .select()
        .from(orchestrationToolCalls)
        .where(eq(orchestrationToolCalls.runId, turn.run!.id)),
    ).toHaveLength(0);
    expect(
      await database.db
        .select()
        .from(orchestrationConversations)
        .where(eq(orchestrationConversations.id, turn.conversation.id)),
    ).toHaveLength(0);
  });

  it("updates owned conversation titles without leaking other users", async () => {
    const turn = await createConversationTurn(database.db, {
      userId: ownerId,
      requestId: "10000000-0000-4000-8000-000000000010",
      content: "Hi",
      title: "New chat",
      assistantContent: "Hello",
    });

    const updated = await updateOwnedConversationTitle(
      database.db,
      ownerId,
      turn.conversation.id,
      "Launch post plan",
    );
    expect(updated?.title).toBe("Launch post plan");
    expect(
      (await getOwnedConversation(database.db, ownerId, turn.conversation.id))
        ?.title,
    ).toBe("Launch post plan");

    await expect(
      updateOwnedConversationTitle(
        database.db,
        otherId,
        turn.conversation.id,
        "Stolen title",
      ),
    ).resolves.toBeNull();
    expect(
      (await getOwnedConversation(database.db, ownerId, turn.conversation.id))
        ?.title,
    ).toBe("Launch post plan");
  });
});
