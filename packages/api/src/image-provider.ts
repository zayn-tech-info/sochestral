import sharp from "sharp";
import type { ImageJobKind } from "@sochestral/database";

export class ImageProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ImageProviderError";
  }
}

export type GenerateImageInput = {
  kind: Exclude<ImageJobKind, "reframe">;
  prompt: string;
  model: string;
  width: number;
  height: number;
  /** Source image bytes for vary / prompt_edit */
  sourceBytes?: Uint8Array;
  /** Extra reference images (brand / refs) */
  referenceBytes?: Uint8Array[];
};

export interface ImageProvider {
  generate(input: GenerateImageInput): Promise<Uint8Array>;
}

function openaiSize(width: number, height: number): string {
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.05) return "1024x1024";
  if (ratio < 1) return "1024x1536";
  return "1536x1024";
}

async function fitToTarget(
  bytes: Uint8Array,
  width: number,
  height: number,
  fit: "cover" | "inside" = "cover",
): Promise<Uint8Array> {
  const out = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(width, height, { fit, position: "centre" })
    .png()
    .toBuffer();
  return new Uint8Array(out);
}

/** Scale a provider image into the preset box without cropping. */
export async function fitGeneratedImage(
  bytes: Uint8Array,
  width: number,
  height: number,
): Promise<Uint8Array> {
  return fitToTarget(bytes, width, height, "inside");
}

export class OpenAIImageProvider implements ImageProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generate(input: GenerateImageInput): Promise<Uint8Array> {
    const size = openaiSize(input.width, input.height);
    if (input.kind === "generate" && !input.sourceBytes) {
      const raw = await this.generations(input.prompt, input.model, size);
      return fitGeneratedImage(raw, input.width, input.height);
    }
    if (!input.sourceBytes) {
      throw new ImageProviderError("SOURCE_REQUIRED", "source image required");
    }
    const prompt =
      input.kind === "vary"
        ? input.prompt.trim() || "Create a close variation of this image."
        : input.prompt.trim();
    if (!prompt) {
      throw new ImageProviderError("INVALID", "prompt required");
    }
    const raw = await this.edits(prompt, input.model, size, input.sourceBytes);
    return fitGeneratedImage(raw, input.width, input.height);
  }

  private async generations(
    prompt: string,
    model: string,
    size: string,
  ): Promise<Uint8Array> {
    const response = await this.fetchImpl("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        size,
        n: 1,
      }),
    });
    return this.readImageResponse(response);
  }

  private async edits(
    prompt: string,
    model: string,
    size: string,
    sourceBytes: Uint8Array,
  ): Promise<Uint8Array> {
    const form = new FormData();
    form.set("model", model);
    form.set("prompt", prompt);
    form.set("size", size);
    form.set("n", "1");
    const png = await sharp(sourceBytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .png()
      .toBuffer();
    form.set(
      "image",
      new File([png], "source.png", { type: "image/png" }),
    );
    const response = await this.fetchImpl("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: form,
    });
    return this.readImageResponse(response);
  }

  private async readImageResponse(response: Response): Promise<Uint8Array> {
    const body = (await response.json().catch(() => null)) as {
      data?: Array<{ b64_json?: string; url?: string }>;
      error?: { message?: string; code?: string };
    } | null;
    if (!response.ok) {
      const message =
        body?.error?.message?.slice(0, 200) || "image provider refused";
      throw new ImageProviderError(
        response.status === 400 ? "PROVIDER_REFUSED" : "PROVIDER_ERROR",
        message,
      );
    }
    const first = body?.data?.[0];
    if (first?.b64_json) {
      return Uint8Array.from(Buffer.from(first.b64_json, "base64"));
    }
    if (first?.url) {
      const image = await this.fetchImpl(first.url);
      if (!image.ok) {
        throw new ImageProviderError("PROVIDER_ERROR", "failed to download image");
      }
      return new Uint8Array(await image.arrayBuffer());
    }
    throw new ImageProviderError("PROVIDER_ERROR", "empty image response");
  }
}

export async function reframeLocal(
  sourceBytes: Uint8Array,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const meta = await sharp(sourceBytes, { limitInputPixels: 40_000_000 }).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (srcW < width || srcH < height) {
    throw new ImageProviderError(
      "REFRAME_SOURCE_TOO_SMALL",
      "source image is too small for this preset",
    );
  }
  return fitToTarget(sourceBytes, width, height);
}
