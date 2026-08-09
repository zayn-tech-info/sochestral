import { describe, expect, it } from "vitest";
import {
  buildIntentQuestions,
  resolveIntentFromAnswers,
} from "./intent-questions.js";

describe("buildIntentQuestions", () => {
  it("asks for a goal from resolved platforms without message regex", () => {
    const questions = buildIntentQuestions({
      message: "Do the thing",
      platforms: ["threads"],
      hasCurrentMedia: true,
    });
    expect(questions[0]?.id).toBe("goal");
    expect(questions[0]?.prompt).toContain("Threads");
    expect(questions.some((question) => question.id === "media")).toBe(true);
    expect(questions[0]?.options.map((option) => option.id)).toContain(
      "schedule_post",
    );
    expect(questions[0]?.options.at(-1)).toMatchObject({
      id: "custom",
      custom: true,
    });
    expect(questions[0]?.options.length).toBeLessThanOrEqual(5);
  });

  it("asks for a platform when none are resolved yet", () => {
    const questions = buildIntentQuestions({
      message: "Ship it",
      platforms: [],
      hasCurrentMedia: false,
    });
    expect(questions.some((question) => question.id === "platform")).toBe(true);
  });
});

describe("resolveIntentFromAnswers", () => {
  it("maps option ids without relying on message text", () => {
    expect(
      resolveIntentFromAnswers([
        { questionId: "goal", optionId: "suggest_only" },
      ]).kind,
    ).toBe("suggest");
    expect(
      resolveIntentFromAnswers([
        { questionId: "goal", optionId: "schedule_post" },
      ]).kind,
    ).toBe("schedule");
    expect(
      resolveIntentFromAnswers([
        { questionId: "goal", optionId: "publish_now" },
        { questionId: "media", optionId: "this_message" },
      ]),
    ).toMatchObject({
      kind: "live",
      useCurrentMedia: true,
    });
  });

  it("maps custom text that mentions publish to live", () => {
    expect(
      resolveIntentFromAnswers([
        {
          questionId: "goal",
          optionId: "custom",
          customText: "Publish live to Threads",
        },
      ]).kind,
    ).toBe("live");
  });

  it("maps custom text that mentions schedule to schedule", () => {
    expect(
      resolveIntentFromAnswers([
        {
          questionId: "goal",
          optionId: "custom",
          customText: "Schedule for Friday morning",
        },
      ]).kind,
    ).toBe("schedule");
  });
});
