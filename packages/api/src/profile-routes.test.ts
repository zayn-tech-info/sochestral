import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSession, SESSION_COOKIE_NAME } from "@sochestral/auth";
import {
  createDb,
  createProfileEntry,
  provisionUser,
  requireTestDatabaseUrl,
  type Database,
} from "@sochestral/database";
import { createApp } from "./app.js";

describe("profile API routes", () => {
  let database: Database;
  let cookie: string;
  let otherCookie: string;
  let ownerId: string;
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
    const owner = await provisionUser(database.db, "profile-owner@example.com");
    const other = await provisionUser(database.db, "profile-other@example.com");
    ownerId = owner.id;
    const ownerSession = await createSession(database.db, owner.id);
    const otherSession = await createSession(database.db, other.id);
    cookie = `${SESSION_COOKIE_NAME}=${ownerSession.rawToken}`;
    otherCookie = `${SESSION_COOKIE_NAME}=${otherSession.rawToken}`;
    app = createApp(database.db);
  });

  it("requires a session for GET /profile", async () => {
    const response = await app.request("/profile");
    expect(response.status).toBe(401);
  });

  it("returns compiled profile for the session user (AC-5)", async () => {
    const response = await app.request("/profile", {
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.setupStatus).toBe("not_started");
    expect(body.compiledNote).toContain("# Business profile");
    expect(body.sections).toEqual({});
  });

  it("patches identity fields (AC-5)", async () => {
    const response = await app.request("/profile", {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessName: "Acme",
        businessDescription: "Tools for makers",
      }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.businessName).toBe("Acme");
    expect(body.businessDescription).toBe("Tools for makers");
  });

  it("creates and lists owned entries; foreign entry is 404 (AC-8)", async () => {
    const create = await app.request("/profile/entries", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        category: "tone",
        body: "Warm and short",
      }),
    });
    expect(create.status).toBe(201);
    const created = await create.json();

    const list = await app.request("/profile/entries", {
      headers: { Cookie: cookie },
    });
    expect(list.status).toBe(200);
    const listed = await list.json();
    expect(listed.items).toHaveLength(1);

    const foreign = await app.request(`/profile/entries/${created.id}`, {
      method: "PATCH",
      headers: {
        Cookie: otherCookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: "Hijack" }),
    });
    expect(foreign.status).toBe(404);

    const entry = await createProfileEntry(database.db, {
      userId: ownerId,
      category: "skill",
      body: "direct insert",
      source: "setup",
    });
    const del = await app.request(`/profile/entries/${entry.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    expect(del.status).toBe(204);
  });

  it("redacts secret shaped entry bodies on create (AC-8)", async () => {
    const create = await app.request("/profile/entries", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        category: "brand_fact",
        body: "api_key=sk-abcdefghijklmnopqrstuvwxyz012345",
      }),
    });
    expect(create.status).toBe(201);
    const body = await create.json();
    expect(body.body).toBe("[redacted]");
  });

  it("records competitor skip and redo setup (AC-9)", async () => {
    await app.request("/profile", {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessName: "Acme",
        businessDescription: "Tools",
        competitorsSkipped: true,
      }),
    });
    await app.request("/profile/entries", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ category: "tone", body: "Warm" }),
    });

    const skipped = await app.request("/profile", {
      headers: { Cookie: cookie },
    });
    const skippedBody = await skipped.json();
    expect(skippedBody.competitorsSkipped).toBe(true);
    expect(skippedBody.minimumComplete).toBe(true);

    const redo = await app.request("/profile", {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ redoSetup: true }),
    });
    expect(redo.status).toBe(200);
    const redone = await redo.json();
    expect(redone.setupStatus).toBe("in_progress");
    expect(redone.businessName).toBe("Acme");
  });
});
