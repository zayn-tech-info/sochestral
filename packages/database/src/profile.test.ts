import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb, type Database } from "./client.js";
import { requireTestDatabaseUrl } from "./env.js";
import {
  compileProfileNote,
  createProfileEntry,
  ensureBusinessProfile,
  getCompiledProfile,
  isMinimumProfileComplete,
  listProfileEntries,
  patchBusinessProfile,
  ProfileDatabaseError,
  redactProfileBody,
  tryCompleteSetupIfReady,
} from "./profile.js";
import { provisionUser } from "./users.js";

describe("business profile database", () => {
  let database: Database;
  let ownerId: string;
  let otherId: string;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.db.execute(sql`delete from users`);
    ownerId = (await provisionUser(database.db, "owner@example.com")).id;
    otherId = (await provisionUser(database.db, "other@example.com")).id;
  });

  it("creates profile and entries with cascade delete (AC-1)", async () => {
    const profile = await ensureBusinessProfile(database.db, ownerId);
    expect(profile.id.startsWith("bprof_")).toBe(true);
    expect(profile.setupStatus).toBe("not_started");

    const entry = await createProfileEntry(database.db, {
      userId: ownerId,
      category: "tone",
      body: "Warm and direct",
      source: "setup",
    });
    expect(entry.id.startsWith("pentry_")).toBe(true);

    await database.db.execute(sql`delete from users where id = ${ownerId}`);
    const gone = await listProfileEntries(database.db, { userId: ownerId });
    expect(gone.items).toHaveLength(0);
  });

  it("compiles active entries only and gates minimum complete (AC-5, AC-9)", async () => {
    await patchBusinessProfile(database.db, ownerId, {
      businessName: "Acme Tools",
      businessDescription: "We sell hand tools",
      setupStatus: "in_progress",
    });
    await createProfileEntry(database.db, {
      userId: ownerId,
      category: "competitor",
      title: "Rival Co",
      body: "Competes on price",
      source: "research",
      status: "proposed",
    });
    await createProfileEntry(database.db, {
      userId: ownerId,
      category: "tone",
      body: "Short sentences",
      source: "setup",
      status: "active",
    });

    let compiled = await getCompiledProfile(database.db, ownerId);
    expect(compiled.minimumComplete).toBe(false);
    expect(compiled.compiledNote).toContain("Acme Tools");
    expect(compiled.compiledNote).not.toContain("Rival Co");

    await patchBusinessProfile(database.db, ownerId, {
      competitorsSkipped: true,
    });
    compiled = await getCompiledProfile(database.db, ownerId);
    expect(isMinimumProfileComplete(compiled.profile, compiled.activeEntries)).toBe(
      true,
    );
    const completed = await tryCompleteSetupIfReady(database.db, ownerId);
    expect(completed.setupStatus).toBe("complete");
  });

  it("scopes entries to the owner (AC-8)", async () => {
    await createProfileEntry(database.db, {
      userId: ownerId,
      category: "skill",
      body: "Owner only",
      source: "settings",
    });
    const other = await listProfileEntries(database.db, { userId: otherId });
    expect(other.items).toHaveLength(0);
  });

  it("rejects empty entry bodies", async () => {
    await expect(
      createProfileEntry(database.db, {
        userId: ownerId,
        category: "brand_fact",
        body: "   ",
        source: "settings",
      }),
    ).rejects.toBeInstanceOf(ProfileDatabaseError);
  });

  it("compileProfileNote is deterministic", () => {
    const note = compileProfileNote(
      {
        id: "bprof_x",
        userId: ownerId,
        businessName: "Acme",
        businessDescription: "Tools",
        websiteUrl: null,
        targetAudience: null,
        industry: null,
        setupStatus: "complete",
        setupStep: "done",
        competitorsSkipped: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      [
        {
          id: "pentry_a",
          userId: ownerId,
          category: "tone",
          title: null,
          body: "Warm",
          status: "active",
          source: "setup",
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    );
    expect(note).toContain("# Business profile");
    expect(note).toContain("## tone");
    expect(note).toContain("Warm");
  });

  it("redacts secret shaped strings in entry bodies (AC-8)", async () => {
    expect(redactProfileBody("api_key=sk-abcdefghijklmnopqrstuvwxyz012345")).toBe(
      "[redacted]",
    );
    const entry = await createProfileEntry(database.db, {
      userId: ownerId,
      category: "brand_fact",
      body: "token: bearer-secret-value-here",
      source: "settings",
    });
    expect(entry.body).toBe("[redacted]");
  });

  it("redo setup returns to in_progress without wiping active entries (AC-9)", async () => {
    await patchBusinessProfile(database.db, ownerId, {
      businessName: "Acme",
      businessDescription: "Tools",
      competitorsSkipped: true,
      setupStatus: "in_progress",
    });
    await createProfileEntry(database.db, {
      userId: ownerId,
      category: "tone",
      body: "Warm",
      source: "setup",
    });
    await tryCompleteSetupIfReady(database.db, ownerId);

    const redone = await patchBusinessProfile(database.db, ownerId, {
      redoSetup: true,
    });
    expect(redone.setupStatus).toBe("in_progress");
    expect(redone.businessName).toBe("Acme");
    const entries = await listProfileEntries(database.db, { userId: ownerId });
    expect(entries.items.some((item) => item.body === "Warm")).toBe(true);
  });
});
