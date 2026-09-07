import { describe, expect, it } from "vitest";
import { parseVariantCount } from "./image-config.js";

describe("parseVariantCount", () => {
  it("keeps edits at one image", () => {
    expect(parseVariantCount("vary", 3)).toBe(1);
    expect(parseVariantCount("prompt_edit", 2)).toBe(1);
    expect(parseVariantCount("reframe", 3)).toBe(1);
  });

  it("allows generate jobs to request 1 to 3 images", () => {
    expect(parseVariantCount("generate", undefined)).toBe(1);
    expect(parseVariantCount("generate", 2)).toBe(2);
    expect(parseVariantCount("generate", 3)).toBe(3);
  });

  it("rejects a generate count outside 1 to 3", () => {
    expect(() => parseVariantCount("generate", 0)).toThrow();
    expect(() => parseVariantCount("generate", 4)).toThrow();
  });
});
