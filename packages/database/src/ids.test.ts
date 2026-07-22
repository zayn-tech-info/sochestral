import { describe, expect, it } from "vitest";
import { createDraftId, createUserId } from "./ids.js";

describe("ids", () => {
  it("createUserId returns opaque user_ prefix suitable as JWT sub (AC-1)", () => {
    const id = createUserId();
    expect(id).toMatch(/^user_[A-Za-z0-9_-]{21}$/);
    expect(id).toHaveLength("user_".length + 21);
  });

  it("createDraftId returns opaque draft_ prefix (AC-8)", () => {
    const id = createDraftId();
    expect(id).toMatch(/^draft_[A-Za-z0-9_-]{21}$/);
    expect(id).toHaveLength("draft_".length + 21);
  });

  it("generates unique ids across calls", () => {
    const users = new Set(Array.from({ length: 20 }, () => createUserId()));
    const drafts = new Set(Array.from({ length: 20 }, () => createDraftId()));
    expect(users.size).toBe(20);
    expect(drafts.size).toBe(20);
  });
});
