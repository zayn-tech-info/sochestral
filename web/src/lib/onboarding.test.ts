import { describe, expect, it } from "vitest";

import {
  countWords,
  MIN_DESCRIPTION_WORDS,
  nextStep,
  prevStep,
  stepIndex,
} from "./onboarding";

describe("onboarding helpers", () => {
  it("counts words for the description minimum", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("  one two  three ")).toBe(3);
    expect(MIN_DESCRIPTION_WORDS).toBe(30);
  });

  it("walks wizard steps in order", () => {
    expect(stepIndex(null)).toBe(0);
    expect(stepIndex("skills")).toBe(2);
    expect(nextStep("business_details")).toBe("who_you_are");
    expect(nextStep("attribution")).toBe("done");
    expect(prevStep("platforms")).toBe("skills");
    expect(prevStep("business_details")).toBeNull();
  });
});
