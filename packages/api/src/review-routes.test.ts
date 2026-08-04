import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, SESSION_COOKIE_NAME } from "@sochestral/auth";
import {
  createDb,
  provisionUser,
  requireTestDatabaseUrl,
  type Database,
} from "@sochestral/database";
import { ReviewError, type ReviewService } from "@sochestral/orchestration";
import { createApp } from "./app.js";

function reviewMock(): ReviewService {
  return {
    updateDraft: vi.fn().mockResolvedValue({
      draft: { id: "draft_1", revision: 2 },
      eligibleAccounts: [],
    }),
    publishGroup: vi.fn().mockResolvedValue({
      groupId: "review_1",
      replayed: false,
      results: [],
    }),
    checkAttempt: vi.fn().mockResolvedValue({
      id: "attempt_1",
      state: "succeeded",
    }),
  } as unknown as ReviewService;
}

describe("review API routes", () => {
  let database: Database;
  let userId: string;
  let cookie: string;
  let review: ReviewService;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    process.env.CORS_ORIGIN = "http://localhost:3000";
    await database.client`delete from users`;
    const user = await provisionUser(database.db, "review-route@example.com");
    userId = user.id;
    const session = await createSession(database.db, user.id);
    cookie = `${SESSION_COOKIE_NAME}=${session.rawToken}`;
    review = reviewMock();
    app = createApp(database.db, undefined, undefined, review);
  });

  function headers(extra: Record<string, string> = {}) {
    return {
      Cookie: cookie,
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      "X-Sochestral-Request": "review-action",
      ...extra,
    };
  }

  it.each([
    ["PATCH", "/review/drafts/draft_1"],
    ["POST", "/review/groups/review_1/publish"],
    ["POST", "/review/attempts/attempt_1/check"],
  ])("requires a session for %s %s", async (method, path) => {
    const response = await app.request(path, {
      method,
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        "X-Sochestral-Request": "review-action",
      },
      body: "{}",
    });
    expect(response.status).toBe(401);
  });

  it.each([
    [{ Origin: "https://evil.example" }, "foreign origin"],
    [{ "X-Sochestral-Request": "wrong" }, "missing custom trust header"],
    [{ "Content-Type": "text/plain" }, "non JSON body"],
  ])("rejects a %s", async (changed, _label) => {
    const response = await app.request("/review/drafts/draft_1", {
      method: "PATCH",
      headers: headers(changed),
      body: "{}",
    });
    expect(response.status).toBe(403);
    expect(review.updateDraft).not.toHaveBeenCalled();
  });

  it("passes only the session owner into draft edits", async () => {
    const response = await app.request("/review/drafts/draft_1", {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({
        expectedRevision: 3,
        body: "Edited",
        mediaUrls: ["https://example.com/a.jpg"],
        selectedAccountId: "acct_1",
        userId: "user_attacker",
      }),
    });
    expect(response.status).toBe(200);
    expect(review.updateDraft).toHaveBeenCalledWith(userId, "draft_1", {
      expectedRevision: 3,
      body: "Edited",
      mediaUrls: ["https://example.com/a.jpg"],
      selectedAccountId: "acct_1",
    });
    expect(JSON.stringify(vi.mocked(review.updateDraft).mock.calls)).not.toContain("user_attacker");
  });

  it("rejects malformed media arrays instead of silently dropping values", async () => {
    const response = await app.request("/review/drafts/draft_1", {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({
        expectedRevision: 1,
        body: "Edited",
        mediaUrls: ["https://example.com/a.jpg", 42],
        selectedAccountId: null,
      }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "INVALID_REVIEW_INPUT" });
    expect(review.updateDraft).not.toHaveBeenCalled();
  });

  it("maps stale revisions and masked ownership errors", async () => {
    vi.mocked(review.publishGroup).mockRejectedValueOnce(
      new ReviewError("STALE_REVISION", 409),
    );
    const stale = await app.request("/review/groups/review_1/publish", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ requestId: crypto.randomUUID(), drafts: [] }),
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "STALE_REVISION" });

    vi.mocked(review.checkAttempt).mockRejectedValueOnce(
      new ReviewError("REVIEW_NOT_FOUND", 404),
    );
    const hidden = await app.request("/review/attempts/attempt_other/check", {
      method: "POST",
      headers: headers(),
      body: "{}",
    });
    expect(hidden.status).toBe(404);
    expect(await hidden.json()).toEqual({ error: "REVIEW_NOT_FOUND" });
  });
});
