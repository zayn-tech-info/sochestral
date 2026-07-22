import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  createDb,
  provisionUser,
  requireDatabaseUrl,
  sessions,
  type Database,
} from "@sochestral/database";
import { hashSessionToken } from "./password.js";
import {
  createRawSessionToken,
  createSession,
  createSessionId,
  deleteSessionByToken,
  validateSessionToken,
} from "./sessions.js";

describe("session helpers", () => {
  it("createSessionId uses sess_ prefix and createRawSessionToken is opaque", () => {
    expect(createSessionId()).toMatch(/^sess_[A-Za-z0-9_-]{21}$/);
    expect(createRawSessionToken()).toHaveLength(32);
  });
});

describe("session persistence", () => {
  let database: Database;

  beforeAll(() => {
    requireDatabaseUrl();
    database = createDb();
  });

  afterAll(async () => {
    await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.db.execute(sql`delete from sessions`);
    await database.db.execute(sql`delete from drafts`);
    await database.db.execute(sql`delete from users`);
  });

  it("createSession stores SHA-256 of the raw token, not the raw value", async () => {
    const user = await provisionUser(database.db, "sess@example.com");
    const { session, rawToken } = await createSession(database.db, user.id);
    expect(session.id).toMatch(/^sess_/);
    expect(session.tokenHash).toBe(hashSessionToken(rawToken));
    expect(session.tokenHash).not.toBe(rawToken);

    const [row] = await database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, session.id))
      .limit(1);
    expect(row?.tokenHash).toBe(hashSessionToken(rawToken));
  });

  it("validateSessionToken returns user for a live token (AC-5)", async () => {
    const user = await provisionUser(database.db, "valid@example.com");
    const { rawToken } = await createSession(database.db, user.id);
    const result = await validateSessionToken(database.db, rawToken);
    expect(result?.user.id).toBe(user.id);
    expect(result?.session.userId).toBe(user.id);
  });

  it("validateSessionToken returns null for missing, blank, or unknown token (AC-5)", async () => {
    expect(await validateSessionToken(database.db, null)).toBeNull();
    expect(await validateSessionToken(database.db, "")).toBeNull();
    expect(await validateSessionToken(database.db, "no-such-token")).toBeNull();
  });

  it("deleteSessionByToken removes the row so validation fails (AC-6)", async () => {
    const user = await provisionUser(database.db, "logout@example.com");
    const { rawToken } = await createSession(database.db, user.id);
    expect(await deleteSessionByToken(database.db, rawToken)).toBe(true);
    expect(await validateSessionToken(database.db, rawToken)).toBeNull();
    expect(await deleteSessionByToken(database.db, rawToken)).toBe(false);
  });
});
