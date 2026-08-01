import { describe, expect, it } from "vitest";
import {
  isTransientError,
  OrchestrationError,
  stableErrorCode,
} from "./errors.js";

describe("orchestration errors", () => {
  it("returns stable application error codes (AC-7, AC-9)", () => {
    expect(
      stableErrorCode(new OrchestrationError("MODEL_UNAVAILABLE", 503)),
    ).toBe("MODEL_UNAVAILABLE");
    expect(stableErrorCode({ code: "REMOTE_CODE" })).toBe("REMOTE_CODE");
    expect(stableErrorCode(new Error("private stack text"))).toBe(
      "INTERNAL_ERROR",
    );
  });

  it.each([429, 500, 503])(
    "treats HTTP status %s as transient (AC-7)",
    (status) => {
      expect(isTransientError({ status })).toBe(true);
    },
  );

  it.each([
    "request timeout",
    "fetch failed",
    "network unavailable",
    "ECONNRESET",
    "ECONNREFUSED",
  ])("treats %s as transient (AC-7)", (message) => {
    expect(isTransientError(new Error(message))).toBe(true);
  });

  it("does not retry deterministic failures (AC-7)", () => {
    expect(isTransientError({ status: 401 })).toBe(false);
    expect(isTransientError({ status: 422 })).toBe(false);
    expect(isTransientError("timeout")).toBe(false);
  });
});
