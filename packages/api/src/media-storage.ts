import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";
import {
  createPendingMediaAssets,
  deleteExpiredPendingMediaAsset,
  deleteOwnedUnattachedMediaAsset,
  getOwnedMediaAsset,
  listExpiredPendingMediaAssets,
  listOwnedConversationMediaAssets,
  markMediaAssetReady,
  PublishingDatabaseError,
  type Database,
  type MediaAsset,
} from "@sochestral/database";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;

export class MediaError extends Error {
  constructor(
    readonly code:
      | "INVALID_MEDIA"
      | "MEDIA_TOO_LARGE"
      | "UNSUPPORTED_MEDIA"
      | "MEDIA_NOT_FOUND"
      | "MEDIA_NOT_READY"
      | "MEDIA_QUOTA_EXCEEDED"
      | "STORAGE_UNAVAILABLE",
    readonly status: 404 | 409 | 413 | 415 | 422 | 429 | 502,
  ) {
    super(code);
    this.name = "MediaError";
  }
}

export type UploadDescriptor = {
  name: string;
  mimeType: string;
  byteSize: number;
};

export type PublicMediaAsset = {
  id: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  previewUrl: string;
};

export type ModelMediaAsset = {
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  data: string;
};

type R2Config = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

function loadR2Config(): R2Config {
  const config = {
    endpoint: process.env.R2_ENDPOINT?.trim() ?? "",
    region: process.env.R2_REGION?.trim() || "auto",
    accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim() ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "",
    bucket: process.env.R2_BUCKET?.trim() ?? "",
  };
  if (!config.endpoint || !config.accessKeyId || !config.secretAccessKey || !config.bucket) {
    throw new MediaError("STORAGE_UNAVAILABLE", 502);
  }
  return config;
}

export interface MediaObjectStore {
  signedPut(key: string, mimeType: string, byteSize: number, ttlSeconds: number): Promise<string>;
  signedGet(key: string, ttlSeconds: number): Promise<string>;
  get(key: string): Promise<Uint8Array>;
  put(key: string, body: Uint8Array, mimeType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class R2MediaObjectStore implements MediaObjectStore {
  private readonly client: S3Client;
  constructor(private readonly config: R2Config = loadR2Config()) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  signedPut(key: string, mimeType: string, byteSize: number, ttlSeconds: number) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ContentType: mimeType,
        ContentLength: byteSize,
      }),
      { expiresIn: ttlSeconds },
    );
  }

  signedGet(key: string, ttlSeconds: number) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }

  async get(key: string): Promise<Uint8Array> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    if (!result.Body) throw new MediaError("MEDIA_NOT_READY", 409);
    return result.Body.transformToByteArray();
  }

  async put(key: string, body: Uint8Array, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: mimeType,
        ContentLength: body.byteLength,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function mimeFromFormat(format: string | undefined): string | null {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return null;
}

async function sanitizeImage(bytes: Uint8Array) {
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new MediaError("MEDIA_TOO_LARGE", 413);
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(bytes, { animated: true, limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  } catch {
    throw new MediaError("UNSUPPORTED_MEDIA", 415);
  }
  const mimeType = mimeFromFormat(metadata.format);
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!mimeType || !width || !height || width * height > MAX_IMAGE_PIXELS || (metadata.pages ?? 1) > 1) {
    throw new MediaError("UNSUPPORTED_MEDIA", 415);
  }
  let pipeline = sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS }).rotate();
  if (mimeType === "image/jpeg") pipeline = pipeline.jpeg();
  if (mimeType === "image/png") pipeline = pipeline.png();
  if (mimeType === "image/webp") pipeline = pipeline.webp();
  const output = await pipeline.toBuffer();
  if (output.byteLength > MAX_IMAGE_BYTES) throw new MediaError("MEDIA_TOO_LARGE", 413);
  const normalized = await sharp(output).metadata();
  return {
    bytes: new Uint8Array(output),
    mimeType,
    byteSize: output.byteLength,
    width: normalized.width ?? width,
    height: normalized.height ?? height,
  };
}

export class MediaService {
  constructor(
    private readonly db: Database["db"],
    private readonly store: MediaObjectStore = new R2MediaObjectStore(),
  ) {}

  async createUploads(userId: string, descriptors: UploadDescriptor[]) {
    await this.cleanupExpiredPending();
    if (descriptors.length < 1 || descriptors.length > 5) {
      throw new MediaError("INVALID_MEDIA", 422);
    }
    for (const descriptor of descriptors) {
      if (!descriptor.name.trim() || !ALLOWED_MIME.has(descriptor.mimeType)) {
        throw new MediaError("UNSUPPORTED_MEDIA", 415);
      }
      if (!Number.isInteger(descriptor.byteSize) || descriptor.byteSize < 1) {
        throw new MediaError("INVALID_MEDIA", 422);
      }
      if (descriptor.byteSize > MAX_IMAGE_BYTES) {
        throw new MediaError("MEDIA_TOO_LARGE", 413);
      }
    }
    let assets: MediaAsset[];
    try {
      assets = await createPendingMediaAssets(this.db, {
        userId,
        descriptors,
        pendingExpiresAt: new Date(
          Date.now() + positiveInteger(process.env.MEDIA_PENDING_TTL_HOURS, 24) * 60 * 60 * 1000,
        ),
        hourlyLimit: positiveInteger(process.env.MEDIA_UPLOAD_HOURLY_LIMIT, 50),
        storageLimitBytes: positiveInteger(
          process.env.MEDIA_USER_STORAGE_LIMIT_BYTES,
          1024 * 1024 * 1024,
        ),
      });
    } catch (error) {
      if (error instanceof PublishingDatabaseError && error.code === "MEDIA_QUOTA_EXCEEDED") {
        throw new MediaError("MEDIA_QUOTA_EXCEEDED", 429);
      }
      throw error;
    }
    const ttlSeconds = positiveInteger(process.env.MEDIA_UPLOAD_TICKET_TTL_SECONDS, 600);
    try {
      return {
        uploads: await Promise.all(
          assets.map(async (asset, index) => ({
            assetId: asset.id,
            uploadUrl: await this.store.signedPut(
              asset.storageKey,
              descriptors[index]!.mimeType,
              descriptors[index]!.byteSize,
              ttlSeconds,
            ),
            expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
          })),
        ),
      };
    } catch {
      throw new MediaError("STORAGE_UNAVAILABLE", 502);
    }
  }

