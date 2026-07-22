import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertPasswordLength,
  hashPassword,
  hashSessionToken,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from "./password.js";

describe("assertPasswordLength", () => {
  it("throws PASSWORD_TOO_SHORT below the minimum (AC-2)", () => {
    expect(() => assertPasswordLength("short")).toThrow(/at least 8/);
    try {
      assertPasswordLength("1234567");
    } catch (error) {
      expect((error as Error & { code: string }).code).toBe(
        "PASSWORD_TOO_SHORT",
      );
    }
  });

  it("allows passwords at the minimum length", () => {
    expect(() => assertPasswordLength("a".repeat(MIN_PASSWORD_LENGTH))).not.toThrow();
  });
});

describe("hashPassword / verifyPassword", () => {
  it("hashes with Argon2id and verifies the same password", async () => {
    const hashed = await hashPassword("password123");
    expect(hashed.startsWith("$argon2")).toBe(true);
    expect(await verifyPassword("password123", hashed)).toBe(true);
    expect(await verifyPassword("wrong-password", hashed)).toBe(false);
  });

  it("returns false for null hash without throwing (AC-4 timing path)", async () => {
    expect(await verifyPassword("password123", null)).toBe(false);
    expect(await verifyPassword("password123", undefined)).toBe(false);
  });
});

describe("hashSessionToken", () => {
  it("returns a stable SHA-256 hex digest of the raw token", () => {
    const raw = "raw-session-token-value";
    const expected = createHash("sha256").update(raw).digest("hex");
    expect(hashSessionToken(raw)).toBe(expected);
    expect(hashSessionToken(raw)).toHaveLength(64);
  });
});
