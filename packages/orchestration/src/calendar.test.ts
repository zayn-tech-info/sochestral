import { describe, expect, it, vi } from "vitest";

import {
  DefaultCalendarService,
  mapStatusBucket,
  isSafeMediaUrl,
  isUnsupportedMcpToolText,
  CalendarError,
  type CalendarGateway,
} from "./calendar.js";
import type { ConnectorService } from "./connectors.js";

function connectorsMock(extraAccounts?: {
  threads?: Array<{
    id: string;
    username: string;
    displayName: string;
  }>;
}): ConnectorService {
  const threadsAccounts = [
    {
      id: "acct_1",
      username: "brand",
      displayName: "Brand Co",
      avatarUrl: null,
      state: "connected" as const,
    },
    ...(extraAccounts?.threads ?? []).map((account) => ({
      ...account,
      avatarUrl: null,
      state: "connected" as const,
    })),
  ];
  return {
    list: vi.fn().mockResolvedValue({
      connectors: [
        {
          platform: "threads",
          state: "connected",
          accounts: threadsAccounts,
        },
        {
          platform: "linkedin_personal",
          state: "connected",
          accounts: [
            {
              id: "acct_li",
              username: "brandli",
              displayName: "Brand LI",
              avatarUrl: null,
              state: "connected",
            },
          ],
        },
        { platform: "instagram", state: "not_connected", accounts: [] },
      ],
    }),
    startConnect: vi.fn(),
  };
}

function gatewayMock(scheduled: unknown[]): CalendarGateway {
  const rows = scheduled as Array<Record<string, unknown>>;
  return {
    callTool: vi.fn().mockImplementation(async (input) => {
      if (input.name === "get_scheduled_posts") {
        return { ok: true, scheduled: rows };
      }
      if (input.name === "cancel_scheduled_post") {
        return { ok: true };
      }
      if (input.name === "reschedule_scheduled_post") {
        const id = input.arguments.scheduledPostId;
        const publishAt = input.arguments.publishAt;
        const row = rows.find((entry) => entry.id === id);
        if (row && typeof publishAt === "string") {
          row.publishAt = publishAt;
        }
        return { ok: true, scheduled: row ?? null };
      }
      if (input.name === "update_scheduled_post_content") {
        const id = input.arguments.scheduledPostId;
        const row = rows.find((entry) => entry.id === id);
        if (row) {
          if (typeof input.arguments.text === "string") {
            row.contentText = input.arguments.text;
            row.captionPreview = input.arguments.text;
          }
          if (Array.isArray(input.arguments.mediaUrls)) {
            row.mediaUrls = input.arguments.mediaUrls;
          }
        }
        return { ok: true, scheduled: row ?? null };
      }
      if (input.name === "schedule_post") {
        const platform = (input.arguments.platforms as string[])[0]!;
        const id = `sched_${platform}_${rows.length + 1}`;
        const created = {
          id,
          platform,
          connectedAccountId: input.arguments.connectedAccountId,
          publishAt: input.arguments.scheduledAt,
          status: "scheduled",
          contentText: input.arguments.text,
          captionPreview: input.arguments.text,
          mediaUrls:
            (input.arguments.options as { mediaUrls?: string[] } | undefined)
              ?.mediaUrls ?? [],
        };
        rows.push(created);
        return { ok: true, scheduled: [created] };
      }
      throw new Error(`unexpected ${input.name}`);
    }),
  };
}

describe("calendar helpers", () => {
  it("maps MCP statuses to product buckets", () => {
    expect(mapStatusBucket("scheduled")).toBe("Scheduled");
    expect(mapStatusBucket("published")).toBe("Done");
    expect(mapStatusBucket("failed")).toBe("Failed");
    expect(mapStatusBucket("cancelled")).toBe("Canceled");
    expect(mapStatusBucket("weird")).toBe("Scheduled");
  });

  it("allows only https media urls", () => {
    expect(isSafeMediaUrl("https://cdn.example/a.jpg")).toBe(true);
    expect(isSafeMediaUrl("http://cdn.example/a.jpg")).toBe(false);
    expect(isSafeMediaUrl("javascript:alert(1)")).toBe(false);
    expect(
      isSafeMediaUrl(
        "http://localhost:8787/media/assets/media_abc/view?u=user_1&sig=abc",
      ),
    ).toBe(true);
    expect(
      isSafeMediaUrl("http://localhost:8787/media/uploads/media_abc"),
    ).toBe(false);
  });

  it("detects unsupported MCP tool text without false positives", () => {
    expect(isUnsupportedMcpToolText("Unknown tool: update_scheduled_post_content")).toBe(
      true,
    );
    expect(
      isUnsupportedMcpToolText(
        "update_scheduled_post_content is not supported on this server",
      ),
    ).toBe(true);
    expect(
      isUnsupportedMcpToolText(
        "Could not parse schedule payload mentioning update_scheduled_post_content in docs",
      ),
    ).toBe(false);
    expect(isUnsupportedMcpToolText("tool not found")).toBe(true);
  });
});

