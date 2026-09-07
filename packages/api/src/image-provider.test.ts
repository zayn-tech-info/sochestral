import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { fitGeneratedImage } from "./image-provider.js";

describe("fitGeneratedImage", () => {
  it("scales a taller provider image into the preset without cropping", async () => {
    const source = await sharp({
      create: {
        width: 20,
        height: 40,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const out = await fitGeneratedImage(new Uint8Array(source), 40, 50);
    const meta = await sharp(out).metadata();

    expect(meta.width).toBe(25);
    expect(meta.height).toBe(50);
  });
});
