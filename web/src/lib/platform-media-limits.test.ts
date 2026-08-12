import { describe, expect, it } from "vitest";

import {
  mediaCountOk,
  platformImageLimits,
} from "@/lib/platform-media-limits";

describe("platformImageLimits", () => {
  it("requires Instagram media and caps carousels at 10", () => {
    expect(platformImageLimits("instagram")).toEqual({ min: 1, max: 10 });
    expect(mediaCountOk("instagram", 0)).toBe(false);
    expect(mediaCountOk("instagram", 1)).toBe(true);
    expect(mediaCountOk("instagram", 10)).toBe(true);
    expect(mediaCountOk("instagram", 11)).toBe(false);
  });

  it("allows text-only Threads and LinkedIn up to 20 images", () => {
    expect(platformImageLimits("threads")).toEqual({ min: 0, max: 20 });
    expect(platformImageLimits("linkedin_personal")).toEqual({
      min: 0,
      max: 20,
    });
    expect(mediaCountOk("threads", 0)).toBe(true);
    expect(mediaCountOk("linkedin_personal", 20)).toBe(true);
    expect(mediaCountOk("threads", 21)).toBe(false);
  });
});
