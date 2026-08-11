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
          canReschedule: true,
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
          canReschedule: true,
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
      canReschedule: true,
      canCancel: true,
      canEditContent: true,
    }),
    reschedule: vi.fn().mockImplementation(async (_userId, scheduleId, scheduledAt) => ({
      scheduleId,
      platform: "threads",
      accountId: "acct_1",
      accountLabel: "Brand",
      scheduledAt,
      statusBucket: "Scheduled",
      captionPreview: "Hello",
      thumbUrl: null,
      caption: "Hello",
      media: [],
      conversationId: null,
      draftId: null,
      canReschedule: true,
      canCancel: true,
      canEditContent: true,
    })),
    updateContent: vi.fn().mockImplementation(async (_userId, scheduleId, input) => ({
      scheduleId,
      platform: "threads",
      accountId: "acct_1",
      accountLabel: "Brand",
      scheduledAt: "2026-08-10T12:00:00.000Z",
      statusBucket: "Scheduled",
      captionPreview: input.caption ?? "Hello",
      thumbUrl: null,
      caption: input.caption ?? "Hello",
      media: input.media ?? [],
      conversationId: null,
      draftId: null,
      canReschedule: true,
      canCancel: true,
      canEditContent: true,
    })),
    mirrorToPlatforms: vi.fn().mockImplementation(async (_userId, _sourceId, input) => ({
      created: input.targets.map(
        (
          target: {
            platform: string;
            accountId: string;
            scheduledAt: string;
          },
          index: number,
        ) => ({
          scheduleId: `sched_mirrored_${index}`,
          platform: target.platform,
          accountId: target.accountId,
          accountLabel: "Brand LI",
          scheduledAt: target.scheduledAt,
          statusBucket: "Scheduled",
          captionPreview: input.caption ?? "Hello",
          thumbUrl: null,
          caption: input.caption ?? "Hello",
          media: input.media ?? [],
          conversationId: null,
          draftId: null,
          canReschedule: true,
          canCancel: true,
          canEditContent: true,
        }),
      ),
    })),
    patch: vi.fn().mockImplementation(async (_userId, scheduleId, input) => ({
      scheduleId,
      platform: "threads",
      accountId: "acct_1",
      accountLabel: "Brand",
      scheduledAt: input.scheduledAt ?? "2026-08-10T12:00:00.000Z",
      statusBucket: "Scheduled",
      captionPreview: input.caption ?? "Hello",
      thumbUrl: null,
      caption: input.caption ?? "Hello",
      media: input.media ?? [],
      conversationId: null,
      draftId: null,
      canReschedule: true,
      canCancel: true,
      canEditContent: true,
    })),
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
      accountIds: ["acct_1"],
      platform: undefined,
    });
  });

  it("lists slots with multiple accountIds", async () => {
    const response = await app.request(
      "/calendar/slots?from=2026-08-10T00:00:00.000Z&to=2026-08-11T00:00:00.000Z&timeZone=UTC&accountIds=acct_1,acct_2",
      { headers: { Cookie: cookie } },
    );
    expect(response.status).toBe(200);
    expect(calendar.listSlots).toHaveBeenCalledWith(userId, {
      from: "2026-08-10T00:00:00.000Z",
      to: "2026-08-11T00:00:00.000Z",
      timeZone: "UTC",
      accountIds: ["acct_1", "acct_2"],
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
      accountIds: undefined,
      platform: undefined,
      status: "Scheduled",
      sort: "scheduledAt:asc",
    });
  });

  it("patches caption and media through updateContent on /content", async () => {
    const response = await app.request("/calendar/slots/sched_1/content", {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        caption: "Updated",
        media: ["https://cdn.example/a.jpg"],
      }),
    });
    expect(response.status).toBe(200);
    expect(calendar.updateContent).toHaveBeenCalledWith(userId, "sched_1", {
      caption: "Updated",
      media: ["https://cdn.example/a.jpg"],
    });
    expect(calendar.reschedule).not.toHaveBeenCalled();
    expect(calendar.patch).not.toHaveBeenCalled();
  });

  it("rejects content fields on the time-only PATCH", async () => {
    const response = await app.request("/calendar/slots/sched_1", {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        caption: "Updated",
        media: ["https://cdn.example/a.jpg"],
      }),
    });
    expect(response.status).toBe(422);
    expect(calendar.reschedule).not.toHaveBeenCalled();
    expect(calendar.updateContent).not.toHaveBeenCalled();
  });

  it("maps content mutation errors", async () => {
    vi.mocked(calendar.updateContent).mockRejectedValueOnce(
      new CalendarError("MUTATION_UNSUPPORTED", 409),
    );
    const response = await app.request("/calendar/slots/sched_1/content", {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ caption: "Nope" }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "MUTATION_UNSUPPORTED" });
  });

  it("rejects empty and whitespace-only captions on /content", async () => {
    for (const caption of ["", "   "]) {
      const response = await app.request("/calendar/slots/sched_1/content", {
        method: "PATCH",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ caption }),
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "INVALID_CONTENT_UPDATE" });
    }
    expect(calendar.updateContent).not.toHaveBeenCalled();
  });

  it("trims captions before updateContent on /content", async () => {
    const response = await app.request("/calendar/slots/sched_1/content", {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ caption: "  Updated  " }),
    });
    expect(response.status).toBe(200);
    expect(calendar.updateContent).toHaveBeenCalledWith(userId, "sched_1", {
      caption: "Updated",
    });
  });

  it("mirrors a schedule onto another platform", async () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const response = await app.request("/calendar/slots/sched_1/mirror", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        targets: [
          {
            platform: "linkedin_personal",
            accountId: "acct_li",
            scheduledAt: future,
          },
        ],
        caption: "Hello",
        media: ["https://cdn.example/a.jpg"],
      }),
    });
    expect(response.status).toBe(200);
    expect(calendar.mirrorToPlatforms).toHaveBeenCalledWith(userId, "sched_1", {
      targets: [
        {
          platform: "linkedin_personal",
          accountId: "acct_li",
          scheduledAt: future,
        },
      ],
      caption: "Hello",
      media: ["https://cdn.example/a.jpg"],
    });
    expect(calendar.reschedule).not.toHaveBeenCalled();
  });

  it("rejects empty mirror targets", async () => {
    const response = await app.request("/calendar/slots/sched_1/mirror", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ targets: [] }),
    });
    expect(response.status).toBe(422);
    expect(calendar.mirrorToPlatforms).not.toHaveBeenCalled();
  });

  it("rejects empty and whitespace-only captions on /mirror", async () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    for (const caption of ["", "   "]) {
      const response = await app.request("/calendar/slots/sched_1/mirror", {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targets: [
            {
              platform: "linkedin_personal",
              accountId: "acct_li",
              scheduledAt: future,
            },
          ],
          caption,
        }),
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ error: "INVALID_CONTENT_UPDATE" });
    }
    expect(calendar.mirrorToPlatforms).not.toHaveBeenCalled();
  });

  it("rewrites a caption selection via Thesean helper", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Punchy hello" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const previousKey = process.env.THESEAN_API_KEY;
    process.env.THESEAN_API_KEY = "test-key";

    try {
      const response = await app.request(
        "/calendar/slots/sched_1/rewrite-selection",
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selection: "hello",
            action: "regenerate",
          }),
        },
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ suggestion: "Punchy hello" });
      expect(calendar.getSlot).toHaveBeenCalledWith(userId, "sched_1");
    } finally {
      vi.unstubAllGlobals();
      if (previousKey === undefined) delete process.env.THESEAN_API_KEY;
      else process.env.THESEAN_API_KEY = previousKey;
    }
  });
});