  async deleteConversationAssets(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const assets = await listOwnedConversationMediaAssets(
      this.db,
      userId,
      conversationId,
    );
    try {
      for (const asset of assets) {
        await this.store.delete(asset.storageKey);
      }
    } catch {
      throw new MediaError("STORAGE_UNAVAILABLE", 502);
    }
  }

  private async cleanupExpiredPending(): Promise<void> {
    const assets = await listExpiredPendingMediaAssets(this.db);
    for (const asset of assets) {
      try {
        await this.store.delete(asset.storageKey);
        await deleteExpiredPendingMediaAsset(this.db, asset.id);
      } catch {
        // Opportunistic cleanup must not make a new upload unavailable.
      }
    }
  }

  async complete(userId: string, assetId: string): Promise<PublicMediaAsset> {
    const asset = await getOwnedMediaAsset(this.db, userId, assetId);
    if (!asset) throw new MediaError("MEDIA_NOT_FOUND", 404);
    if (asset.state === "ready") return this.publicAsset(asset);
    if (asset.state !== "pending" || asset.pendingExpiresAt.getTime() <= Date.now()) {
      throw new MediaError("MEDIA_NOT_READY", 409);
    }
    try {
      const sanitized = await sanitizeImage(await this.store.get(asset.storageKey));
      if (asset.mimeType !== sanitized.mimeType) {
        throw new MediaError("UNSUPPORTED_MEDIA", 415);
      }
      await this.store.put(asset.storageKey, sanitized.bytes, sanitized.mimeType);
      const ready = await markMediaAssetReady(this.db, {
        userId,
        assetId,
        mimeType: sanitized.mimeType,
        byteSize: sanitized.byteSize,
        width: sanitized.width,
        height: sanitized.height,
      });
      return this.publicAsset(ready);
    } catch (error) {
      if (error instanceof MediaError) throw error;
      throw new MediaError("STORAGE_UNAVAILABLE", 502);
    }
  }

  async delete(userId: string, assetId: string): Promise<void> {
    const asset = await getOwnedMediaAsset(this.db, userId, assetId);
    if (!asset) throw new MediaError("MEDIA_NOT_FOUND", 404);
    if (asset.conversationId) throw new MediaError("MEDIA_NOT_READY", 409);
    try {
      await this.store.delete(asset.storageKey);
      if (!(await deleteOwnedUnattachedMediaAsset(this.db, userId, assetId))) {
        throw new MediaError("MEDIA_NOT_FOUND", 404);
      }
    } catch (error) {
      if (error instanceof MediaError) throw error;
      throw new MediaError("STORAGE_UNAVAILABLE", 502);
    }
  }

  async previewUrl(userId: string, assetId: string): Promise<string> {
    const asset = await getOwnedMediaAsset(this.db, userId, assetId);
    if (!asset || asset.state !== "ready") throw new MediaError("MEDIA_NOT_FOUND", 404);
    return this.store.signedGet(
      asset.storageKey,
      positiveInteger(process.env.MEDIA_PREVIEW_TTL_SECONDS, 3600),
    );
  }

  async publishUrl(userId: string, assetId: string): Promise<string> {
    const asset = await getOwnedMediaAsset(this.db, userId, assetId);
    if (!asset || asset.state !== "ready") throw new MediaError("MEDIA_NOT_FOUND", 404);
    return this.store.signedGet(
      asset.storageKey,
      positiveInteger(process.env.MEDIA_PUBLISH_TTL_SECONDS, 7200),
    );
  }

  async modelImage(userId: string, assetId: string): Promise<ModelMediaAsset> {
    const asset = await getOwnedMediaAsset(this.db, userId, assetId);
    if (!asset || asset.state !== "ready" || !asset.mimeType || !ALLOWED_MIME.has(asset.mimeType)) {
      throw new MediaError("MEDIA_NOT_FOUND", 404);
    }
    try {
      const resized = await sharp(await this.store.get(asset.storageKey), {
        limitInputPixels: MAX_IMAGE_PIXELS,
      })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .toBuffer();
      return {
        mediaType: asset.mimeType as ModelMediaAsset["mediaType"],
        data: resized.toString("base64"),
      };
    } catch {
      throw new MediaError("STORAGE_UNAVAILABLE", 502);
    }
  }

  private async publicAsset(asset: MediaAsset): Promise<PublicMediaAsset> {
    if (!asset.mimeType || !asset.byteSize || !asset.width || !asset.height) {
      throw new MediaError("MEDIA_NOT_READY", 409);
    }
    return {
      id: asset.id,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      previewUrl: await this.store.signedGet(
        asset.storageKey,
        positiveInteger(process.env.MEDIA_PREVIEW_TTL_SECONDS, 3600),
      ),
    };
  }
}
