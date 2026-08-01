import {
  and,
  count,
  desc,
  eq,
  gt,
  lt,
  max,
  or,
  sql,
} from "drizzle-orm";
import type { Database } from "./client.js";
import {
  createConversationId,
  createMessageId,
  createRunId,
  createToolCallId,
} from "./ids.js";
import {
  orchestrationConversations,
  orchestrationMessages,
  orchestrationRuns,
  orchestrationToolCalls,
  type OrchestrationConversation,
  type OrchestrationMessage,
  type OrchestrationRun,
  type OrchestrationToolCall,
} from "./schema.js";

export type TargetPlatform =
  | "threads"
  | "linkedin_personal"
  | "instagram";

export class OrchestrationDatabaseError extends Error {
  constructor(
    readonly code:
      | "CONVERSATION_NOT_FOUND"
      | "RUN_IN_PROGRESS"
      | "DAILY_RUN_LIMIT",
  ) {
    super(code);
    this.name = "OrchestrationDatabaseError";
  }
}

export type CreatedTurn = {
  conversation: OrchestrationConversation;
  userMessage: OrchestrationMessage;
  assistantMessage: OrchestrationMessage | null;
  run: OrchestrationRun | null;
};

export type CreateTurnInput = {
  userId: string;
  requestId: string;
  content: string;
  title?: string;
  assistantContent?: string;
  provider?: string;
  model?: string;
  targetPlatforms?: TargetPlatform[];
  dailyRunLimit?: number;
};

