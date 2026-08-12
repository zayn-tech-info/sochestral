import sharp from "sharp";
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDb,
  deleteUser,
  provisionUser,
  requireTestDatabaseUrl,
  type Database,
} from "@sochestral/database";
import {
  MediaError,
  MediaService,
  buildMediaViewUrl,
  signMediaView,
  verifyMediaViewSig,
  type MediaObjectStore,
} from "./media-storage.js";

class MemoryMediaStore implements MediaObjectStore {
  readonly objects = new Map<string, Uint8Array>();
  readonly deleted: string[] = [];
  lastUploadKey: string | null = null;

  async signedPut(key: string) {
    this.lastUploadKey = key;
    return `https://upload.invalid/${encodeURIComponent(key)}`;
  }

  async signedGet(key: string, ttlSeconds: number) {
    return `https://media.invalid/${encodeURIComponent(key)}?ttl=${ttlSeconds}`;
  }

  async get(key: string) {
    const value = this.objects.get(key);
    if (!value) throw new Error("missing object");
    return value;
  }

  async put(key: string, body: Uint8Array) {
    this.objects.set(key, body);
  }

  async delete(key: string) {
    this.objects.delete(key);
    this.deleted.push(key);
  }
}

describe("media view HMAC expiry", () => {
  const previousJwt = process.env.JWT_SECRET;
  const previousMediaSecret = process.env.MEDIA_VIEW_SECRET;
  const previousTtl = process.env.MEDIA_VIEW_TTL_DAYS;
  const userId = "user_view_hmac";
  const assetId = "media_view_hmac";

  beforeAll(() => {
    process.env.JWT_SECRET = "media-view-test-jwt";
    delete process.env.MEDIA_VIEW_SECRET;
    delete process.env.MEDIA_VIEW_TTL_DAYS;
  });

  afterAll(() => {
    if (previousJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwt;
    if (previousMediaSecret === undefined) delete process.env.MEDIA_VIEW_SECRET;
    else process.env.MEDIA_VIEW_SECRET = previousMediaSecret;
    if (previousTtl === undefined) delete process.env.MEDIA_VIEW_TTL_DAYS;
    else process.env.MEDIA_VIEW_TTL_DAYS = previousTtl;
  });

  it("accepts a valid unexpired signature", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const sig = signMediaView(userId, assetId, exp);
    expect(verifyMediaViewSig(userId, assetId, String(exp), sig)).toBe(true);
  });

  it("rejects an expired signature", () => {
    const exp = Math.floor(Date.now() / 1000) - 1;
    const sig = signMediaView(userId, assetId, exp);
    expect(verifyMediaViewSig(userId, assetId, String(exp), sig)).toBe(false);
  });

  it("rejects missing exp (fail closed for legacy URLs)", () => {
    const legacySig = createHmac("sha256", process.env.JWT_SECRET!)
      .update(`${userId}:${assetId}`)
      .digest("base64url");
    expect(verifyMediaViewSig(userId, assetId, undefined, legacySig)).toBe(false);
    expect(verifyMediaViewSig(userId, assetId, "", legacySig)).toBe(false);
  });

  it("rejects a tampered exp that does not match the HMAC", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const sig = signMediaView(userId, assetId, exp);
    const tamperedExp = String(exp + 86_400);
    expect(verifyMediaViewSig(userId, assetId, tamperedExp, sig)).toBe(false);
  });

  it("rejects a signature minted with the wrong secret", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const wrongSig = createHmac("sha256", "wrong-secret")
      .update(`${userId}:${assetId}:${exp}`)
      .digest("base64url");
    expect(verifyMediaViewSig(userId, assetId, String(exp), wrongSig)).toBe(false);
  });

  it("mints view URLs that include exp and verify successfully", () => {
    const url = new URL(buildMediaViewUrl(userId, assetId, "https://api.example"));
    expect(url.pathname).toBe(`/media/assets/${assetId}/view`);
    expect(url.searchParams.get("u")).toBe(userId);
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    expect(exp).toMatch(/^\d+$/);
    expect(sig).toBeTruthy();
    const ttlSeconds = Number(exp) - Math.floor(Date.now() / 1000);
    expect(ttlSeconds).toBeGreaterThan(29 * 24 * 60 * 60 - 5);
    expect(ttlSeconds).toBeLessThanOrEqual(30 * 24 * 60 * 60);
    expect(verifyMediaViewSig(userId, assetId, exp!, sig!)).toBe(true);
  });
});

