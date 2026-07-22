import { and, eq, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Database } from "@sochestral/database";
import { sessions, users, type Session, type User } from "@sochestral/database";
import { hashSessionToken } from "./password.js";

const SESSION_DAYS = 7;
export const SESSION_COOKIE_NAME = "sochestral_session";

export type CreatedSession = {
  session: Session;
  rawToken: string;
};

export function createSessionId(): string {
  return `sess_${nanoid(21)}`;
}

export function createRawSessionToken(): string {
  return nanoid(32);
}

export async function createSession(
  db: Database["db"],
  userId: string,
): Promise<CreatedSession> {
  const rawToken = createRawSessionToken();
  const id = createSessionId();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const [session] = await db
    .insert(sessions)
    .values({
      id,
      userId,
      tokenHash: hashSessionToken(rawToken),
      expiresAt,
    })
    .returning();

  if (!session) {
    throw new Error("createSession returned no row");
  }

  return { session, rawToken };
}

export type SessionUser = {
  session: Session;
  user: User;
};

export async function validateSessionToken(
  db: Database["db"],
  rawToken: string | undefined | null,
): Promise<SessionUser | null> {
  if (!rawToken || rawToken.trim() === "") return null;

  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();

  const rows = await db
    .select({
      session: sessions,
      user: users,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { session: row.session, user: row.user };
}

export async function deleteSessionByToken(
  db: Database["db"],
  rawToken: string | undefined | null,
): Promise<boolean> {
  if (!rawToken || rawToken.trim() === "") return false;
  const tokenHash = hashSessionToken(rawToken);
  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .returning({ id: sessions.id });
  return deleted.length > 0;
}
