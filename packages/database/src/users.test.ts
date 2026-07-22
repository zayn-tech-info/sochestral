import { describe, expect, it } from "vitest";
import { canonicalizeEmail } from "./users.js";

describe("canonicalizeEmail", () => {
  it("trims and lowercases email (AC-4)", () => {
    expect(canonicalizeEmail("  Alice@Example.COM ")).toBe("alice@example.com");
  });

  it("returns null for blank, undefined, or null (AC-3)", () => {
    expect(canonicalizeEmail("   ")).toBeNull();
    expect(canonicalizeEmail("")).toBeNull();
    expect(canonicalizeEmail(undefined)).toBeNull();
    expect(canonicalizeEmail(null)).toBeNull();
  });
});
