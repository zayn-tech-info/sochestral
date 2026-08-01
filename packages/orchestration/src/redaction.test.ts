import { describe, expect, it } from "vitest";
import { redactRecord, redactText, redactValue } from "./redaction.js";

describe("redaction", () => {
  it("removes Bearer tokens, JWTs, and provider keys from text (AC-6, AC-9)", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEyMzQ1Njc4In0.signature12345";
    const result = redactText(
      `Bearer top.secret-token ${jwt} gsk_abcdefghijklmnop`,
    );

    expect(result).toBe(
      "Bearer [REDACTED] [REDACTED_JWT] [REDACTED_KEY]",
    );
    expect(result).not.toContain("top.secret-token");
  });

  it("redacts secret fields at every nesting level (AC-6, AC-9)", () => {
    expect(
      redactValue({
        authorization: "Bearer private",
        profile: {
          access_token: "token-value",
          password: "password-value",
          username: "public-name",
        },
        rows: [{ apiKey: "gsk_abcdefghijklmnop", ok: true }],
      }),
    ).toEqual({
      authorization: "[REDACTED]",
      profile: {
        access_token: "[REDACTED]",
        password: "[REDACTED]",
        username: "public-name",
      },
      rows: [{ apiKey: "[REDACTED]", ok: true }],
    });
  });

  it("preserves safe primitive values", () => {
    expect(redactValue([true, 3, null, "ordinary text"])).toEqual([
      true,
      3,
      null,
      "ordinary text",
    ]);
  });

  it("wraps non object records in a value field", () => {
    expect(redactRecord("safe")).toEqual({ value: "safe" });
    expect(redactRecord(["safe"])).toEqual({ value: ["safe"] });
  });
});