describe("private media storage", () => {
  let database: Database;
  const previousJwt = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = previousJwt || "media-storage-test-jwt";
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (previousJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwt;
    await database.client.end({ timeout: 5 });
  });

  it("sanitizes an owned image and returns only safe attachment metadata", async () => {
    const user = await provisionUser(database.db, `media-${crypto.randomUUID()}@example.com`);
    const store = new MemoryMediaStore();
    const service = new MediaService(database.db, store);
    const input = await sharp({
      create: { width: 3, height: 2, channels: 3, background: "#7656d8" },
    }).png().withMetadata({
      exif: { IFD0: { Copyright: "private camera note" } },
    }).toBuffer();

    const ticket = await service.createUploads(user.id, [{
      name: "post.png",
      mimeType: "image/png",
      byteSize: input.byteLength,
    }]);
    const key = store.lastUploadKey!;
    store.objects.set(key, new Uint8Array(input));

    const completed = await service.complete(user.id, ticket.uploads[0]!.assetId);
    expect(completed).toMatchObject({
      id: ticket.uploads[0]!.assetId,
      mimeType: "image/png",
      width: 3,
      height: 2,
    });
    expect(completed.previewUrl).toMatch(/^https:\/\/media\.invalid\//);
    expect(completed.viewUrl).toMatch(
      new RegExp(`/media/assets/${completed.id}/view\\?u=`),
    );
    expect(completed.viewUrl).toMatch(/[?&]exp=\d+/);
    expect(completed.viewUrl).toMatch(/[?&]sig=/);
    const view = new URL(completed.viewUrl);
    expect(
      verifyMediaViewSig(
        user.id,
        completed.id,
        view.searchParams.get("exp") ?? undefined,
        view.searchParams.get("sig") ?? "",
      ),
    ).toBe(true);
    expect(JSON.stringify(completed)).not.toContain(key);
    expect((await sharp(store.objects.get(key)!).metadata()).exif).toBeUndefined();

    await service.delete(user.id, completed.id);
    await deleteUser(database.db, user.id);
  });

  it("accepts a ticket MIME that disagrees with the real image bytes", async () => {
    const user = await provisionUser(database.db, `spoof-${crypto.randomUUID()}@example.com`);
    const store = new MemoryMediaStore();
    const service = new MediaService(database.db, store);
    const png = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "white" },
    }).png().toBuffer();
    const ticket = await service.createUploads(user.id, [{
      name: "not-really.jpg",
      mimeType: "image/jpeg",
      byteSize: png.byteLength,
    }]);
    store.objects.set(store.lastUploadKey!, new Uint8Array(png));

    const completed = await service.complete(user.id, ticket.uploads[0]!.assetId);
    expect(completed.mimeType).toBe("image/png");
    await service.delete(user.id, completed.id);
    await deleteUser(database.db, user.id);
  });

  it("masks another user's asset identifier", async () => {
    const owner = await provisionUser(database.db, `owner-${crypto.randomUUID()}@example.com`);
    const other = await provisionUser(database.db, `other-${crypto.randomUUID()}@example.com`);
    const store = new MemoryMediaStore();
    const service = new MediaService(database.db, store);
    const ticket = await service.createUploads(owner.id, [{
      name: "owned.png",
      mimeType: "image/png",
      byteSize: 128,
    }]);

    await expect(service.previewUrl(other.id, ticket.uploads[0]!.assetId)).rejects.toMatchObject({
      code: "MEDIA_NOT_FOUND",
      status: 404,
    } satisfies Partial<MediaError>);
    await service.delete(owner.id, ticket.uploads[0]!.assetId);
    await deleteUser(database.db, owner.id);
    await deleteUser(database.db, other.id);
  });

  it("keeps deleted upload tombstones in the rolling hourly quota", async () => {
    const previousLimit = process.env.MEDIA_UPLOAD_HOURLY_LIMIT;
    process.env.MEDIA_UPLOAD_HOURLY_LIMIT = "1";
    const user = await provisionUser(database.db, `quota-${crypto.randomUUID()}@example.com`);
    const store = new MemoryMediaStore();
    const service = new MediaService(database.db, store);
    try {
      const first = await service.createUploads(user.id, [{
        name: "first.png",
        mimeType: "image/png",
        byteSize: 128,
      }]);
      await service.delete(user.id, first.uploads[0]!.assetId);

      await expect(service.createUploads(user.id, [{
        name: "second.png",
        mimeType: "image/png",
        byteSize: 128,
      }])).rejects.toMatchObject({
        code: "MEDIA_QUOTA_EXCEEDED",
        status: 429,
      } satisfies Partial<MediaError>);
    } finally {
      if (previousLimit === undefined) delete process.env.MEDIA_UPLOAD_HOURLY_LIMIT;
      else process.env.MEDIA_UPLOAD_HOURLY_LIMIT = previousLimit;
      await deleteUser(database.db, user.id);
    }
  });
});
