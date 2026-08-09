import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDb,
  provisionUser,
  requireTestDatabaseUrl,
  type Database,
} from "@sochestral/database";
import { createSession, SESSION_COOKIE_NAME } from "@sochestral/auth";
import {
  CalendarError,
  type CalendarService,
} from "@sochestral/orchestration";
import { createApp } from "./app.js";

function calendarMock(): CalendarService {
  return {
    listAccounts: vi.fn().mockResolvedValue({
      accounts: [
        {
          id: "acct_1",
          platform: "threads",
          label: "Brand",
          username: "brand",
          avatarHint: null,
        },
      ],
    }),
    listSlots: vi.fn().mockResolvedValue({
      timeZone: "UTC",
      slots: [
        {
          scheduleId: "sched_1",
          platform: "threads",
          accountId: "acct_1",
          accountLabel: "Brand",
          scheduledAt: "2026-08-10T12:00:00.000Z",
          statusBucket: "Scheduled",
          captionPreview: "Hello",
          thumbUrl: null,
        },
      ],
    }),
    listPosts: vi.fn().mockResolvedValue({
      posts: [
        {
          scheduleId: "sched_1",
          platform: "threads",
          accountId: "acct_1",
          accountLabel: "Brand",
          scheduledAt: "2026-08-10T12:00:00.000Z",
          statusBucket: "Scheduled",
          captionPreview: "Hello",
          thumbUrl: null,
        },
      ],
      timeZone: "UTC",
      from: "2026-08-09T00:00:00.000Z",
      to: "2026-09-08T00:00:00.000Z",
      sort: "scheduledAt:asc",
      hasOlder: false,
      hasNewer: false,
    }),
    getSlot: vi.fn().mockResolvedValue({
      scheduleId: "sched_1",
      platform: "threads",
      accountId: "acct_1",
      accountLabel: "Brand",
      scheduledAt: "2026-08-10T12:00:00.000Z",
      statusBucket: "Scheduled",
      captionPreview: "Hello",
      thumbUrl: null,
      caption: "Hello",
      media: [],
      conversationId: null,
      draftId: null,
      canReschedule: false,
      canCancel: true,
    }),
    reschedule: vi
      .fn()
      .mockRejectedValue(new CalendarError("MUTATION_UNSUPPORTED", 409)),
    cancel: vi.fn().mockResolvedValue({ ok: true, scheduleId: "sched_1" }),
  };
}

describe("calendar API routes", () => {
  let database: Database;
  let userId: string;
  let cookie: string;
  let calendar: CalendarService;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.client`delete from users`;
    const user = await provisionUser(database.db, "calendar@example.com");
    userId = user.id;
    const session = await createSession(database.db, user.id);
    cookie = `${SESSION_COOKIE_NAME}=${session.rawToken}`;
    calendar = calendarMock();
    app = createApp(database.db, undefined, undefined, undefined, calendar);
  });

  it("requires a product session", async () => {
    const response = await app.request("/calendar/accounts");
    expect(response.status).toBe(401);
  });

  it("lists accounts for the session user", async () => {
    const response = await app.request("/calendar/accounts", {
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(200);
    expect(calendar.listAccounts).toHaveBeenCalledWith(userId);
    expect(JSON.stringify(await response.json())).not.toContain("token");
  });

  it("lists slots with query params", async () => {
    const response = await app.request(
      "/calendar/slots?from=2026-08-10T00:00:00.000Z&to=2026-08-11T00:00:00.000Z&timeZone=UTC&accountId=acct_1",
      { headers: { Cookie: cookie } },
    );
    expect(response.status).toBe(200);
    expect(calendar.listSlots).toHaveBeenCalledWith(userId, {
      from: "2026-08-10T00:00:00.000Z",
      to: "2026-08-11T00:00:00.000Z",
      timeZone: "UTC",
      accountId: "acct_1",
      platform: undefined,
    });
  });

  it("maps calendar errors", async () => {
    vi.mocked(calendar.listSlots).mockRejectedValueOnce(
      new CalendarError("INVALID_RANGE", 422),
    );
    const response = await app.request(
      "/calendar/slots?from=a&to=b&timeZone=UTC",
      { headers: { Cookie: cookie } },
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "INVALID_RANGE" });
  });

  it("cancels a slot", async () => {
    const response = await app.request("/calendar/slots/sched_1", {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(200);
    expect(calendar.cancel).toHaveBeenCalledWith(userId, "sched_1");
  });

  it("lists scheduled posts", async () => {
    const response = await app.request(
      "/scheduled/posts?from=2026-08-09T00:00:00.000Z&to=2026-09-08T00:00:00.000Z&timeZone=UTC&status=Scheduled&sort=scheduledAt:asc",
      { headers: { Cookie: cookie } },
    );
    expect(response.status).toBe(200);
    expect(calendar.listPosts).toHaveBeenCalledWith(userId, {
      from: "2026-08-09T00:00:00.000Z",
      to: "2026-09-08T00:00:00.000Z",
      timeZone: "UTC",
      accountId: undefined,
      platform: undefined,
      status: "Scheduled",
      sort: "scheduledAt:asc",
    });
  });
});
