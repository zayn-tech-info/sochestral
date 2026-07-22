import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  createDb,
  provisionUser,
  requireDatabaseUrl,
  users,
  type Database,
} from "@sochestral/database";
import {
  authenticateEmailPassword,
  findUserByEmail,
  findUserByIdOrEmail,
  setPasswordForUser,
} from "./credentials.js";

describe("credentials", () => {
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

  it("findUserByEmail uses trim and lowercase canonical email", async () => {
    await provisionUser(database.db, "Auth.User@Example.com");
    const found = await findUserByEmail(
      database.db,
      "  auth.user@example.com ",
    );
    expect(found?.email).toBe("auth.user@example.com");
  });

  it("findUserByIdOrEmail resolves by id or email", async () => {
    const user = await provisionUser(database.db, "lookup@example.com");
    const byId = await findUserByIdOrEmail(database.db, user.id);
    const byEmail = await findUserByIdOrEmail(
      database.db,
      " Lookup@Example.com ",
    );
    expect(byId?.id).toBe(user.id);
    expect(byEmail?.id).toBe(user.id);
  });

  it("setPasswordForUser stores a hash, never the raw password (AC-2, AC-9)", async () => {
    const user = await provisionUser(database.db, "hash@example.com");
    await setPasswordForUser(database.db, user, "password123");
    const [row] = await database.db
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    expect(row?.passwordHash).toBeTruthy();
    expect(row?.passwordHash?.startsWith("$argon2")).toBe(true);
    expect(row?.passwordHash).not.toContain("password123");
  });

  it("authenticateEmailPassword returns the user on success (AC-3)", async () => {
    const user = await provisionUser(database.db, "ok@example.com");
    await setPasswordForUser(database.db, user, "password123");
    const authed = await authenticateEmailPassword(
      database.db,
      "  OK@example.com ",
      "password123",
    );
    expect(authed?.id).toBe(user.id);
    expect(authed?.email).toBe("ok@example.com");
  });

  it("authenticateEmailPassword returns null for wrong password (AC-4)", async () => {
    const user = await provisionUser(database.db, "badpw@example.com");
    await setPasswordForUser(database.db, user, "password123");
    const authed = await authenticateEmailPassword(
      database.db,
      "badpw@example.com",
      "wrong-password",
    );
    expect(authed).toBeNull();
  });

  it("authenticateEmailPassword returns null for unknown email (AC-4)", async () => {
    const authed = await authenticateEmailPassword(
      database.db,
      "missing@example.com",
      "password123",
    );
    expect(authed).toBeNull();
  });

  it("authenticateEmailPassword returns null when password_hash is null (AC-4)", async () => {
    await provisionUser(database.db, "nopw@example.com");
    const authed = await authenticateEmailPassword(
      database.db,
      "nopw@example.com",
      "password123",
    );
    expect(authed).toBeNull();
  });
});
