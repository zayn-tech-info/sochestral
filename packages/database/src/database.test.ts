import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client.js";
import { DatabaseError, EMAIL_TAKEN } from "./errors.js";
import { requireDatabaseUrl, requireTestDatabaseUrl } from "./env.js";
import { insertDraft, listDraftsByUserId } from "./drafts.js";
import { drafts, users } from "./schema.js";
import { deleteUser, provisionUser } from "./users.js";
import { sql } from "drizzle-orm";

describe("product database", () => {
  let database: Database;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.db.execute(sql`delete from drafts`);
    await database.db.execute(sql`delete from users`);
  });

  it("provisions a user with opaque user_ id and optional email (AC-1, AC-3)", async () => {
    const user = await provisionUser(database.db, "  Alice@Example.COM ");
    expect(user.id).toMatch(/^user_[A-Za-z0-9_-]{21}$/);
    expect(user.email).toBe("alice@example.com");
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it("provisions a user with null email when blank (AC-3)", async () => {
    const user = await provisionUser(database.db, "   ");
    expect(user.email).toBeNull();
  });

  it("allows multiple users with null email", async () => {
    const a = await provisionUser(database.db, null);
    const b = await provisionUser(database.db, undefined);
    expect(a.email).toBeNull();
    expect(b.email).toBeNull();
    expect(a.id).not.toBe(b.id);
  });

  it("raises EMAIL_TAKEN for duplicate canonical email (AC-4)", async () => {
    await provisionUser(database.db, "same@example.com");
    await expect(
      provisionUser(database.db, " Same@Example.com "),
    ).rejects.toMatchObject({
      code: EMAIL_TAKEN,
    } satisfies Partial<DatabaseError>);
  });

  it("inserts a draft with draft_ id and lists newest first (AC-2, AC-8)", async () => {
    const user = await provisionUser(database.db, "drafter@example.com");
    const older = await insertDraft(database.db, {
      userId: user.id,
      platform: "threads",
      body: "older",
    });
    await new Promise((r) => setTimeout(r, 5));
    const newer = await insertDraft(database.db, {
      userId: user.id,
      platform: "linkedin",
      body: "newer",
      mediaUrls: ["https://example.com/a.jpg"],
    });

    expect(older.id).toMatch(/^draft_[A-Za-z0-9_-]{21}$/);
    expect(older.status).toBe("draft");
    expect(newer.status).toBe("draft");

    const listed = await listDraftsByUserId(database.db, user.id);
    expect(listed.map((d) => d.id)).toEqual([newer.id, older.id]);
    expect(listed[0]?.mediaUrls).toEqual(["https://example.com/a.jpg"]);
    expect(listed[0]?.platform).toBe("linkedin");
    expect(listed[0]?.body).toBe("newer");
  });

  it("lists only drafts for the requested owner (AC-8)", async () => {
    const owner = await provisionUser(database.db, "owner@example.com");
    const other = await provisionUser(database.db, "other@example.com");
    await insertDraft(database.db, {
      userId: owner.id,
      platform: "threads",
      body: "mine",
    });
    await insertDraft(database.db, {
      userId: other.id,
      platform: "instagram",
      body: "theirs",
    });

    const listed = await listDraftsByUserId(database.db, owner.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.body).toBe("mine");
  });

  it("rejects an invalid platform via check constraint (AC-2)", async () => {
    const user = await provisionUser(database.db, "platform@example.com");
    await expect(
      database.db.insert(drafts).values({
        id: "draft_badplatform00000001",
        userId: user.id,
        platform: "twitter",
        body: "nope",
      }),
    ).rejects.toThrow();
  });

  it("accepts each allowed draft status string (AC-2)", async () => {
    const user = await provisionUser(database.db, "status@example.com");
    const statuses = [
      "draft",
      "approved",
      "publish_requested",
      "published",
      "failed",
    ] as const;

    for (const [index, status] of statuses.entries()) {
      await database.db.insert(drafts).values({
        id: `draft_statuscheck0000000${index}`,
        userId: user.id,
        platform: "threads",
        body: status,
        status,
      });
    }

    const listed = await listDraftsByUserId(database.db, user.id);
    expect(listed).toHaveLength(5);
    expect(new Set(listed.map((d) => d.status))).toEqual(new Set(statuses));
  });

  it("cascades draft deletes when the user is deleted (AC-7)", async () => {
    const user = await provisionUser(database.db, "cascade@example.com");
    await insertDraft(database.db, {
      userId: user.id,
      platform: "instagram",
      body: "gone soon",
    });

    await deleteUser(database.db, user.id);

    const remainingUsers = await database.db.select().from(users);
    const remainingDrafts = await database.db.select().from(drafts);
    expect(remainingUsers).toHaveLength(0);
    expect(remainingDrafts).toHaveLength(0);
  });

  it("schema exports users, drafts, and sessions tables (AC-6 product only)", async () => {
    const schema = await import("./schema.js");
    expect(
      Object.keys(schema)
        .filter((k) => k === "users" || k === "drafts" || k === "sessions")
        .sort(),
    ).toEqual(["drafts", "sessions", "users"]);
    expect("accounts" in schema).toBe(false);
    expect("tokens" in schema).toBe(false);
    expect("posts" in schema).toBe(false);
    expect("schedules" in schema).toBe(false);
  });
});

describe("requireDatabaseUrl (AC-5)", () => {
  it("fails fast naming DATABASE_URL when unset", () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(() => requireDatabaseUrl()).toThrow(/DATABASE_URL/);
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous;
    }
  });

  it("fails fast naming DATABASE_URL when empty", () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "   ";
    try {
      expect(() => requireDatabaseUrl()).toThrow(/DATABASE_URL/);
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous;
      else delete process.env.DATABASE_URL;
    }
  });
});
