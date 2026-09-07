import { describe, expect, it } from "vitest";
import {
  isLengthStopReason,
  joinContinuedReply,
  looksCutOffAssistantText,
  shouldContinueAssistantReply,
} from "./reply-complete.js";

describe("looksCutOffAssistantText", () => {
  it("flags the hanging Day 1 ask from a 14-day plan reply", () => {
    expect(
      looksCutOffAssistantText(
        "Before I schedule anything, I need two things that haven't been set yet:\n\n1. **Start date** — which calendar day should Day",
      ),
    ).toBe(true);
  });

  it("leaves a finished reply alone", () => {
    expect(
      looksCutOffAssistantText(
        "I can take the next two slots after you pick a start day.",
      ),
    ).toBe(false);
  });
});

describe("shouldContinueAssistantReply", () => {
  it("continues when the provider hit the token cap", () => {
    expect(
      shouldContinueAssistantReply({
        content: "Before I schedule anything, I need",
        stopReason: "max_tokens",
        toolCallCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldContinueAssistantReply({
        content: "Before I schedule anything, I need",
        stopReason: "length",
        toolCallCount: 0,
      }),
    ).toBe(true);
  });

  it("does not continue a tool turn or a finished sentence", () => {
    expect(
      shouldContinueAssistantReply({
        content: "Prepared the social set.",
        stopReason: "end_turn",
        toolCallCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldContinueAssistantReply({
        content: "Halfway",
        stopReason: "max_tokens",
        toolCallCount: 1,
      }),
    ).toBe(false);
  });
});

describe("joinContinuedReply", () => {
  it("glues the rest of a cut sentence", () => {
    expect(joinContinuedReply("which calendar day should Day", "1 start?")).toBe(
      "which calendar day should Day 1 start?",
    );
  });
});

describe("isLengthStopReason", () => {
  it("accepts Anthropic and OpenAI length stops", () => {
    expect(isLengthStopReason("max_tokens")).toBe(true);
    expect(isLengthStopReason("length")).toBe(true);
    expect(isLengthStopReason("end_turn")).toBe(false);
  });
});
