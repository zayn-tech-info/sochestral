import { eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { DatabaseError, EMAIL_TAKEN, isUniqueViolation } from "./errors.js";
import { createUserId } from "./ids.js";
import { users, type User } from "./schema.js";

export type ProvisionedUser = {
  id: string;
  email: string | null;
  createdAt: Date;
};

export function canonicalizeEmail(
  email: string | undefined | null,
): string | null {
  if (email === undefined || email === null) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}

export async function provisionUser(
  db: Database["db"],
  email?: string | null,
): Promise<ProvisionedUser> {
  const canonical = canonicalizeEmail(email);
  const id = createUserId();

  try {
    const [row] = await db
      .insert(users)
      .values({
        id,
        email: canonical,
      })
      .returning({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
      });

    if (!row) {
      throw new Error("provisionUser insert returned no row");
    }

    return {
      id: row.id,
      email: row.email,
      createdAt: row.createdAt,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DatabaseError(
        EMAIL_TAKEN,
        "A user with this email already exists",
      );
    }
    throw error;
  }
}

export async function deleteUser(
  db: Database["db"],
  userId: string,
): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

export type { User };
