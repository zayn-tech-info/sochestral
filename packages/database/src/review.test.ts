import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb, type Database } from "./client.js";
import { createConversationTurn, deleteOwnedConversation } from "./orchestration.js";
import {
  createPublishAttempts,
  createReviewGroup,
  finishPublishAttempt,
  listConversationReviewData,
  ReviewDatabaseError,
  updateOwnedReviewDraft,
} from "./review.js";
import { requireTestDatabaseUrl } from "./env.js";
import { provisionUser } from "./users.js";

describe("review persistence", () => {
  let database: Database;
  let userId: string;
  let conversationId: string;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.db.execute(sql`delete from users`);
    userId = (await provisionUser(database.db, "review-db@example.com")).id;
    const turn = await createConversationTurn(database.db, {
      userId,
      requestId: crypto.randomUUID(),
      content: "Draft this on Threads",
      title: "Review",
      assistantContent: "Preparing review",
    });
    conversationId = turn.conversation.id;
  });

  async function oneDraft() {
    const [draft] = await createReviewGroup(database.db, {
      userId,
      conversationId,
      variants: [{ platform: "threads", body: "Launch", mediaUrls: [] }],
    });
    return draft!;
  }

  it("creates a linked review group and restores ordered media", async () => {
    const rows = await createReviewGroup(database.db, {
      userId,
      conversationId,
      variants: [
        {
          platform: "instagram",
          body: "Gallery",
          mediaUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
        },
      ],
    });
    expect(rows[0]).toMatchObject({
      userId,
      conversationId,
      platform: "instagram",
      revision: 1,
      mediaUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
    });
    expect(rows[0]?.reviewGroupId).toMatch(/^review_/);
  });

  it("increments only meaningful edits and rejects stale revisions", async () => {
    const draft = await oneDraft();
    const unchanged = await updateOwnedReviewDraft(database.db, {
      userId,
      draftId: draft.id,
      expectedRevision: 1,
      body: "Launch",
      mediaUrls: [],
      selectedAccountId: null,
      validationErrors: [],
      validationWarnings: [],
    });
    expect(unchanged.revision).toBe(1);
    expect(unchanged.updatedAt).toEqual(draft.updatedAt);

    const changed = await updateOwnedReviewDraft(database.db, {
      userId,
      draftId: draft.id,
      expectedRevision: 1,
      body: "Launch today",
      mediaUrls: [],
      selectedAccountId: "acct_threads",
      validationErrors: [],
      validationWarnings: ["Review timing"],
    });
    expect(changed.revision).toBe(2);
    expect(changed.validatedRevision).toBe(2);
    await expect(
      updateOwnedReviewDraft(database.db, {
        userId,
        draftId: draft.id,
        expectedRevision: 1,
        body: "Stale",
        mediaUrls: [],
        selectedAccountId: "acct_threads",
        validationErrors: [],
        validationWarnings: [],
      }),
    ).rejects.toMatchObject({ code: "STALE_REVISION" } satisfies Partial<ReviewDatabaseError>);
  });

  it("creates immutable attempts, replays request ids, and persists terminal state", async () => {
    const draft = await oneDraft();
    const input = {
      userId,
      approvalRequestId: crypto.randomUUID(),
      hourlyLimit: 20,
      snapshots: [
        {
          draftId: draft.id,
          platform: "threads" as const,
          body: "Launch",
          mediaUrls: [],
          selectedAccountId: "acct_threads",
          revision: 1,
          idempotencyKey: "pub_db_attempt_000000000001",
        },
      ],
    };
    const created = await createPublishAttempts(database.db, input);
    expect(created.replayed).toBe(false);
    expect(created.attempts[0]).toMatchObject({ status: "publishing", body: "Launch" });
    const replay = await createPublishAttempts(database.db, input);
    expect(replay.replayed).toBe(true);
    expect(replay.attempts[0]?.id).toBe(created.attempts[0]?.id);

    await finishPublishAttempt(database.db, {
      attemptId: created.attempts[0]!.id,
      status: "succeeded",
      mcpPostId: "threads_post_1",
    });
    const restored = await listConversationReviewData(database.db, userId, conversationId);
    expect(restored.drafts[0]?.status).toBe("published");
    expect(restored.attempts[0]?.mcpPostId).toBe("threads_post_1");
  });

  it("blocks deletion while publishing then cascades review data", async () => {
    const draft = await oneDraft();
    const created = await createPublishAttempts(database.db, {
      userId,
      approvalRequestId: crypto.randomUUID(),
      hourlyLimit: 20,
      snapshots: [
        {
          draftId: draft.id,
          platform: "threads",
          body: draft.body,
          mediaUrls: [],
          selectedAccountId: "acct_threads",
          revision: draft.revision,
          idempotencyKey: "pub_db_delete_000000000001",
        },
      ],
    });
    await expect(
      deleteOwnedConversation(database.db, userId, conversationId),
    ).rejects.toMatchObject({ code: "RUN_IN_PROGRESS" });
    await finishPublishAttempt(database.db, {
      attemptId: created.attempts[0]!.id,
      status: "failed",
      safeErrorCode: "TEST_FAILURE",
    });
    expect(await deleteOwnedConversation(database.db, userId, conversationId)).toBe(true);
    expect(await listConversationReviewData(database.db, userId, conversationId)).toEqual({
      drafts: [],
      attempts: [],
      media: [],
    });
  });
});
