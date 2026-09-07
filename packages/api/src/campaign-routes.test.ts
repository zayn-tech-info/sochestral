import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSession, SESSION_COOKIE_NAME } from "@sochestral/auth";
import {
  createDb,
  enqueueCampaignJob,
  provisionUser,
  requireTestDatabaseUrl,
  upsertConversationContentPlan,
  createConversationTurn,
  type Database,
} from "@sochestral/database";
import { createApp } from "./app.js";

function headers(cookie: string): Record<string, string> {
  return {
    Cookie: cookie,
    Origin: "http://localhost:3000",
    "Content-Type": "application/json",
  };
}

describe("campaign API routes", () => {
  let database: Database;
  let cookie: string;
  let otherCookie: string;
  let ownerId: string;
  let jobId: string;
  let app: ReturnType<typeof createApp>;
  const previousCors = process.env.CORS_ORIGIN;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (previousCors === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previousCors;
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    process.env.CORS_ORIGIN = "http://localhost:3000";
    await database.client`delete from users`;
    const owner = await provisionUser(database.db, "camp-api@example.com");
    const other = await provisionUser(database.db, "camp-other@example.com");
    ownerId = owner.id;
    const ownerSession = await createSession(database.db, owner.id);
    const otherSession = await createSession(database.db, other.id);
    cookie = `${SESSION_COOKIE_NAME}=${ownerSession.rawToken}`;
    otherCookie = `${SESSION_COOKIE_NAME}=${otherSession.rawToken}`;
    app = createApp(database.db);
    const turn = await createConversationTurn(database.db, {
      userId: ownerId,
      requestId: "20000000-0000-4000-8000-000000000301",
      content: "Go",
      title: "Go",
      assistantContent: "Booking started.",
    });
    const plan = await upsertConversationContentPlan(database.db, {
      userId: ownerId,
      conversationId: turn.conversation.id,
      startDate: "2026-08-20",
      timezone: "UTC",
      cadence: { threadsPerDay: 1 },
      platforms: ["threads"],
      direction: "Ship notes",
    });
    const job = await enqueueCampaignJob(database.db, {
      userId: ownerId,
      conversationId: turn.conversation.id,
      planId: plan.id,
      nextDate: "2026-08-20",
      cap: 30,
    });
    jobId = job.id;
  });

  it("returns the in flight job for the owner and 404 for a foreign user (AC-8)", async () => {
    const mine = await app.request("/campaigns/current", {
      headers: headers(cookie),
    });
    expect(mine.status).toBe(200);
    const body = (await mine.json()) as { campaign: { id: string } };
    expect(body.campaign.id).toBe(jobId);

    const foreign = await app.request("/campaigns/current", {
      headers: headers(otherCookie),
    });
    expect(foreign.status).toBe(404);
  });

  it("requires confirm true to pause (AC-7)", async () => {
    const denied = await app.request(`/campaigns/${jobId}/pause`, {
      method: "POST",
      headers: headers(cookie),
      body: JSON.stringify({ confirm: false }),
    });
    expect(denied.status).toBe(400);
    const ok = await app.request(`/campaigns/${jobId}/pause`, {
      method: "POST",
      headers: headers(cookie),
      body: JSON.stringify({ confirm: true }),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { status: string };
    expect(body.status).toBe("paused");
  });
});
