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

  it("blocks a second active run and deletion while running (AC-8)", async () => {
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
    await expect(
      deleteOwnedConversation(database.db, ownerId, turn.conversation.id),
    ).rejects.toMatchObject({ code: "RUN_IN_PROGRESS" });
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

  it("does not reveal whether another owner conversation exists on delete (AC-1)", async () => {
    const turn = await createConversationTurn(database.db, {
      userId: ownerId,
      requestId: "10000000-0000-4000-8000-000000000009",
      content: "Preview on Threads",
      title: "Preview on Threads",
      assistantContent: "Ready",
    });

    await expect(
      deleteOwnedConversation(database.db, otherId, turn.conversation.id),
    ).resolves.toBe(false);
    expect(
      await getOwnedConversation(database.db, ownerId, turn.conversation.id),
    ).not.toBeNull();
  });
});
