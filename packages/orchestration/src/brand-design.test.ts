import { describe, expect, it } from "vitest";
import { prependBrandBrief } from "./brand-design.js";

describe("prependBrandBrief", () => {
  it("prefixes the user prompt with the stored brief", () => {
    expect(prependBrandBrief("Make a flyer", "Navy blocks, mark top left.")).toBe(
      "Brand design system (must follow):\nNavy blocks, mark top left.\n\nUser request:\nMake a flyer",
    );
  });

  it("returns the brief alone when the user prompt is empty", () => {
    expect(prependBrandBrief("  ", "Keep the logo small.")).toBe(
      "Brand design system (must follow):\nKeep the logo small.",
    );
  });
});
