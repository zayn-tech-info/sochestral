import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDb, requireTestDatabaseUrl, provisionUser, createPlan, approvePlanDirection, enqueueCreateContent,
  claimContentJob, applyContentSet, patchBusinessProfile, getPlan, boardScheduleOperations, campaignJobs, type Database, type PlanDocument,
} from "@sochestral/database";
import { confirmBoardSchedule } from "./board-schedule.js";
import type { ConnectorService } from "./connectors.js";
import type { SocialMcpGateway } from "./mcp.js";

const document = (): PlanDocument => ({ schemaVersion: 1, sections: (["goal", "audience_voice", "direction", "calendar", "sources", "missing_inputs"] as const).map(type => ({
  id: `s_${type}`, type, title: type, blocks: type === "calendar"
    ? [{ id: "calendar_table", kind: "calendar", items: [
      { id: "item_text", angle: "Shop tip", audience: "Builders", format: "text", destinations: ["threads"], proposedTime: "2031-01-02T09:00", assetNeeds: [] },
      { id: "item_image", angle: "Photo", audience: "Builders", format: "image", destinations: ["instagram"], proposedTime: "2031-01-02T10:00", assetNeeds: ["photo"] },
    ] }]
    : [{ id: `b_${type}`, kind: "paragraph", text: `Review ${type}` }],
})) });

describe("board schedule posts", () => {
  let database: Database;
  let userId: string;
  let planId: string;
  let textItemId: string;
  let imageItemId: string;
  beforeAll(() => { database = createDb(requireTestDatabaseUrl()); });
  afterAll(async () => { await database.client.end({ timeout: 5 }); });
  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "board-schedule@example.test")).id;
    await patchBusinessProfile(database.db, userId, { timezone: "UTC", confirmTimezone: true });
    planId = (await createPlan(database.db, { userId, title: "Launch", document: document(), contextId: null })).plan.id;
    await approvePlanDirection(database.db, { userId, planId, version: 1 });
    await enqueueCreateContent(database.db, { userId, planId, version: 1 });
    const claimed = await claimContentJob(database.db);
    await applyContentSet(database.db, {
      userId, planId, jobId: claimed!.job.id, claimToken: claimed!.job.claimToken!, document: document(),
      captions: [
        { calendarItemId: "item_text", caption: "A shop-floor caption." },
        { calendarItemId: "item_image", caption: "Show the clamp." },
      ],
    });
    const loaded = await getPlan(database.db, userId, planId);
    textItemId = loaded.contentItems.find(item => item.calendarItemId === "item_text")!.id;
    imageItemId = loaded.contentItems.find(item => item.calendarItemId === "item_image")!.id;
  });

  const connectors: ConnectorService = {
    list: async () => ({ connectors: [
      { platform: "threads", state: "connected", accounts: [{ id: "acct_threads", username: "shop", displayName: "Shop", avatarUrl: null, state: "connected" }] },
      { platform: "instagram", state: "connected", accounts: [{ id: "acct_ig", username: "shopig", displayName: "Shop IG", avatarUrl: null, state: "connected" }] },
      { platform: "linkedin_personal", state: "not_connected", accounts: [] },
    ] }),
    startConnect: vi.fn(),
  };
  const mcp = (): SocialMcpGateway => ({
    callTool: vi.fn(async () => ({ value: { ok: true, scheduled: [{ id: "sched_1" }] }, attempts: 1 })),
    listTools: vi.fn(),
  });

  it("queues ready rows through schedule_post and omits an excluded blocked sibling", async () => {
    const gateway = mcp();
    const result = await confirmBoardSchedule(database.db, {
      userId, planId, version: 1, confirm: true, connectors, mcp: gateway, now: new Date("2030-01-01T00:00:00Z"),
      rows: [
        { itemId: textItemId, localTime: "2031-01-02T09:00", accounts: { threads: "acct_threads" } },
        { itemId: imageItemId, excluded: true },
      ],
    });
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({ status: "scheduled", destination: "threads" });
    expect(gateway.callTool).toHaveBeenCalledWith(expect.objectContaining({
      name: "schedule_post",
      arguments: expect.objectContaining({ confirm: true, connectedAccountId: "acct_threads", platforms: ["threads"], text: "A shop-floor caption." }),
    }));
    expect(gateway.callTool).not.toHaveBeenCalledWith(expect.objectContaining({ name: "publish_now" }));
    expect(await database.db.select().from(boardScheduleOperations)).toHaveLength(1);
    expect(await database.db.select().from(campaignJobs)).toHaveLength(0);
  });

  it("refuses a blocked row that was not excluded and does not call MCP", async () => {
    const gateway = mcp();
    await expect(confirmBoardSchedule(database.db, {
      userId, planId, version: 1, confirm: true, connectors, mcp: gateway, now: new Date("2030-01-01T00:00:00Z"),
      rows: [
        { itemId: textItemId, localTime: "2031-01-02T09:00", accounts: { threads: "acct_threads" } },
        { itemId: imageItemId, localTime: "2031-01-02T10:00", accounts: { instagram: "acct_ig" } },
      ],
    })).rejects.toMatchObject({ code: "SCHEDULE_NOT_READY", details: { itemIds: [imageItemId] } });
    expect(gateway.callTool).not.toHaveBeenCalled();
  });

  it("requires confirmed timezone and confirm true", async () => {
    const other = await provisionUser(database.db, "board-schedule-none@example.test");
    const otherPlan = (await createPlan(database.db, { userId: other.id, title: "Other", document: document(), contextId: null })).plan.id;
    await expect(confirmBoardSchedule(database.db, {
      userId: other.id, planId: otherPlan, version: 1, confirm: true, connectors, mcp: mcp(), rows: [],
    })).rejects.toMatchObject({ code: "TIMEZONE_NOT_CONFIRMED" });
    await expect(confirmBoardSchedule(database.db, {
      userId, planId, version: 1, confirm: false, connectors, mcp: mcp(), rows: [],
    })).rejects.toMatchObject({ code: "INVALID_DOCUMENT" });
  });
});
