import { createHash } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

const MIN_PASSWORD_LENGTH = 8;

/** Precomputed Argon2id hash of a fixed string for timing safe missing user paths. */
let dummyHashPromise: Promise<string> | undefined;

async function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hash("sochestral-dummy-password-not-a-real-user");
  }
  return dummyHashPromise;
}

export function assertPasswordLength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    const error = new Error("Password must be at least 8 characters");
    (error as Error & { code: string }).code = "PASSWORD_TOO_SHORT";
    throw error;
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordLength(password);
  return hash(password);
}

/**
 * Verifies password against hash, or against a dummy hash when hash is null,
 * so missing users do not short circuit timing.
 */
export async function verifyPassword(
  password: string,
  passwordHash: string | null | undefined,
): Promise<boolean> {
  const target = passwordHash ?? (await getDummyHash());
  try {
    return await verify(target, password);
  } catch {
    return false;
  }
}

export function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export { MIN_PASSWORD_LENGTH };
