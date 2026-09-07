import { describe, expect, it } from "vitest";
import {
  brandIntentFromAnswers,
  buildBrandClarifyQuestions,
} from "./intent-questions.js";

describe("brand clarify questions", () => {
  it("asks a product owned brand use question", () => {
    const questions = buildBrandClarifyQuestions();
    expect(questions).toHaveLength(1);
    expect(questions[0]?.id).toBe("brand_use");
    expect(questions[0]?.options.some((option) => option.id === "use_brand")).toBe(
      true,
    );
    expect(questions[0]?.options.some((option) => option.id === "skip_brand")).toBe(
      true,
    );
  });

  it("resolves brand answers without inventing use", () => {
    expect(
      brandIntentFromAnswers([
        { questionId: "brand_use", optionId: "use_brand" },
      ]),
    ).toBe("use");
    expect(
      brandIntentFromAnswers([
        { questionId: "brand_use", optionId: "skip_brand" },
      ]),
    ).toBe("skip");
    expect(brandIntentFromAnswers([])).toBeNull();
  });
});
