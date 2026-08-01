import { describe, expect, it } from "vitest";
import {
  PLATFORM_CLARIFICATION,
  resolvePlatforms,
} from "./platforms.js";

describe("resolvePlatforms", () => {
  it("resolves each supported platform and removes duplicates (AC-2)", () => {
    expect(
      resolvePlatforms("Post this on Threads, LinkedIn Personal, Instagram and Threads"),
    ).toEqual({
      kind: "resolved",
      platforms: ["threads", "linkedin_personal", "instagram"],
    });
  });

  it("accepts ordinary conversation without a social action", () => {
    expect(resolvePlatforms("Help me improve this sentence")).toEqual({
      kind: "resolved",
      platforms: [],
    });
  });

  it.each([
    "Post this everywhere",
    "Publish this update",
    "Share this on Facebook",
    "Schedule this on all accounts",
  ])("asks for a supported explicit platform for %s (AC-2)", (message) => {
    expect(resolvePlatforms(message)).toEqual({
      kind: "clarify",
      message: PLATFORM_CLARIFICATION,
    });
  });

  it("recognizes common Instagram and LinkedIn spelling", () => {
    expect(resolvePlatforms("Preview this on Insta and Linked In")).toEqual({
      kind: "resolved",
      platforms: ["linkedin_personal", "instagram"],
    });
  });
});
