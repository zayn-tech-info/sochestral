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

type ProfileResponse = {
  businessName: string | null;
  businessDescription: string | null;
  personaRole: string | null;
  primaryPlatforms: string[];
  setupStatus: string;
  compiledNote: string;
  minimumComplete: boolean;
  sections: Record<string, Array<unknown> | undefined>;
};

type ProfileEntryResponse = {
  id: string;
  body: string;
};

type ProfileEntriesResponse = {
  items: ProfileEntryResponse[];
};

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
    const body = (await response.json()) as ProfileResponse;
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
    const body = (await response.json()) as ProfileResponse;
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
    const created = (await create.json()) as ProfileEntryResponse;

    const list = await app.request("/profile/entries", {
      headers: { Cookie: cookie },
    });
    expect(list.status).toBe(200);
    const listed = (await list.json()) as ProfileEntriesResponse;
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
    const body = (await create.json()) as ProfileEntryResponse;
    expect(body.body).toBe("[redacted]");
  });

  it("records wizard identity and completes setup (AC-7)", async () => {
    const description = Array.from({ length: 32 }, (_, i) => `word${i}`).join(
      " ",
    );
    const response = await app.request("/profile", {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessName: "Acme",
        businessDescription: description,
        personaRole: "business_owner",
        primaryPlatforms: ["threads", "linkedin_personal"],
        attributionSource: "friend",
        skills: ["Content writing", "Product marketing"],
        setupStep: "attribution",
        completeSetup: true,
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as ProfileResponse;
    expect(body.personaRole).toBe("business_owner");
    expect(body.primaryPlatforms).toEqual(["threads", "linkedin_personal"]);
    expect(body.minimumComplete).toBe(true);
    expect(body.setupStatus).toBe("complete");
    expect(body.sections.skill?.length).toBe(2);

    const redo = await app.request("/profile", {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ redoSetup: true }),
    });
    expect(redo.status).toBe(200);
    const redone = (await redo.json()) as ProfileResponse;
    expect(redone.setupStatus).toBe("in_progress");
    expect(redone.businessName).toBe("Acme");
  });

  it("rejects unsupported wizard progress and skills", async () => {
    const badStep = await app.request("/profile", {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        setupStep: "unsupported_step",
      }),
    });
    expect(badStep.status).toBe(422);

    const badSkill = await app.request("/profile", {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        skills: ["Content writing", "Unsupported skill"],
      }),
    });
    expect(badSkill.status).toBe(422);
  });

  it("demotes complete profiles when settings remove required values", async () => {
    const description = Array.from({ length: 32 }, (_, i) => `word${i}`).join(
      " ",
    );
    const complete = await app.request("/profile", {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessName: "Acme",
        businessDescription: description,
        personaRole: "business_owner",
        primaryPlatforms: ["threads"],
        attributionSource: "friend",
        skills: ["Content writing"],
        setupStep: "done",
        completeSetup: true,
      }),
    });
    expect(complete.status).toBe(200);

    const response = await app.request("/profile", {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessName: null,
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as ProfileResponse;
    expect(body.setupStatus).toBe("in_progress");
    expect(body.minimumComplete).toBe(false);
  });
});
