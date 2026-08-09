import { describe, expect, it, vi } from "vitest";

import {
  DefaultCalendarService,
  mapStatusBucket,
  isSafeMediaUrl,
  CalendarError,
  type CalendarGateway,
} from "./calendar.js";
import type { ConnectorService } from "./connectors.js";

function connectorsMock(): ConnectorService {
  return {
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
              state: "connected",
            },
          ],
        },
        { platform: "linkedin_personal", state: "not_connected", accounts: [] },
        { platform: "instagram", state: "not_connected", accounts: [] },
      ],
    }),
    startConnect: vi.fn(),
  };
}

function gatewayMock(scheduled: unknown[]): CalendarGateway {
  return {
    callTool: vi.fn().mockImplementation(async (input) => {
      if (input.name === "get_scheduled_posts") {
        return { ok: true, scheduled };
      }
      if (input.name === "cancel_scheduled_post") {
        return { ok: true };
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
    ]);
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
      accountId: "acct_1",
    });

    expect(result.slots).toHaveLength(1);
    expect(result.slots[0]?.scheduleId).toBe("sched_1");
    expect(result.slots[0]?.thumbUrl).toBe("https://cdn.example/a.jpg");
    expect(result.slots[0]?.captionPreview).toBe("Hello week");
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

  it("disables reschedule and cancels pending schedules", async () => {
    const gateway = gatewayMock([row]);
    const service = new DefaultCalendarService(gateway, connectorsMock());

    await expect(
      service.reschedule("user_1", "sched_1", "2026-08-11T12:00:00.000Z"),
    ).rejects.toBeInstanceOf(CalendarError);

    const canceled = await service.cancel("user_1", "sched_1");
    expect(canceled).toEqual({ ok: true, scheduleId: "sched_1" });
    expect(gateway.callTool).toHaveBeenCalledWith({
      userId: "user_1",
      name: "cancel_scheduled_post",
      arguments: { scheduledPostId: "sched_1", confirm: true },
    });
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
});