async function lockUserForUsage(
  tx: Parameters<Parameters<Database["db"]["transaction"]>[0]>[0],
  userId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`orchestration:${userId}`}))`,
  );
}

async function assertRunAllowed(
  tx: Parameters<Parameters<Database["db"]["transaction"]>[0]>[0],
  userId: string,
  dailyRunLimit: number,
): Promise<void> {
  await lockUserForUsage(tx, userId);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await tx
    .select({ value: count() })
    .from(orchestrationRuns)
    .innerJoin(
      orchestrationConversations,
      eq(orchestrationRuns.conversationId, orchestrationConversations.id),
    )
    .where(
      and(
        eq(orchestrationConversations.userId, userId),
        gt(orchestrationRuns.createdAt, since),
      ),
    );
  if ((row?.value ?? 0) >= dailyRunLimit) {
    throw new OrchestrationDatabaseError("DAILY_RUN_LIMIT");
  }
}

function runValues(
  conversationId: string,
  triggerMessageId: string,
  input: CreateTurnInput,
) {
  if (!input.provider || !input.model || !input.targetPlatforms) {
    return null;
  }
  return {
    id: createRunId(),
    conversationId,
    triggerMessageId,
    status: "running",
    provider: input.provider,
    model: input.model,
    targetPlatforms: input.targetPlatforms,
  } as const;
}

export async function createConversationTurn(
  db: Database["db"],
  input: CreateTurnInput & { title: string },
): Promise<CreatedTurn> {
  return db.transaction(async (tx) => {
    const run = runValues("", "", input);
    if (run) {
      await assertRunAllowed(tx, input.userId, input.dailyRunLimit ?? 50);
    }

    const conversationId = createConversationId();
    const userMessageId = createMessageId();
    const [conversation] = await tx
      .insert(orchestrationConversations)
      .values({
        id: conversationId,
        userId: input.userId,
        title: input.title,
      })
      .returning();
    const [userMessage] = await tx
      .insert(orchestrationMessages)
      .values({
        id: userMessageId,
        conversationId,
        role: "user",
        content: input.content,
        sequence: 1,
        requestId: input.requestId,
      })
      .returning();

    let assistantMessage: OrchestrationMessage | null = null;
    let createdRun: OrchestrationRun | null = null;
    if (input.assistantContent !== undefined) {
      [assistantMessage] = await tx
        .insert(orchestrationMessages)
        .values({
          id: createMessageId(),
          conversationId,
          role: "assistant",
          content: input.assistantContent,
          sequence: 2,
        })
        .returning();
    } else {
      const values = runValues(conversationId, userMessageId, input);
      if (!values) {
        throw new Error("Run values are required when no clarification is stored");
      }
      [createdRun] = await tx
        .insert(orchestrationRuns)
        .values(values)
        .returning();
    }

    if (!conversation || !userMessage) {
      throw new Error("Failed to create orchestration conversation turn");
    }
    return { conversation, userMessage, assistantMessage, run: createdRun };
  });
}

export async function appendConversationTurn(
  db: Database["db"],
  conversationId: string,
  input: CreateTurnInput,
): Promise<CreatedTurn> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from orchestration_conversations where id = ${conversationId} for update`,
    );
    const [conversation] = await tx
      .select()
      .from(orchestrationConversations)
      .where(
        and(
          eq(orchestrationConversations.id, conversationId),
          eq(orchestrationConversations.userId, input.userId),
        ),
      )
      .limit(1);
    if (!conversation) {
      throw new OrchestrationDatabaseError("CONVERSATION_NOT_FOUND");
    }

    const [active] = await tx
      .select({ id: orchestrationRuns.id })
      .from(orchestrationRuns)
      .where(
        and(
          eq(orchestrationRuns.conversationId, conversationId),
          eq(orchestrationRuns.status, "running"),
        ),
      )
      .limit(1);
    if (active) {
      throw new OrchestrationDatabaseError("RUN_IN_PROGRESS");
    }

    const values = runValues(conversationId, "", input);
    if (values) {
      await assertRunAllowed(tx, input.userId, input.dailyRunLimit ?? 50);
    }

    const [sequenceRow] = await tx
      .select({ value: max(orchestrationMessages.sequence) })
      .from(orchestrationMessages)
      .where(eq(orchestrationMessages.conversationId, conversationId));
    const sequence = (sequenceRow?.value ?? 0) + 1;
    const [userMessage] = await tx
      .insert(orchestrationMessages)
      .values({
        id: createMessageId(),
        conversationId,
        role: "user",
        content: input.content,
        sequence,
        requestId: input.requestId,
      })
      .returning();

    let assistantMessage: OrchestrationMessage | null = null;
    let createdRun: OrchestrationRun | null = null;
    if (input.assistantContent !== undefined) {
      [assistantMessage] = await tx
        .insert(orchestrationMessages)
        .values({
          id: createMessageId(),
          conversationId,
          role: "assistant",
          content: input.assistantContent,
          sequence: sequence + 1,
        })
        .returning();
    } else {
      const run = runValues(conversationId, userMessage!.id, input);
      if (!run) {
        throw new Error("Run values are required when no clarification is stored");
      }
      [createdRun] = await tx
        .insert(orchestrationRuns)
        .values(run)
        .returning();
    }

    await tx
      .update(orchestrationConversations)
      .set({ updatedAt: new Date() })
      .where(eq(orchestrationConversations.id, conversationId));
    if (!userMessage) {
      throw new Error("Failed to append orchestration message");
    }
    return { conversation, userMessage, assistantMessage, run: createdRun };
  });
}

export async function findOwnedTurnByRequestId(
  db: Database["db"],
  userId: string,
  requestId: string,
): Promise<CreatedTurn | null> {
  const [row] = await db
    .select({
      conversation: orchestrationConversations,
      userMessage: orchestrationMessages,
    })
    .from(orchestrationMessages)
    .innerJoin(
      orchestrationConversations,
      eq(orchestrationMessages.conversationId, orchestrationConversations.id),
    )
    .where(
      and(
        eq(orchestrationMessages.requestId, requestId),
        eq(orchestrationConversations.userId, userId),
      ),
    )
    .limit(1);
  if (!row) return null;

  const [run] = await db
    .select()
    .from(orchestrationRuns)
    .where(eq(orchestrationRuns.triggerMessageId, row.userMessage.id))
    .limit(1);
  const [assistantMessage] = await db
    .select()
    .from(orchestrationMessages)
    .where(
      and(
        eq(orchestrationMessages.conversationId, row.conversation.id),
        eq(orchestrationMessages.sequence, row.userMessage.sequence + 1),
        eq(orchestrationMessages.role, "assistant"),
      ),
    )
    .limit(1);

  return {
    conversation: row.conversation,
    userMessage: row.userMessage,
    assistantMessage: assistantMessage ?? null,
    run: run ?? null,
  };
}

