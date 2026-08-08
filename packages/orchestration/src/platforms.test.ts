import { describe, expect, it } from "vitest";
import {
  PLATFORM_CLARIFICATION,
  extractPlatforms,
  platformsFromRecentMessages,
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

  it("accepts common Instagram typos", () => {
    expect(extractPlatforms("Post this on instgram")).toEqual(["instagram"]);
    expect(extractPlatforms("Yes post it live on Instagarm")).toEqual([
      "instagram",
    ]);
  });

  it("inherits platforms when a follow-up action omits the platform name", () => {
    expect(
      resolvePlatforms("Post it live", {
        inheritedPlatforms: ["instagram"],
      }),
    ).toEqual({
      kind: "resolved",
      platforms: ["instagram"],
    });
  });

  it("inherits platforms for bare Publish follow-ups", () => {
    expect(
      resolvePlatforms("Publish", {
        inheritedPlatforms: ["instagram"],
      }),
    ).toEqual({
      kind: "resolved",
      platforms: ["instagram"],
    });
  });

  it("inherits platforms for use this media follow-ups", () => {
    expect(
      resolvePlatforms("use this", {
        inheritedPlatforms: ["instagram"],
      }),
    ).toEqual({
      kind: "resolved",
      platforms: ["instagram"],
    });
  });

  it("still clarifies unsupported platforms even when inherited platforms exist", () => {
    expect(
      resolvePlatforms("Share this on Facebook", {
        inheritedPlatforms: ["instagram"],
      }),
    ).toEqual({
      kind: "clarify",
      message: PLATFORM_CLARIFICATION,
    });
  });
});

describe("platformsFromRecentMessages", () => {
  it("prefers the newest message that names a platform", () => {
    expect(
      platformsFromRecentMessages([
        "Post this on Threads",
        "Actually put it on Instagram",
        "Post it live",
      ]),
    ).toEqual(["instagram"]);
  });

  it("recovers Instagram from typo replies after an older Threads mention", () => {
    expect(
      platformsFromRecentMessages([
        "Post this on Threads",
        "Yes post it live on Instagarm",
        "instgram",
      ]),
    ).toEqual(["instagram"]);
  });
});
