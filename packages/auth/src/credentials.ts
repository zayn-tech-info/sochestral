import { eq } from "drizzle-orm";
import type { Database } from "@sochestral/database";
import {
  canonicalizeEmail,
  users,
  type User,
} from "@sochestral/database";
import { hashPassword, verifyPassword } from "./password.js";

export const INVALID_CREDENTIALS = "INVALID_CREDENTIALS" as const;

export async function findUserByEmail(
  db: Database["db"],
  email: string,
): Promise<User | undefined> {
  const canonical = canonicalizeEmail(email);
  if (!canonical) return undefined;
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, canonical))
    .limit(1);
  return row;
}

export async function findUserByIdOrEmail(
  db: Database["db"],
  idOrEmail: string,
): Promise<User | undefined> {
  const [byId] = await db
    .select()
    .from(users)
    .where(eq(users.id, idOrEmail))
    .limit(1);
  if (byId) return byId;
  return findUserByEmail(db, idOrEmail);
}

export async function setPasswordForUser(
  db: Database["db"],
  user: User,
  password: string,
): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, user.id));
}

/**
 * Returns the user on success, or null on any credential failure.
 * Always runs verifyPassword (dummy hash when needed).
 */
export async function authenticateEmailPassword(
  db: Database["db"],
  email: string,
  password: string,
): Promise<User | null> {
  const user = await findUserByEmail(db, email);
  const ok = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !user.passwordHash || !ok) {
    return null;
  }
  return user;
}
