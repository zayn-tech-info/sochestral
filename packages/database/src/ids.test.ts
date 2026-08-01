import { describe, expect, it } from "vitest";
import {
  createConversationId,
  createDraftId,
  createMessageId,
  createRunId,
  createToolCallId,
  createUserId,
} from "./ids.js";

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

  it.each([
    [createConversationId, "conv_"],
    [createMessageId, "msg_"],
    [createRunId, "run_"],
    [createToolCallId, "toolcall_"],
  ])("creates orchestration ids with the %s prefix (AC-6)", (create, prefix) => {
    const id = create();
    expect(id).toMatch(new RegExp(`^${prefix}[A-Za-z0-9_-]{21}$`));
    expect(id).toHaveLength(prefix.length + 21);
  });
});