export async function getOwnedConversation(
  db: Database["db"],
  userId: string,
  conversationId: string,
): Promise<OrchestrationConversation | null> {
  const [conversation] = await db
    .select()
    .from(orchestrationConversations)
    .where(
      and(
        eq(orchestrationConversations.id, conversationId),
        eq(orchestrationConversations.userId, userId),
      ),
    )
    .limit(1);
  return conversation ?? null;
}

export type ConversationCursor = { updatedAt: Date; id: string };

export async function listOwnedConversations(
  db: Database["db"],
  userId: string,
  limit: number,
  cursor?: ConversationCursor,
): Promise<OrchestrationConversation[]> {
  const cursorCondition = cursor
    ? or(
        lt(orchestrationConversations.updatedAt, cursor.updatedAt),
        and(
          eq(orchestrationConversations.updatedAt, cursor.updatedAt),
          lt(orchestrationConversations.id, cursor.id),
        ),
      )
    : undefined;
  return db
    .select()
    .from(orchestrationConversations)
    .where(
      cursorCondition
        ? and(eq(orchestrationConversations.userId, userId), cursorCondition)
        : eq(orchestrationConversations.userId, userId),
    )
    .orderBy(
      desc(orchestrationConversations.updatedAt),
      desc(orchestrationConversations.id),
    )
    .limit(limit);
}

export async function listConversationMessages(
  db: Database["db"],
  conversationId: string,
  limit: number,
  beforeSequence?: number,
): Promise<OrchestrationMessage[]> {
  const rows = await db
    .select()
    .from(orchestrationMessages)
    .where(
      beforeSequence === undefined
        ? eq(orchestrationMessages.conversationId, conversationId)
        : and(
            eq(orchestrationMessages.conversationId, conversationId),
            lt(orchestrationMessages.sequence, beforeSequence),
          ),
    )
    .orderBy(desc(orchestrationMessages.sequence))
    .limit(limit);
  return rows.reverse();
}

export async function listAllConversationMessages(
  db: Database["db"],
  conversationId: string,
): Promise<OrchestrationMessage[]> {
  return db
    .select()
    .from(orchestrationMessages)
    .where(eq(orchestrationMessages.conversationId, conversationId))
    .orderBy(orchestrationMessages.sequence);
}

export async function listConversationRuns(
  db: Database["db"],
  conversationId: string,
  limit = 25,
): Promise<OrchestrationRun[]> {
  return db
    .select()
    .from(orchestrationRuns)
    .where(eq(orchestrationRuns.conversationId, conversationId))
    .orderBy(desc(orchestrationRuns.createdAt))
    .limit(limit);
}

export async function listRunToolCalls(
  db: Database["db"],
  runId: string,
): Promise<OrchestrationToolCall[]> {
  return db
    .select()
    .from(orchestrationToolCalls)
    .where(eq(orchestrationToolCalls.runId, runId))
    .orderBy(orchestrationToolCalls.createdAt);
}

export async function updateRunUsage(
  db: Database["db"],
  runId: string,
  input: {
    modelSteps?: number;
    providerAttempts?: number;
    inputTokens?: number;
    outputTokens?: number;
  },
): Promise<void> {
  await db
    .update(orchestrationRuns)
    .set({
      modelStepCount:
        input.modelSteps === undefined
          ? undefined
          : sql`${orchestrationRuns.modelStepCount} + ${input.modelSteps}`,
      providerAttemptCount:
        input.providerAttempts === undefined
          ? undefined
          : sql`${orchestrationRuns.providerAttemptCount} + ${input.providerAttempts}`,
      inputTokens:
        input.inputTokens === undefined
          ? undefined
          : sql`coalesce(${orchestrationRuns.inputTokens}, 0) + ${input.inputTokens}`,
      outputTokens:
        input.outputTokens === undefined
          ? undefined
          : sql`coalesce(${orchestrationRuns.outputTokens}, 0) + ${input.outputTokens}`,
    })
    .where(eq(orchestrationRuns.id, runId));
}

