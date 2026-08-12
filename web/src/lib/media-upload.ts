import { ApiError, apiRequest } from "@/lib/product-api";

export function normalizeUploadMimeType(raw: string, fileName = ""): string | null {
  const value = raw.trim().toLowerCase();
  if (value === "image/jpg" || value === "image/jpeg") return "image/jpeg";
  if (value === "image/png") return "image/png";
  if (value === "image/webp") return "image/webp";
  const name = fileName.trim().toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return null;
}

export function isUploadableImageFile(file: File): boolean {
  return normalizeUploadMimeType(file.type, file.name) !== null;
}

/** Matches orchestration `isSafeMediaUrl` (incl. local product media view proxy). */
export function isPersistableMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    if (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      /\/media\/assets\/[^/]+\/view$/.test(url.pathname)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export type UploadedMediaItem = {
  assetId: string;
  externalUrl: string;
  previewUrl: string;
};

export type ScheduleUploadReference = {
  assetId: string | null;
  externalUrl: string;
};

export function collectUnusedScheduleUploadAssetIds(
  removed: ScheduleUploadReference[],
  current: ScheduleUploadReference[],
  protectedUrls: string[] = [],
): string[] {
  const currentAssetIds = new Set(
    current.flatMap((item) => (item.assetId ? [item.assetId] : [])),
  );
  const protectedUrlSet = new Set(protectedUrls);
  return Array.from(
    new Set(
      removed.flatMap((item) =>
        item.assetId &&
        !currentAssetIds.has(item.assetId) &&
        !protectedUrlSet.has(item.externalUrl)
          ? [item.assetId]
          : [],
      ),
    ),
  );
}

export function deleteScheduleUpload(assetId: string): Promise<void> {
  return apiRequest<void>(`/media/uploads/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
    headers: { "X-Sochestral-Request": "publishing-action" },
  });
}

export async function cleanupScheduleUploads(
  assetIds: Iterable<string>,
): Promise<void> {
  const unique = Array.from(new Set(assetIds));
  await Promise.all(
    unique.map(async (assetId) => {
      await deleteScheduleUpload(assetId).catch(() => undefined);
    }),
  );
}

/**
 * Ticket → PUT → complete, returning durable view URLs for schedule media.
 * Matches the publishing-action contract used by chat / live preview.
 */
export async function uploadImagesForSchedule(
  files: File[],
): Promise<UploadedMediaItem[]> {
  if (files.length === 0) return [];

  const prepared = files.map((file) => {
    const mimeType = normalizeUploadMimeType(file.type, file.name);
    if (!mimeType) {
      throw new ApiError(415, "UNSUPPORTED_MEDIA", {});
    }
    return { file, mimeType };
  });

  const tickets = await apiRequest<{
    uploads: Array<{ assetId: string; uploadUrl: string }>;
  }>("/media/uploads", {
    method: "POST",
    headers: { "X-Sochestral-Request": "publishing-action" },
    body: JSON.stringify({
      files: prepared.map(({ file, mimeType }) => ({
        name: file.name || "image.jpg",
        mimeType,
        byteSize: file.size,
      })),
    }),
  });

  const added: UploadedMediaItem[] = [];
  for (const [index, entry] of prepared.entries()) {
    const ticket = tickets.uploads[index];
    if (!ticket) {
      throw new ApiError(502, "MEDIA_UPLOAD_FAILED", {});
    }
    const uploaded = await fetch(ticket.uploadUrl, {
      method: "PUT",
      body: entry.file,
      headers: { "Content-Type": entry.mimeType },
    });
    if (!uploaded.ok) {
      throw new ApiError(502, "MEDIA_UPLOAD_FAILED", {});
    }
    const completed = await apiRequest<{
      previewUrl: string;
      viewUrl?: string;
    }>(`/media/uploads/${ticket.assetId}/complete`, {
      method: "POST",
      headers: { "X-Sochestral-Request": "publishing-action" },
      body: "{}",
    });
    const durable = completed.viewUrl?.trim() || null;
    if (!durable || !isPersistableMediaUrl(durable)) {
      throw new ApiError(502, "MEDIA_UPLOAD_FAILED", {});
    }
    added.push({
      assetId: ticket.assetId,
      externalUrl: durable,
      previewUrl: URL.createObjectURL(entry.file),
    });
  }
  return added;
}
