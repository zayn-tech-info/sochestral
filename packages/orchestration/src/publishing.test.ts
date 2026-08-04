import { describe, expect, it } from "vitest";
import { hasExplicitLivePublishIntent } from "./publishing.js";

describe("publishing intent resolver", () => {
  it.each([
    "Publish this now",
    "Post it",
    "Share that now",
    "Send this live",
    "Go live with it",
  ])("accepts an explicit live command: %s", (message) => {
    expect(hasExplicitLivePublishIntent(message)).toBe(true);
  });

  it.each([
    "Draft this post",
    "Write a caption and preview it",
    "Validate this before publishing",
    "Do not publish this",
    "Don't post it yet",
    "Can you publish this?",
    "Yeah",
    "Make this better",
  ])("rejects draft, negated, interrogative, or ambiguous wording: %s", (message) => {
    expect(hasExplicitLivePublishIntent(message)).toBe(false);
  });
});