async function finishRun(
  db: Database["db"],
  runId: string,
  status: "completed" | "failed",
  assistantContent: string,
  input: { durationMs: number; safeError?: string },
): Promise<OrchestrationMessage> {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(orchestrationRuns)
      .where(eq(orchestrationRuns.id, runId))
      .limit(1);
    if (!run || run.status !== "running") {
      throw new Error("RUN_NOT_ACTIVE");
    }
    await tx.execute(
      sql`select id from orchestration_conversations where id = ${run.conversationId} for update`,
    );
    const [sequenceRow] = await tx
      .select({ value: max(orchestrationMessages.sequence) })
      .from(orchestrationMessages)
      .where(eq(orchestrationMessages.conversationId, run.conversationId));
    const [assistant] = await tx
      .insert(orchestrationMessages)
      .values({
        id: createMessageId(),
        conversationId: run.conversationId,
        role: "assistant",
        content: assistantContent,
        sequence: (sequenceRow?.value ?? 0) + 1,
      })
      .returning();
    await tx
      .update(orchestrationRuns)
      .set({
        status,
        durationMs: input.durationMs,
        safeError: input.safeError ?? null,
        completedAt: new Date(),
      })
      .where(eq(orchestrationRuns.id, runId));
    await tx
      .update(orchestrationConversations)
      .set({ updatedAt: new Date() })
      .where(eq(orchestrationConversations.id, run.conversationId));
    if (!assistant) throw new Error("Failed to store assistant message");
    return assistant;
  });
}

export function completeOrchestrationRun(
  db: Database["db"],
  runId: string,
  assistantContent: string,
  durationMs: number,
): Promise<OrchestrationMessage> {
  return finishRun(db, runId, "completed", assistantContent, { durationMs });
}

export function failOrchestrationRun(
  db: Database["db"],
  runId: string,
  assistantContent: string,
  safeError: string,
  durationMs: number,
): Promise<OrchestrationMessage> {
  return finishRun(db, runId, "failed", assistantContent, {
    durationMs,
    safeError,
  });
}

export async function createOrchestrationToolCall(
  db: Database["db"],
  input: {
    runId: string;
    providerCallId: string;
    toolName: string;
    arguments: Record<string, unknown>;
  },
): Promise<OrchestrationToolCall> {
  const [row] = await db
    .insert(orchestrationToolCalls)
    .values({ id: createToolCallId(), ...input })
    .returning();
  if (!row) throw new Error("Failed to create tool call");
  return row;
}

export async function finishOrchestrationToolCall(
  db: Database["db"],
  id: string,
  input:
    | {
        status: "succeeded";
        result: Record<string, unknown>;
        attemptCount: number;
        durationMs: number;
      }
    | {
        status: "failed";
        safeError: string;
        attemptCount: number;
        durationMs: number;
      },
): Promise<void> {
  await db
    .update(orchestrationToolCalls)
    .set({
      status: input.status,
      result: input.status === "succeeded" ? input.result : null,
      safeError: input.status === "failed" ? input.safeError : null,
      attemptCount: input.attemptCount,
      durationMs: input.durationMs,
      completedAt: new Date(),
    })
    .where(eq(orchestrationToolCalls.id, id));
}

export async function deleteOwnedConversation(
  db: Database["db"],
  userId: string,
  conversationId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [active] = await tx
      .select({ id: orchestrationRuns.id })
      .from(orchestrationRuns)
      .innerJoin(
        orchestrationConversations,
        eq(orchestrationRuns.conversationId, orchestrationConversations.id),
      )
      .where(
        and(
          eq(orchestrationRuns.conversationId, conversationId),
          eq(orchestrationRuns.status, "running"),
          eq(orchestrationConversations.userId, userId),
        ),
      )
      .limit(1);
    if (active) throw new OrchestrationDatabaseError("RUN_IN_PROGRESS");
    const deleted = await tx
      .delete(orchestrationConversations)
      .where(
        and(
          eq(orchestrationConversations.id, conversationId),
          eq(orchestrationConversations.userId, userId),
        ),
      )
      .returning({ id: orchestrationConversations.id });
    return deleted.length > 0;
  });
}
