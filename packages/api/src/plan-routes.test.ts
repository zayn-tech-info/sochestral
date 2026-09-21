import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, SESSION_COOKIE_NAME } from "@sochestral/auth";
import { campaignJobs, createDb, provisionUser, requireTestDatabaseUrl, patchBusinessProfile, type Database } from "@sochestral/database";
import { processOneContentJob } from "@sochestral/orchestration";
import { createApp } from "./app.js";

const document = {
  schemaVersion: 1,
  sections: ["goal", "audience_voice", "direction", "calendar", "sources", "missing_inputs"].map(type => ({
    id: `s_${type}`, type, title: type, blocks: [{ id: `b_${type}`, kind: "paragraph", text: `Plan ${type}` }],
  })),
};
const calendarDocument = {
  schemaVersion: 1,
  sections: ["goal", "audience_voice", "direction", "calendar", "sources", "missing_inputs"].map(type => ({
    id: `s_${type}`, type, title: type, blocks: type === "calendar"
      ? [{ id: "calendar_table", kind: "calendar", items: [
        { id: "item_text", angle: "Shop tip", audience: "Builders", format: "text", destinations: ["threads"], proposedTime: null, assetNeeds: [] },
        { id: "item_image", angle: "Clamp photo", audience: "Builders", format: "image", destinations: ["instagram"], proposedTime: null, assetNeeds: ["hero photo"] },
      ] }]
      : [{ id: `b_${type}`, kind: "paragraph", text: `Plan ${type}` }],
  })),
};