describe("DefaultCalendarService", () => {
  const row = {
    id: "sched_1",
    platform: "threads",
    connectedAccountId: "acct_1",
    publishAt: "2026-08-10T12:00:00.000Z",
    status: "scheduled",
    contentText: "Hello week",
    mediaUrls: ["https://cdn.example/a.jpg", "http://bad.example/x.jpg"],
  };

  it("lists accounts from connectors", async () => {
    const service = new DefaultCalendarService(gatewayMock([]), connectorsMock());
    const result = await service.listAccounts("user_1");
    expect(result.accounts).toEqual([
      {
        id: "acct_1",
        platform: "threads",
        label: "Brand Co",
        username: "brand",
        avatarHint: null,
      },
      {
        id: "acct_li",
        platform: "linkedin_personal",
        label: "Brand LI",
        username: "brandli",
        avatarHint: null,
      },
    ]);
  });

  it("forwards safe connector avatar urls as avatarHint", async () => {
    const connectors: ConnectorService = {
      list: vi.fn().mockResolvedValue({
        connectors: [
          {
            platform: "threads",
            state: "connected",
            accounts: [
              {
                id: "acct_1",
                username: "brand",
                displayName: "Brand Co",
                avatarUrl: "https://cdn.example/a.jpg",
                state: "connected",
              },
            ],
          },
          {
            platform: "linkedin_personal",
            state: "not_connected",
            accounts: [],
          },
          { platform: "instagram", state: "not_connected", accounts: [] },
        ],
      }),
      startConnect: vi.fn(),
    };
    const service = new DefaultCalendarService(gatewayMock([]), connectors);
    const result = await service.listAccounts("user_1");
    expect(result.accounts[0]?.avatarHint).toBe("https://cdn.example/a.jpg");
  });

  it("drops non-https connector avatar urls from avatarHint", async () => {
    const connectors: ConnectorService = {
      list: vi.fn().mockResolvedValue({
        connectors: [
          {
            platform: "threads",
            state: "connected",
            accounts: [
              {
                id: "acct_1",
                username: "brand",
                displayName: "Brand Co",
                avatarUrl: "http://cdn.example/a.jpg",
                state: "connected",
              },
            ],
          },
          {
            platform: "linkedin_personal",
            state: "not_connected",
            accounts: [],
          },
          { platform: "instagram", state: "not_connected", accounts: [] },
        ],
      }),
      startConnect: vi.fn(),
    };
    const service = new DefaultCalendarService(gatewayMock([]), connectors);
    const result = await service.listAccounts("user_1");
    expect(result.accounts[0]?.avatarHint).toBeNull();
  });

  it("filters slots by range and account", async () => {
    const service = new DefaultCalendarService(
      gatewayMock([
        row,
        {
          ...row,
          id: "sched_2",
          publishAt: "2026-08-20T12:00:00.000Z",
        },
      ]),
      connectorsMock(),
    );

    const result = await service.listSlots("user_1", {
      from: "2026-08-10T00:00:00.000Z",
      to: "2026-08-11T00:00:00.000Z",
      timeZone: "Africa/Lagos",
      accountIds: ["acct_1"],
    });

    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]?.scheduleId).toBe("sched_1");
    expect(result.slots[0]?.thumbUrl).toBe("https://cdn.example/a.jpg");
    expect(result.slots[0]?.captionPreview).toBe("Hello week");
    expect(result.slots[0]?.canReschedule).toBe(true);
  });

  it("filters slots by multiple account ids", async () => {
    const service = new DefaultCalendarService(
      gatewayMock([
        row,
        {
          ...row,
          id: "sched_li",
          platform: "linkedin_personal",
          connectedAccountId: "acct_li",
        },
        {
          ...row,
          id: "sched_other",
          connectedAccountId: "acct_other",
        },
      ]),
      connectorsMock(),
    );

    const result = await service.listSlots("user_1", {
      from: "2026-08-10T00:00:00.000Z",
      to: "2026-08-11T00:00:00.000Z",
      timeZone: "UTC",
      accountIds: ["acct_1", "acct_li"],
    });

    expect(result.slots.map((slot) => slot.scheduleId).sort()).toEqual([
      "sched_1",
      "sched_li",
    ]);
  });

  it("rejects ranges longer than 8 days", async () => {
    const service = new DefaultCalendarService(gatewayMock([]), connectorsMock());
    await expect(
      service.listSlots("user_1", {
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-08-12T00:00:00.000Z",
        timeZone: "UTC",
      }),
    ).rejects.toMatchObject({ code: "INVALID_RANGE", status: 422 });
  });

  it("reschedules pending schedules and cancels them", async () => {
    const gateway = gatewayMock([row]);
    const service = new DefaultCalendarService(gateway, connectorsMock());
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const moved = await service.reschedule("user_1", "sched_1", future);
    expect(moved.scheduledAt).toBe(future);
    expect(moved.canReschedule).toBe(true);
    expect(gateway.callTool).toHaveBeenCalledWith({
      userId: "user_1",
      name: "reschedule_scheduled_post",
      arguments: {
        scheduledPostId: "sched_1",
        publishAt: future,
        confirm: true,
      },
    });

    const canceled = await service.cancel("user_1", "sched_1");
    expect(canceled).toEqual({ ok: true, scheduleId: "sched_1" });
    expect(gateway.callTool).toHaveBeenCalledWith({
      userId: "user_1",
      name: "cancel_scheduled_post",
      arguments: { scheduledPostId: "sched_1", confirm: true },
    });
  });

  it("blocks reschedule for published schedules", async () => {
    const service = new DefaultCalendarService(
      gatewayMock([{ ...row, status: "published" }]),
      connectorsMock(),
    );
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    await expect(
      service.reschedule("user_1", "sched_1", future),
    ).rejects.toMatchObject({ code: "PUBLISHED_IMMUTABLE" });
  });

  it("allows reschedule for canceled schedules", async () => {
    const gateway = gatewayMock([{ ...row, status: "cancelled" }]);
    const service = new DefaultCalendarService(gateway, connectorsMock());
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const detail = await service.getSlot("user_1", "sched_1");
    expect(detail.statusBucket).toBe("Canceled");
    expect(detail.canReschedule).toBe(true);
    expect(detail.canEditContent).toBe(true);
    expect(detail.canCancel).toBe(false);

    const moved = await service.reschedule("user_1", "sched_1", future);
    expect(moved.scheduledAt).toBe(future);
    expect(gateway.callTool).toHaveBeenCalledWith({
      userId: "user_1",
      name: "reschedule_scheduled_post",
      arguments: {
        scheduledPostId: "sched_1",
        publishAt: future,
        confirm: true,
      },
    });
  });

  it("rejects past reschedule times and MCP ok:false payloads", async () => {
    const pastGateway = gatewayMock([row]);
    const pastService = new DefaultCalendarService(pastGateway, connectorsMock());
    await expect(
      pastService.reschedule("user_1", "sched_1", "2020-01-01T12:00:00.000Z"),
    ).rejects.toMatchObject({ code: "SCHEDULE_TIME_MUST_BE_FUTURE", status: 422 });

    const failingGateway: CalendarGateway = {
      callTool: vi.fn().mockImplementation(async (input) => {
        if (input.name === "get_scheduled_posts") {
          return { ok: true, scheduled: [row] };
        }
        return { ok: false, code: "SCHEDULE_TIME_MUST_BE_FUTURE" };
      }),
    };
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const failingService = new DefaultCalendarService(
      failingGateway,
      connectorsMock(),
    );
    await expect(
      failingService.reschedule("user_1", "sched_1", future),
    ).rejects.toMatchObject({ code: "SCHEDULE_TIME_MUST_BE_FUTURE", status: 422 });
  });

  it("blocks cancel for published schedules", async () => {
    const service = new DefaultCalendarService(
      gatewayMock([{ ...row, status: "published" }]),
      connectorsMock(),
    );
    await expect(service.cancel("user_1", "sched_1")).rejects.toMatchObject({
      code: "PUBLISHED_IMMUTABLE",
    });
  });

  it("lists posts with 30 day window, status filter, and hasOlder", async () => {
    const service = new DefaultCalendarService(
      gatewayMock([
        row,
        {
          ...row,
          id: "sched_old",
          publishAt: "2026-07-01T12:00:00.000Z",
          status: "published",
        },
        {
          ...row,
          id: "sched_canceled",
          publishAt: "2026-08-05T12:00:00.000Z",
          status: "cancelled",
        },
      ]),
      connectorsMock(),
    );

    const result = await service.listPosts("user_1", {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T00:00:00.000Z",
      timeZone: "UTC",
      status: "Canceled",
      sort: "scheduledAt:asc",
    });

    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]?.scheduleId).toBe("sched_canceled");
    expect(result.hasOlder).toBe(false);
    expect(result.sort).toBe("scheduledAt:asc");
  });

  it("rejects list ranges over 30 days and bad sort or status", async () => {
    const service = new DefaultCalendarService(gatewayMock([]), connectorsMock());
    await expect(
      service.listPosts("user_1", {
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-09-05T00:00:00.000Z",
        timeZone: "UTC",
      }),
    ).rejects.toMatchObject({ code: "INVALID_RANGE" });

    await expect(
      service.listPosts("user_1", {
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-08-10T00:00:00.000Z",
        timeZone: "UTC",
        sort: "platform:asc",
      }),
    ).rejects.toMatchObject({ code: "INVALID_SORT" });

    await expect(
      service.listPosts("user_1", {
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-08-10T00:00:00.000Z",
        timeZone: "UTC",
        status: "pending",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATUS" });
  });

  it("updates caption and media for scheduled posts", async () => {
    const gateway = gatewayMock([row]);
    const service = new DefaultCalendarService(gateway, connectorsMock());
    const updated = await service.updateContent("user_1", "sched_1", {
      caption: "Fresh caption",
      media: ["https://cdn.example/next.jpg"],
    });
    expect(updated.caption).toBe("Fresh caption");
    expect(updated.media).toEqual(["https://cdn.example/next.jpg"]);
    expect(updated.canEditContent).toBe(true);
    expect(gateway.callTool).toHaveBeenCalledWith({
      userId: "user_1",
      name: "update_scheduled_post_content",
      arguments: {
        scheduledPostId: "sched_1",
        text: "Fresh caption",
        mediaUrls: ["https://cdn.example/next.jpg"],
        confirm: true,
      },
    });
  });

  it("resolves product media view URLs to https publish URLs on content update", async () => {
    const gateway = gatewayMock([row]);
    const media = {
      publishUrl: vi.fn(async () => "https://r2.example/signed/media_abc.jpg"),
    };
    const service = new DefaultCalendarService(gateway, connectorsMock(), media);
    await service.updateContent("user_1", "sched_1", {
      media: [
        "http://localhost:8787/media/assets/media_abc/view?u=user_1&sig=abc",
      ],
    });
    expect(media.publishUrl).toHaveBeenCalledWith("user_1", "media_abc");
    expect(gateway.callTool).toHaveBeenCalledWith({
      userId: "user_1",
      name: "update_scheduled_post_content",
      arguments: {
        scheduledPostId: "sched_1",
        mediaUrls: ["https://r2.example/signed/media_abc.jpg"],
        confirm: true,
      },
    });
  });

  it("uses durable https product media view URLs for scheduled creates", async () => {
    const gateway = gatewayMock([]);
    const media = {
      publishUrl: vi.fn(async () => "https://r2.example/signed/media_abc.jpg"),
      viewUrl: vi.fn(
        async () =>
          "https://api.example/media/assets/media_abc/view?u=user_1&exp=2000000000&sig=abc",
      ),
    };
    const service = new DefaultCalendarService(gateway, connectorsMock(), media);
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    await service.createSchedule("user_1", {
      platform: "threads",
      accountId: "acct_1",
      scheduledAt: future,
      caption: "Launch note",
      media: [
        "https://api.example/media/assets/media_abc/view?u=user_1&exp=2000000000&sig=abc",
      ],
    });

    expect(media.viewUrl).toHaveBeenCalledWith("user_1", "media_abc");
    expect(media.publishUrl).not.toHaveBeenCalled();
    expect(gateway.callTool).toHaveBeenCalledWith({
      userId: "user_1",
      name: "schedule_post",
      arguments: expect.objectContaining({
        options: {
          mediaUrls: [
            "https://api.example/media/assets/media_abc/view?u=user_1&exp=2000000000&sig=abc",
          ],
        },
      }),
    });
  });

  it("falls back to a publish URL for local product media view URLs", async () => {
    const gateway = gatewayMock([]);
    const media = {
      publishUrl: vi.fn(async () => "https://r2.example/signed/media_abc.jpg"),
      viewUrl: vi.fn(
        async () =>
          "http://localhost:8787/media/assets/media_abc/view?u=user_1&exp=2000000000&sig=abc",
      ),
    };
    const service = new DefaultCalendarService(gateway, connectorsMock(), media);
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    await service.createSchedule("user_1", {
      platform: "threads",
      accountId: "acct_1",
      scheduledAt: future,
      caption: "Local launch note",
      media: [
        "http://localhost:8787/media/assets/media_abc/view?u=user_1&exp=2000000000&sig=abc",
      ],
    });

    expect(media.viewUrl).toHaveBeenCalledWith("user_1", "media_abc");
    expect(media.publishUrl).toHaveBeenCalledWith("user_1", "media_abc");
    expect(gateway.callTool).toHaveBeenCalledWith({
      userId: "user_1",
      name: "schedule_post",
      arguments: expect.objectContaining({
        options: { mediaUrls: ["https://r2.example/signed/media_abc.jpg"] },
      }),
    });
  });

  it("rejects product media view URLs on content update when media cannot be resolved", async () => {
    const gateway = gatewayMock([row]);
    const service = new DefaultCalendarService(gateway, connectorsMock());
    await expect(
      service.updateContent("user_1", "sched_1", {
        media: [
          "http://localhost:8787/media/assets/media_abc/view?u=user_1&sig=abc",
        ],
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CONTENT_UPDATE",
      details: expect.objectContaining({
        message: "mediaUrls must be https URLs",
      }),
    });
    expect(gateway.callTool).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "update_scheduled_post_content" }),
    );
  });

  it("rejects content updates for non-scheduled and empty patches", async () => {
    const service = new DefaultCalendarService(
      gatewayMock([{ ...row, status: "published" }]),
      connectorsMock(),
    );
    await expect(
      service.updateContent("user_1", "sched_1", { caption: "Nope" }),
    ).rejects.toMatchObject({ code: "PUBLISHED_IMMUTABLE" });

    const pending = new DefaultCalendarService(gatewayMock([row]), connectorsMock());
    await expect(pending.updateContent("user_1", "sched_1", {})).rejects.toMatchObject({
      code: "INVALID_CONTENT_UPDATE",
      status: 422,
    });
    await expect(
      pending.updateContent("user_1", "sched_1", { caption: "" }),
    ).rejects.toMatchObject({
      code: "INVALID_CONTENT_UPDATE",
      status: 422,
    });
    await expect(
      pending.updateContent("user_1", "sched_1", { caption: "   " }),
    ).rejects.toMatchObject({
      code: "INVALID_CONTENT_UPDATE",
      status: 422,
    });
    await expect(
      pending.updateContent("user_1", "sched_1", {
        media: ["http://insecure.example/a.jpg"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONTENT_UPDATE" });
  });

  it("patches content and time together", async () => {
    const gateway = gatewayMock([row]);
    const service = new DefaultCalendarService(gateway, connectorsMock());
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const updated = await service.patch("user_1", "sched_1", {
      caption: "Patched",
      scheduledAt: future,
    });
    expect(updated.caption).toBe("Patched");
    expect(updated.scheduledAt).toBe(future);
  });

  it("mirrors a schedule onto another platform via schedule_post", async () => {
    const gateway = gatewayMock([row]);
    const service = new DefaultCalendarService(gateway, connectorsMock());
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = await service.mirrorToPlatforms("user_1", "sched_1", {
      targets: [
        {
          platform: "linkedin_personal",
          accountId: "acct_li",
          scheduledAt: future,
        },
      ],
      caption: "Hello week",
      media: ["https://cdn.example/a.jpg"],
    });
    expect(result.created).toHaveLength(1);
    expect(result.created[0]?.platform).toBe("linkedin_personal");
    expect(result.created[0]?.scheduledAt).toBe(future);
    expect(gateway.callTool).toHaveBeenCalledWith({
      userId: "user_1",
      name: "schedule_post",
      arguments: {
        platforms: ["linkedin_personal"],
        text: "Hello week",
        connectedAccountId: "acct_li",
        scheduledAt: future,
        confirm: true,
        options: { mediaUrls: ["https://cdn.example/a.jpg"] },
      },
    });
  });

  it("creates a blank schedule via schedule_post (AC-7e)", async () => {
    const gateway = gatewayMock([]);
    const service = new DefaultCalendarService(gateway, connectorsMock());
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const created = await service.createSchedule("user_1", {
      platform: "threads",
      accountId: "acct_1",
      scheduledAt: future,
      caption: "Handmade launch note",
    });
    expect(created.scheduleId).toMatch(/^sched_/);
    expect(created.platform).toBe("threads");
    expect(created.caption).toBe("Handmade launch note");
    expect(created.scheduledAt).toBe(future);
    expect(gateway.callTool).toHaveBeenCalledWith({
      userId: "user_1",
      name: "schedule_post",
      arguments: {
        platforms: ["threads"],
        text: "Handmade launch note",
        connectedAccountId: "acct_1",
        scheduledAt: future,
        confirm: true,
      },
    });
  });

  it("batch creates schedules with per-account captions", async () => {
    const gateway = gatewayMock([]);
    const service = new DefaultCalendarService(gateway, connectorsMock());
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const result = await service.createSchedules("user_1", {
      targets: [
        {
          platform: "threads",
          accountId: "acct_1",
          scheduledAt: future,
          caption: "Threads copy",
        },
        {
          platform: "linkedin_personal",
          accountId: "acct_li",
          scheduledAt: future,
          caption: "LinkedIn copy",
        },
      ],
    });
    expect(result.created).toHaveLength(2);
    expect(result.created.map((row) => row.caption)).toEqual([
      "Threads copy",
      "LinkedIn copy",
    ]);
    expect(
      vi.mocked(gateway.callTool).mock.calls.filter(
        (call) => call[0]?.name === "schedule_post",
      ),
    ).toHaveLength(2);
  });

  it("rejects explicit product media on create when it cannot be resolved", async () => {
    const gateway = gatewayMock([]);
    const service = new DefaultCalendarService(gateway, connectorsMock());
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    await expect(
      service.createSchedule("user_1", {
        platform: "threads",
        accountId: "acct_1",
        scheduledAt: future,
        caption: "Launch note",
        media: [
          "http://localhost:8787/media/assets/media_abc/view?u=user_1&exp=2000000000&sig=abc",
        ],
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CONTENT_UPDATE",
      status: 422,
    });
    expect(gateway.callTool).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "schedule_post" }),
    );
  });

  it("rejects explicit product media on mirror when it cannot be resolved", async () => {
    const gateway = gatewayMock([row]);
    const service = new DefaultCalendarService(gateway, connectorsMock());
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    await expect(
      service.mirrorToPlatforms("user_1", "sched_1", {
        targets: [
          {
            platform: "linkedin_personal",
            accountId: "acct_li",
            scheduledAt: future,
          },
        ],
        media: [
          "http://localhost:8787/media/assets/media_abc/view?u=user_1&exp=2000000000&sig=abc",
        ],
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CONTENT_UPDATE",
      status: 422,
    });
    expect(gateway.callTool).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "schedule_post" }),
    );
  });

  it("prevalidates a create batch before the first schedule_post call", async () => {
    const gateway = gatewayMock([]);
    const service = new DefaultCalendarService(gateway, connectorsMock());
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    await expect(
      service.createSchedules("user_1", {
        targets: [
          {
            platform: "threads",
            accountId: "acct_1",
            scheduledAt: future,
            caption: "Threads copy",
          },
          {
            platform: "linkedin_personal",
            accountId: "acct_missing",
            scheduledAt: future,
            caption: "LinkedIn copy",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_REQUIRED", status: 422 });
    expect(gateway.callTool).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: "schedule_post" }),
    );
  });

  it("returns created schedule details from the create payload when list lags", async () => {
    const createdRows: Array<Record<string, unknown>> = [];
    const gateway: CalendarGateway = {
      callTool: vi.fn().mockImplementation(async (input) => {
        if (input.name === "get_scheduled_posts") {
          return { ok: true, scheduled: [] };
        }
        if (input.name === "schedule_post") {
          const created = {
            id: "sched_lagged",
            platform: "threads",
            connectedAccountId: "acct_1",
            publishAt: input.arguments.scheduledAt,
            status: "scheduled",
            contentText: input.arguments.text,
            captionPreview: input.arguments.text,
            mediaUrls:
              (input.arguments.options as { mediaUrls?: string[] } | undefined)
                ?.mediaUrls ?? [],
          };
          createdRows.push(created);
          return { ok: true, scheduled: [created] };
        }
        throw new Error(`unexpected ${input.name}`);
      }),
    };
    const service = new DefaultCalendarService(gateway, connectorsMock());
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const result = await service.createSchedule("user_1", {
      platform: "threads",
      accountId: "acct_1",
      scheduledAt: future,
      caption: "Lagged list copy",
    });

    expect(result).toMatchObject({
      scheduleId: "sched_lagged",
      platform: "threads",
      accountId: "acct_1",
      caption: "Lagged list copy",
      scheduledAt: future,
    });
    expect(createdRows).toHaveLength(1);
  });

  it("maps infrastructure MCP errors without leaking raw provider details", async () => {
    const gateway: CalendarGateway = {
      callTool: vi.fn().mockImplementation(async (input) => {
        if (input.name === "get_scheduled_posts") {
          return { ok: true, scheduled: [] };
        }
        if (input.name === "schedule_post") {
          return {
            ok: false,
            code: "MCP_TOOL_ERROR",
            message: "database password secret leaked by provider",
            details: { stack: "secret stack", providerResponse: "raw response" },
          };
        }
        throw new Error(`unexpected ${input.name}`);
      }),
    };
    const service = new DefaultCalendarService(gateway, connectorsMock());
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    await expect(
      service.createSchedule("user_1", {
        platform: "threads",
        accountId: "acct_1",
        scheduledAt: future,
        caption: "Copy",
      }),
    ).rejects.toMatchObject({
      code: "SOCIALMCP_UNAVAILABLE",
      status: 502,
      details: undefined,
    });
  });

  it("rejects blank create for past times, bad accounts, and Instagram without media", async () => {
    const service = new DefaultCalendarService(gatewayMock([]), connectorsMock());
    await expect(
      service.createSchedule("user_1", {
        platform: "threads",
        accountId: "acct_1",
        scheduledAt: "2020-01-01T00:00:00.000Z",
        caption: "Too late",
      }),
    ).rejects.toMatchObject({ code: "SCHEDULE_TIME_MUST_BE_FUTURE", status: 422 });

    await expect(
      service.createSchedule("user_1", {
        platform: "threads",
        accountId: "acct_missing",
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        caption: "Nope",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_REQUIRED", status: 422 });

    const withIg = new DefaultCalendarService(
      gatewayMock([]),
      {
        list: vi.fn().mockResolvedValue({
          connectors: [
            {
              platform: "instagram",
              state: "connected",
              accounts: [
                {
                  id: "acct_ig",
                  username: "brandig",
                  displayName: "Brand IG",
                  avatarUrl: null,
                  state: "connected",
                },
              ],
            },
          ],
        }),
        startConnect: vi.fn(),
      },
    );
    await expect(
      withIg.createSchedule("user_1", {
        platform: "instagram",
        accountId: "acct_ig",
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        caption: "No media",
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONTENT_UPDATE", status: 422 });

    await expect(
      withIg.createSchedule("user_1", {
        platform: "instagram",
        accountId: "acct_ig",
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        caption: "Too many",
        media: Array.from(
          { length: 11 },
          (_, i) => `https://cdn.example/${i}.jpg`,
        ),
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONTENT_UPDATE", status: 422 });
  });

  it("rejects mirror onto the source account or past times", async () => {
    const service = new DefaultCalendarService(gatewayMock([row]), connectorsMock());
    await expect(
      service.mirrorToPlatforms("user_1", "sched_1", {
        targets: [
          {
            platform: "threads",
            accountId: "acct_1",
            scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONTENT_UPDATE" });

    await expect(
      service.mirrorToPlatforms("user_1", "sched_1", {
        targets: [
          {
            platform: "linkedin_personal",
            accountId: "acct_li",
            scheduledAt: new Date(Date.now() - 60_000).toISOString(),
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "SCHEDULE_TIME_MUST_BE_FUTURE" });
  });

  it("mirrors onto two accounts on the same platform", async () => {
    const gateway = gatewayMock([row]);
    const service = new DefaultCalendarService(
      gateway,
      connectorsMock({
        threads: [
          { id: "acct_t2", username: "brand2", displayName: "Brand Two" },
          { id: "acct_t3", username: "brand3", displayName: "Brand Three" },
        ],
      }),
    );
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const result = await service.mirrorToPlatforms("user_1", "sched_1", {
      targets: [
        {
          platform: "threads",
          accountId: "acct_t2",
          scheduledAt: future,
        },
        {
          platform: "threads",
          accountId: "acct_t3",
          scheduledAt: future,
        },
      ],
      caption: "Hello week",
      media: ["https://cdn.example/a.jpg"],
    });
    expect(result.created).toHaveLength(2);
    expect(result.created.map((slot) => slot.accountId).sort()).toEqual([
      "acct_t2",
      "acct_t3",
    ]);
    expect(gateway.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "schedule_post",
        arguments: expect.objectContaining({
          platforms: ["threads"],
          connectedAccountId: "acct_t2",
        }),
      }),
    );
    expect(gateway.callTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "schedule_post",
        arguments: expect.objectContaining({
          platforms: ["threads"],
          connectedAccountId: "acct_t3",
        }),
      }),
    );
  });

  it("rolls back earlier mirror schedules when a later target fails", async () => {
    const scheduledRows: Array<Record<string, unknown>> = [
      { ...(row as Record<string, unknown>) },
    ];
    const gateway: CalendarGateway = {
      callTool: vi.fn().mockImplementation(async (input) => {
        if (input.name === "get_scheduled_posts") {
          return { ok: true, scheduled: scheduledRows };
        }
        if (input.name === "cancel_scheduled_post") {
          const id = input.arguments.scheduledPostId;
          const target = scheduledRows.find((entry) => entry.id === id);
          if (target) target.status = "cancelled";
          return { ok: true };
        }
        if (input.name === "schedule_post") {
          if (scheduledRows.some((entry) => entry.id === "sched_li_new")) {
            throw new CalendarError("SOCIALMCP_UNAVAILABLE", 502);
          }
          const created = {
            id: "sched_li_new",
            platform: "linkedin_personal",
            connectedAccountId: "acct_li",
            publishAt: input.arguments.scheduledAt,
            status: "scheduled",
            contentText: input.arguments.text,
            captionPreview: input.arguments.text,
            mediaUrls: ["https://cdn.example/a.jpg"],
          };
          scheduledRows.push(created);
          return { ok: true, scheduled: [created] };
        }
        throw new Error(`unexpected ${input.name}`);
      }),
    };

    const service = new DefaultCalendarService(
      gateway,
      connectorsMock({
        threads: [
          { id: "acct_t2", username: "brand2", displayName: "Brand Two" },
        ],
      }),
    );
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    await expect(
      service.mirrorToPlatforms("user_1", "sched_1", {
        targets: [
          {
            platform: "linkedin_personal",
            accountId: "acct_li",
            scheduledAt: future,
          },
          {
            platform: "threads",
            accountId: "acct_t2",
            scheduledAt: future,
          },
        ],
        caption: "Hello week",
        media: ["https://cdn.example/a.jpg"],
      }),
    ).rejects.toMatchObject({
      code: "SOCIALMCP_UNAVAILABLE",
      details: expect.objectContaining({
        partialFailure: true,
        rolledBackIds: ["sched_li_new"],
      }),
    });

    expect(gateway.callTool).toHaveBeenCalledWith({
      userId: "user_1",
      name: "cancel_scheduled_post",
      arguments: { scheduledPostId: "sched_li_new", confirm: true },
    });
  });

  it("maps VALIDATION_FAILED mirror errors to INVALID_CONTENT_UPDATE with message", async () => {
    const gateway: CalendarGateway = {
      callTool: vi.fn().mockImplementation(async (input) => {
        if (input.name === "get_scheduled_posts") {
          return { ok: true, scheduled: [row] };
        }
        if (input.name === "schedule_post") {
          return {
            ok: false,
            code: "VALIDATION_FAILED",
            message: "[threads] Threads media URLs must use secure HTTPS",
          };
        }
        throw new Error(`unexpected ${input.name}`);
      }),
    };
    const service = new DefaultCalendarService(gateway, connectorsMock());
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await expect(
      service.mirrorToPlatforms("user_1", "sched_1", {
        targets: [
          {
            platform: "linkedin_personal",
            accountId: "acct_li",
            scheduledAt: future,
          },
        ],
        caption: "Hello week",
        media: ["https://cdn.example/a.jpg"],
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CONTENT_UPDATE",
      details: expect.objectContaining({
        message: "[threads] Threads media URLs must use secure HTTPS",
      }),
    });
  });

  it("forwards only https media to schedule_post when mirroring", async () => {
    const gateway = gatewayMock([
      {
        ...row,
        mediaUrls: [
          "https://cdn.example/a.jpg",
          "http://localhost:8787/media/assets/media_abc/view?u=user_1&sig=abc",
        ],
      },
    ]);
    const media = {
      publishUrl: vi.fn(async () => "https://r2.example/signed/media_abc.jpg"),
    };
    const service = new DefaultCalendarService(gateway, connectorsMock(), media);
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await service.mirrorToPlatforms("user_1", "sched_1", {
      targets: [
        {
          platform: "linkedin_personal",
          accountId: "acct_li",
          scheduledAt: future,
        },
      ],
    });
    expect(gateway.callTool).toHaveBeenCalledWith({
      userId: "user_1",
      name: "schedule_post",
      arguments: expect.objectContaining({
        options: {
          mediaUrls: [
            "https://cdn.example/a.jpg",
            "https://r2.example/signed/media_abc.jpg",
          ],
        },
      }),
    });
  });
});
