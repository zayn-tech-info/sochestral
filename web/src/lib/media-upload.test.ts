import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cleanupScheduleUploads,
  collectUnusedScheduleUploadAssetIds,
  isPersistableMediaUrl,
  isUploadableImageFile,
  normalizeUploadMimeType,
} from "@/lib/media-upload";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("media-upload helpers", () => {
  it("normalizes jpeg aliases and falls back to file extension", () => {
    expect(normalizeUploadMimeType("image/jpg")).toBe("image/jpeg");
    expect(normalizeUploadMimeType("image/jpeg")).toBe("image/jpeg");
    expect(normalizeUploadMimeType("", "shot.PNG")).toBe("image/png");
    expect(normalizeUploadMimeType("image/heic")).toBeNull();
  });

  it("accepts only jpeg/png/webp files", () => {
    expect(
      isUploadableImageFile(
        new File([""], "a.jpg", { type: "image/jpeg" }),
      ),
    ).toBe(true);
    expect(
      isUploadableImageFile(
        new File([""], "a.heic", { type: "image/heic" }),
      ),
    ).toBe(false);
  });

  it("allows durable https and local media view urls", () => {
    expect(
      isPersistableMediaUrl(
        "https://api.example/media/assets/media_1/view?u=u&exp=1&sig=x",
      ),
    ).toBe(true);
    expect(
      isPersistableMediaUrl(
        "http://localhost:8787/media/assets/media_1/view?u=u&exp=1&sig=x",
      ),
    ).toBe(true);
    expect(isPersistableMediaUrl("http://evil.example/x.jpg")).toBe(false);
  });

  it("collects only uploads no longer used by the modal", () => {
    expect(
      collectUnusedScheduleUploadAssetIds(
        [
          { assetId: "media_1", externalUrl: "https://api.example/a" },
          { assetId: "media_2", externalUrl: "https://api.example/b" },
          { assetId: null, externalUrl: "https://cdn.example/existing.jpg" },
        ],
        [{ assetId: "media_2", externalUrl: "https://api.example/b" }],
        ["https://api.example/a"],
      ),
    ).toEqual([]);
    expect(
      collectUnusedScheduleUploadAssetIds(
        [{ assetId: "media_1", externalUrl: "https://api.example/a" }],
        [],
      ),
    ).toEqual(["media_1"]);
  });

  it("deletes abandoned schedule uploads with the publishing header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await cleanupScheduleUploads(["media_1", "media_1"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/media/uploads/media_1",
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
        headers: { "X-Sochestral-Request": "publishing-action" },
      }),
    );
  });
});