describe("plan API", () => {
  let database: Database;
  let app: ReturnType<typeof createApp>;
  let cookie: string;
  let otherCookie: string;
  let ownerId: string;
  beforeAll(() => { database = createDb(requireTestDatabaseUrl()); });
  afterAll(async () => { await database.client.end({ timeout: 5 }); });
  beforeEach(async () => {
    await database.client`delete from users`;
    const owner = await provisionUser(database.db, "plan-api@example.com");
    ownerId = owner.id;
    const other = await provisionUser(database.db, "plan-api-other@example.com");
    cookie = `${SESSION_COOKIE_NAME}=${(await createSession(database.db, owner.id)).rawToken}`;
    otherCookie = `${SESSION_COOKIE_NAME}=${(await createSession(database.db, other.id)).rawToken}`;
    app = createApp(database.db);
  });
  const post = (path: string, value: unknown, session = cookie) => app.request(path, {
    method: "POST", headers: { Cookie: session, Origin: "http://localhost:3000", "Content-Type": "application/json", "X-Sochestral-Request": "plan-action" }, body: JSON.stringify(value),
  });
  const create = async () => {
    const response = await post("/plans", { title: "Launch", document });
    expect(response.status).toBe(200);
    return (await response.json() as { plan: { id: string } }).plan.id;
  };

  it("requires authentication and rejects a mutation without the browser action headers", async () => {
    expect((await app.request("/plans")).status).toBe(401);
    expect((await app.request("/plans", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ title: "Launch", document }) })).status).toBe(403);
  });

  it("keeps plans, comments and approvals scoped to their owner", async () => {
    const planId = await create();
    expect((await app.request(`/plans/${planId}`, { headers: { Cookie: otherCookie } })).status).toBe(404);
    expect((await post(`/plans/${planId}/comments`, { version: 1, blockId: "b_goal", body: "Change" }, otherCookie)).status).toBe(404);
    expect((await post(`/plans/${planId}/approve`, { version: 1, confirm: true }, otherCookie)).status).toBe(404);
    expect((await post(`/plans/${planId}/create-content`, { version: 1, confirm: true }, otherCookie)).status).toBe(404);
    const list = await app.request("/plans", { headers: { Cookie: otherCookie } });
    expect(await list.json()).toEqual({ plans: [] });
  });

  it("requires explicit version confirmation and invalidates approval after revision", async () => {
    const planId = await create();
    expect((await post(`/plans/${planId}/approve`, { version: 1 })).status).toBe(422);
    const approved = await post(`/plans/${planId}/approve`, { version: 1, confirm: true });
    expect(await approved.json()).toMatchObject({ scope: "plan_direction", revision: 1 });
    expect(await database.db.select().from(campaignJobs)).toHaveLength(0);
    expect((await post(`/plans/${planId}/create-content`, { version: 1, confirm: true })).status).toBe(422);
    expect(await (await post(`/plans/${planId}/create-content`, { version: 1, confirm: true })).json()).toEqual({ error: "NO_CALENDAR_ITEMS" });
    expect((await post(`/plans/${planId}/versions`, { expectedVersion: 1, document })).status).toBe(200);
    expect((await post(`/plans/${planId}/approve`, { version: 1, confirm: true })).status).toBe(409);
    const result = await app.request(`/plans/${planId}`, { headers: { Cookie: cookie } });
    expect(await result.json()).toMatchObject({ plan: { currentVersion: 2 }, approvals: [] });
  });

  it("reattaches feedback only to a validated current anchor owned by the caller", async () => {
    const planId = await create();
    const comment = await (await post(`/plans/${planId}/comments`, { version: 1, blockId: "b_goal", body: "Keep this idea", quote: "Plan goal" })).json() as { id: string };
    const next = structuredClone(document);
    next.sections[0]!.blocks[0]!.text = "Reach independent shops";
    await post(`/plans/${planId}/versions`, { expectedVersion: 1, document: next });
    const path = `/plans/${planId}/comments/${comment.id}/reattach`;
    const input = { version: 2, blockId: "b_goal", quote: "independent shops" };
    expect((await post(path, input, otherCookie)).status).toBe(404);
    expect((await post(path, { ...input, version: 1 })).status).toBe(409);
    expect((await post(path, { ...input, quote: "absent" })).status).toBe(422);
    const saved = await post(path, input);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ body: "Keep this idea", version: 2, reattachedFromId: comment.id, status: "pending" });
  });

  it("retrieves exact immutable versions and keeps history private", async () => {
    const planId = await create();
    const revised = structuredClone(document);
    revised.sections[0]!.blocks[0]!.text = "A more specific goal";
    expect((await post(`/plans/${planId}/versions`, { expectedVersion: 1, document: revised })).status).toBe(200);
    const read = (suffix: string, session = cookie) => app.request(`/plans/${planId}${suffix}`, { headers: { Cookie: session } });
    const previous = await read("?version=1");
    expect(previous.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await previous.json()).toMatchObject({ plan: { currentVersion: 2 }, version: { version: 1, document } });
    expect(await (await read("")).json()).toMatchObject({ version: { version: 2, document: revised, parentVersion: 1, changedBlockIds: ["b_goal"] } });
    expect((await read("?version=1", otherCookie)).status).toBe(404);
    expect((await read("?version=3")).status).toBe(404);
    for (const bad of ["0", "-1", "1.5", "1e0", "abc", "9007199254740992"]) expect((await read(`?version=${bad}`)).status).toBe(422);
  });

  it("creates captions from a direction-approved calendar and never inserts campaign jobs", async () => {
    const created = await post("/plans", { title: "Launch", document: calendarDocument });
    const planId = (await created.json() as { plan: { id: string } }).plan.id;
    expect((await app.request(`/plans/${planId}/create-content`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: 1, confirm: true }) })).status).toBe(401);
    expect((await post(`/plans/${planId}/create-content`, { version: 1 })).status).toBe(422);
    expect((await post(`/plans/${planId}/create-content`, { version: 1, confirm: true })).status).toBe(409);
    expect(await (await post(`/plans/${planId}/create-content`, { version: 1, confirm: true })).json()).toEqual({ error: "DIRECTION_NOT_APPROVED" });
    expect((await post(`/plans/${planId}/approve`, { version: 1, confirm: true })).status).toBe(200);
    const queued = await post(`/plans/${planId}/create-content`, { version: 1, confirm: true });
    expect(queued.status).toBe(200);
    expect(await queued.json()).toMatchObject({ contentJob: { planVersion: 1, status: "submitted" }, contentItems: [] });
    const replay = await post(`/plans/${planId}/create-content`, { version: 1, confirm: true });
    expect(await replay.json()).toMatchObject({ contentJob: { status: "submitted" } });
    const complete = vi.fn(async (_input: { tools?: Array<{ name: string }> }) => ({
      content: null, thinking: null, toolCalls: [{ id: "call_1", name: "save_content_set", input: { items: [
        { calendarItemId: "item_text", caption: "A shop-floor caption for builders." },
        { calendarItemId: "item_image", caption: "Show the clamp on the bench." },
      ] } }], inputTokens: 0, outputTokens: 0, attempts: 1,
    }));
    expect(await processOneContentJob(database.db, { provider: { complete }, model: "test-model", maxTokens: 4000 })).toBe("applied");
    const result = await app.request(`/plans/${planId}`, { headers: { Cookie: cookie } });
    const body = await result.json() as { contentJob: { status: string }; contentItems: Array<{ calendarItemId: string; status: string }> };
    expect(body.contentJob.status).toBe("applied");
    expect(body).not.toEqual(expect.objectContaining({ contentJob: expect.objectContaining({ claimToken: expect.anything() }) }));
    expect(body.contentItems).toHaveLength(2);
    expect(body.contentItems.find(item => item.calendarItemId === "item_text")?.status).toBe("ready");
    expect(body.contentItems.find(item => item.calendarItemId === "item_image")?.status).toBe("blocked");
    expect(await database.db.select().from(campaignJobs)).toHaveLength(0);
    expect(complete.mock.calls[0]?.[0].tools?.[0]?.name).toBe("save_content_set");
    const again = await post(`/plans/${planId}/create-content`, { version: 1, confirm: true });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ contentJob: { status: "applied" }, contentItems: expect.arrayContaining([expect.objectContaining({ calendarItemId: "item_text", status: "ready" })]) });
  });

  it("stores comments immediately and rejects an anchor absent from the reviewed version", async () => {
    const planId = await create();
    expect((await post(`/plans/${planId}/comments`, { version: 1, blockId: "b_goal", quote: "fabricated quote", body: "Change" })).status).toBe(422);
    const response = await post(`/plans/${planId}/comments`, { version: 1, blockId: "b_goal", quote: "Plan", rangeStart: 0, rangeEnd: 4, body: "Make this specific" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "pending", version: 1, quote: "Plan" });
    const result = await app.request(`/plans/${planId}`, { headers: { Cookie: cookie } });
    expect(await result.json()).toMatchObject({ comments: [expect.objectContaining({ body: "Make this specific" })] });
  });

  it("starts captions when an older plan board is opened", async () => {
    const created = await post("/plans", { title: "Launch", document: calendarDocument });
    const planId = (await created.json() as { plan: { id: string } }).plan.id;
    const opened = await app.request(`/plans/${planId}`, { headers: { Cookie: cookie } });
    expect(opened.status).toBe(200);
    expect(await opened.json()).toMatchObject({ contentJob: { status: "submitted", planVersion: 1 }, contentItems: [] });
    expect(await database.db.select().from(campaignJobs)).toHaveLength(0);
  });

  it("accepts board comments and schedules only ready excluded-aware rows", async () => {
    const created = await post("/plans", { title: "Launch", document: calendarDocument });
    const planId = (await created.json() as { plan: { id: string } }).plan.id;
    await post(`/plans/${planId}/approve`, { version: 1, confirm: true });
    await post(`/plans/${planId}/create-content`, { version: 1, confirm: true });
    await processOneContentJob(database.db, { provider: { complete: async () => ({
      content: null, thinking: null, toolCalls: [{ id: "call_1", name: "save_content_set", input: { items: [
        { calendarItemId: "item_text", caption: "A shop-floor caption for builders." },
        { calendarItemId: "item_image", caption: "Show the clamp on the bench." },
      ] } }], inputTokens: 0, outputTokens: 0, attempts: 1,
    }) }, model: "test-model", maxTokens: 4000 });
    const comment = await post(`/plans/${planId}/comments`, { version: 1, blockId: "board", scope: "board", body: "Sharper CTA" });
    expect(comment.status).toBe(200);
    expect(await comment.json()).toMatchObject({ scope: "board", blockId: "board" });
    const snapshot = await (await app.request(`/plans/${planId}`, { headers: { Cookie: cookie } })).json() as { contentItems: Array<{ id: string; calendarItemId: string }>; board: { timezoneConfirmed: boolean } };
    expect(snapshot.board.timezoneConfirmed).toBe(false);
    const textId = snapshot.contentItems.find(item => item.calendarItemId === "item_text")!.id;
    const imageId = snapshot.contentItems.find(item => item.calendarItemId === "item_image")!.id;
    const mcp = { callTool: vi.fn(async () => ({ value: { ok: true, scheduled: [{ id: "s1" }] }, attempts: 1 })), listTools: vi.fn() };
    const connectors = {
      list: async () => ({ connectors: [
        { platform: "threads" as const, state: "connected" as const, accounts: [{ id: "acct_1", username: "shop", displayName: "Shop", avatarUrl: null, state: "connected" as const }] },
        { platform: "instagram" as const, state: "not_connected" as const, accounts: [] },
        { platform: "linkedin_personal" as const, state: "not_connected" as const, accounts: [] },
      ] }),
      startConnect: vi.fn(),
    };
    const scheduledApp = createApp(database.db, undefined, connectors, undefined, undefined, mcp);
    const schedule = (body: unknown, session = cookie) => scheduledApp.request(`/plans/${planId}/schedule-posts`, {
      method: "POST", headers: { Cookie: session, Origin: "http://localhost:3000", "Content-Type": "application/json", "X-Sochestral-Request": "plan-action" }, body: JSON.stringify(body),
    });
    const rows = [
      { itemId: textId, localTime: "2031-01-02T09:00", accounts: { threads: "acct_1" } },
      { itemId: imageId, excluded: true },
    ];
    expect(await (await schedule({ version: 1, confirm: true, rows })).json()).toEqual({ error: "TIMEZONE_NOT_CONFIRMED" });
    expect(mcp.callTool).not.toHaveBeenCalled();
    await patchBusinessProfile(database.db, ownerId, { timezone: "UTC", confirmTimezone: true });
    expect((await schedule({ version: 1, rows })).status).toBe(422);
    const queued = await schedule({ version: 1, confirm: true, rows });
    expect(queued.status).toBe(200);
    expect(await queued.json()).toMatchObject({ operations: [expect.objectContaining({ status: "scheduled", destination: "threads" })] });
    expect(mcp.callTool).toHaveBeenCalledWith(expect.objectContaining({ name: "schedule_post", arguments: expect.objectContaining({ confirm: true, connectedAccountId: "acct_1", scheduledAt: expect.any(String) }) }));
    expect((await schedule({ version: 1, confirm: true, rows }, otherCookie)).status).toBe(404);
    expect(await database.db.select().from(campaignJobs)).toHaveLength(0);
  });
});
