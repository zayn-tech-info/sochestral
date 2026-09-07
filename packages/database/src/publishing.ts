import { and, count, eq, gt, inArray, lt, ne, sql, sum } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  createMediaAssetId,
  createPublishingAuthorityEventId,
} from "./ids.js";
import {
  mediaAssets,
  orchestrationMessageMedia,
  orchestrationMessages,
  publishingAuthorityEvents,
  publishingPreferences,
  type MediaAsset,
  type PublishingAuthorityEvent,
  type PublishingAuthoritySource,
  type PublishingMode,
  type PublishingPreference,
} from "./schema.js";

export class PublishingDatabaseError extends Error {
  constructor(
    readonly code:
      | "PREFERENCE_STALE"
      | "INVALID_CONSENT"
      | "MEDIA_NOT_FOUND"
      | "MEDIA_NOT_READY"
      | "MEDIA_QUOTA_EXCEEDED",
  ) {
    super(code);
    this.name = "PublishingDatabaseError";
  }
}

export type PublicPublishingPreferenceRecord = {
  mode: PublishingMode;
  revision: number;
  consentVersion: string | null;
  consentedAt: Date | null;
  authorityEventId: string | null;
};

function defaultPreference(): PublicPublishingPreferenceRecord {
  return {
    mode: "always_draft",
    revision: 0,
    consentVersion: null,
    consentedAt: null,
    authorityEventId: null,
  };
}

async function latestAuthorityEvent(
  db: Database["db"],
  userId: string,
): Promise<PublishingAuthorityEvent | null> {
  const [event] = await db
    .select()
    .from(publishingAuthorityEvents)
    .where(eq(publishingAuthorityEvents.userId, userId))
    .orderBy(sql`${publishingAuthorityEvents.createdAt} desc`, sql`${publishingAuthorityEvents.id} desc`)
    .limit(1);
  return event ?? null;
}

export async function getPublishingPreference(
  db: Database["db"],
  userId: string,
): Promise<PublicPublishingPreferenceRecord> {
  const [row, event] = await Promise.all([
    db
      .select()
      .from(publishingPreferences)
      .where(eq(publishingPreferences.userId, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    latestAuthorityEvent(db, userId),
  ]);
  if (!row) return defaultPreference();
  return {
    mode: row.mode as PublishingMode,
    revision: row.revision,
    consentVersion: row.fullAccessConsentVersion,
    consentedAt: row.fullAccessConsentedAt,
    authorityEventId: event?.id ?? null,
  };
}

export async function updatePublishingPreference(
  db: Database["db"],
  input: {
    userId: string;
    expectedRevision: number;
    mode: PublishingMode;
    source: PublishingAuthoritySource;
    currentConsentVersion: string;
    acknowledged: boolean;
    consentVersion: string | null;
  },
): Promise<PublicPublishingPreferenceRecord> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`publishing:${input.userId}`}))`,
    );
    const [current] = await tx
      .select()
      .from(publishingPreferences)
      .where(eq(publishingPreferences.userId, input.userId))
      .for("update")
      .limit(1);
    const revision = current?.revision ?? 0;
    if (revision !== input.expectedRevision) {
      throw new PublishingDatabaseError("PREFERENCE_STALE");
    }
    if (
      input.mode === "full_access" &&
      (!input.acknowledged || input.consentVersion !== input.currentConsentVersion)
    ) {
      throw new PublishingDatabaseError("INVALID_CONSENT");
    }
    const previousMode = (current?.mode ?? "always_draft") as PublishingMode;
    const nextRevision = revision + 1;
    const consentVersion =
      input.mode === "full_access" ? input.currentConsentVersion : null;
    const consentedAt = input.mode === "full_access" ? new Date() : null;
    let row: PublishingPreference;
    if (current) {
      [row] = await tx
        .update(publishingPreferences)
        .set({
          mode: input.mode,
          revision: nextRevision,
          fullAccessConsentVersion: consentVersion,
          fullAccessConsentedAt: consentedAt,
          updatedAt: new Date(),
        })
        .where(eq(publishingPreferences.userId, input.userId))
        .returning();
    } else {
      [row] = await tx
        .insert(publishingPreferences)
        .values({
          userId: input.userId,
          mode: input.mode,
          revision: nextRevision,
          fullAccessConsentVersion: consentVersion,
          fullAccessConsentedAt: consentedAt,
        })
        .returning();
    }
    const eventId = createPublishingAuthorityEventId();
    await tx.insert(publishingAuthorityEvents).values({
      id: eventId,
      userId: input.userId,
      previousMode,
      nextMode: input.mode,
      source: input.source,
      consentVersion,
    });
    return {
      mode: row!.mode as PublishingMode,
      revision: row!.revision,
      consentVersion: row!.fullAccessConsentVersion,
      consentedAt: row!.fullAccessConsentedAt,
      authorityEventId: eventId,
    };
  });
}

export async function expirePublishingConsent(
  db: Database["db"],
  userId: string,
  currentConsentVersion: string,
): Promise<PublicPublishingPreferenceRecord> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`publishing:${userId}`}))`,
    );
    const [current] = await tx
      .select()
      .from(publishingPreferences)
      .where(eq(publishingPreferences.userId, userId))
      .for("update")
      .limit(1);
    if (
      !current ||
      current.mode !== "full_access" ||
      current.fullAccessConsentVersion === currentConsentVersion
    ) {
      return current
        ? {
            mode: current.mode as PublishingMode,
            revision: current.revision,
            consentVersion: current.fullAccessConsentVersion,
            consentedAt: current.fullAccessConsentedAt,
            authorityEventId: null,
          }
        : defaultPreference();
    }
    const [updated] = await tx
      .update(publishingPreferences)
      .set({
        mode: "always_draft",
        revision: current.revision + 1,
        fullAccessConsentVersion: null,
        fullAccessConsentedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(publishingPreferences.userId, userId))
      .returning();
    const eventId = createPublishingAuthorityEventId();
    await tx.insert(publishingAuthorityEvents).values({
      id: eventId,
      userId,
      previousMode: "full_access",
      nextMode: "always_draft",
      source: "system",
      eventKind: "consent_expired",
      consentVersion: current.fullAccessConsentVersion,
    });
    return {
      mode: "always_draft",
      revision: updated!.revision,
      consentVersion: null,
      consentedAt: null,
      authorityEventId: eventId,
    };
  });
}

export async function createPendingMediaAssets(
  db: Database["db"],
  input: {
    userId: string;
    descriptors: Array<{ mimeType: string; byteSize: number }>;
    pendingExpiresAt: Date;
    hourlyLimit: number;
    storageLimitBytes: number;
  },
): Promise<MediaAsset[]> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`media:${input.userId}`}))`,
    );
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const [[hourly], [stored]] = await Promise.all([
      tx
        .select({ value: count() })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.userId, input.userId),
            gt(mediaAssets.createdAt, since),
          ),
        ),
      tx
        .select({ value: sum(mediaAssets.byteSize) })
        .from(mediaAssets)
        .where(eq(mediaAssets.userId, input.userId)),
    ]);
    const storedBytes = Number(stored?.value ?? 0);
    const requestedBytes = input.descriptors.reduce(
      (total, item) => total + item.byteSize,
      0,
    );
    if (
      Number(hourly?.value ?? 0) + input.descriptors.length > input.hourlyLimit ||
      storedBytes + requestedBytes > input.storageLimitBytes
    ) {
      throw new PublishingDatabaseError("MEDIA_QUOTA_EXCEEDED");
    }
    const values = input.descriptors.map((descriptor) => {
      const id = createMediaAssetId();
      return {
        id,
        userId: input.userId,
        storageKey: `${input.userId}/${id}`,
        state: "pending",
        mimeType: descriptor.mimeType,
        byteSize: descriptor.byteSize,
        pendingExpiresAt: input.pendingExpiresAt,
      };
    });
    return tx.insert(mediaAssets).values(values).returning();
  });
}

export async function getOwnedMediaAsset(
  db: Database["db"],
  userId: string,
  assetId: string,
): Promise<MediaAsset | null> {
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.id, assetId),
        eq(mediaAssets.userId, userId),
        ne(mediaAssets.state, "deleted"),
      ),
    )
    .limit(1);
  return asset ?? null;
}

export async function getOwnedMediaAssetAnyState(
  db: Database["db"],
  userId: string,
  assetId: string,
): Promise<MediaAsset | null> {
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.userId, userId)))
    .limit(1);
  return asset ?? null;
}

export async function restoreReadyMediaAsset(
  db: Database["db"],
  input: {
    userId: string;
    assetId: string;
    mimeType: string;
    byteSize: number;
    width: number;
    height: number;
  },
): Promise<MediaAsset | null> {
  const [asset] = await db
    .update(mediaAssets)
    .set({
      state: "ready",
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      width: input.width,
      height: input.height,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaAssets.id, input.assetId),
        eq(mediaAssets.userId, input.userId),
      ),
    )
    .returning();
  return asset ?? null;
}

export async function listOwnedConversationMediaAssets(
  db: Database["db"],
  userId: string,
  conversationId: string,
): Promise<MediaAsset[]> {
  return db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.userId, userId),
        eq(mediaAssets.conversationId, conversationId),
      ),
    )
    .orderBy(mediaAssets.createdAt, mediaAssets.id);
}

export async function listExpiredPendingMediaAssets(
  db: Database["db"],
  limit: number = 50,
): Promise<MediaAsset[]> {
  return db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.state, "pending"),
        lt(mediaAssets.pendingExpiresAt, new Date()),
        sql`${mediaAssets.conversationId} is null`,
      ),
    )
    .orderBy(mediaAssets.pendingExpiresAt, mediaAssets.id)
    .limit(limit);
}

export async function deleteExpiredPendingMediaAsset(
  db: Database["db"],
  assetId: string,
): Promise<boolean> {
  const [deleted] = await db
    .update(mediaAssets)
    .set({
      state: "deleted",
      mimeType: null,
      byteSize: null,
      width: null,
      height: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaAssets.id, assetId),
        eq(mediaAssets.state, "pending"),
        lt(mediaAssets.pendingExpiresAt, new Date()),
        sql`${mediaAssets.conversationId} is null`,
      ),
    )
    .returning({ id: mediaAssets.id });
  return Boolean(deleted);
}

export async function markMediaAssetReady(
  db: Database["db"],
  input: {
    userId: string;
    assetId: string;
    mimeType: string;
    byteSize: number;
    width: number;
    height: number;
  },
): Promise<MediaAsset> {
  const [asset] = await db
    .update(mediaAssets)
    .set({
      state: "ready",
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      width: input.width,
      height: input.height,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaAssets.id, input.assetId),
        eq(mediaAssets.userId, input.userId),
        eq(mediaAssets.state, "pending"),
      ),
    )
    .returning();
  if (!asset) throw new PublishingDatabaseError("MEDIA_NOT_FOUND");
  return asset;
}

export async function linkOwnedMediaToConversation(
  db: Database["db"],
  userId: string,
  assetId: string,
  conversationId: string,
): Promise<void> {
  await db
    .update(mediaAssets)
    .set({ conversationId, updatedAt: new Date() })
    .where(
      and(
        eq(mediaAssets.id, assetId),
        eq(mediaAssets.userId, userId),
        ne(mediaAssets.state, "deleted"),
      ),
    );
}

export async function deleteOwnedUnattachedMediaAsset(
  db: Database["db"],
  userId: string,
  assetId: string,
): Promise<MediaAsset | null> {
  const [asset] = await db
    .update(mediaAssets)
    .set({
      state: "deleted",
      mimeType: null,
      byteSize: null,
      width: null,
      height: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaAssets.id, assetId),
        eq(mediaAssets.userId, userId),
        ne(mediaAssets.state, "deleted"),
        sql`${mediaAssets.conversationId} is null`,
      ),
    )
    .returning();
  return asset ?? null;
}

export async function attachReadyMediaToMessage(
  tx: Parameters<Parameters<Database["db"]["transaction"]>[0]>[0],
  input: {
    userId: string;
    conversationId: string;
    messageId: string;
    assetIds: string[];
  },
): Promise<void> {
  if (input.assetIds.length === 0) return;
  const assets = await tx
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.userId, input.userId),
        eq(mediaAssets.state, "ready"),
        inArray(mediaAssets.id, input.assetIds),
      ),
    );
  if (assets.length !== input.assetIds.length) {
    throw new PublishingDatabaseError("MEDIA_NOT_READY");
  }

  // Retries / new chats may reuse the same ready uploads after a failed turn.
  await tx
    .delete(orchestrationMessageMedia)
    .where(inArray(orchestrationMessageMedia.assetId, input.assetIds));
  await tx
    .update(mediaAssets)
    .set({ conversationId: input.conversationId, updatedAt: new Date() })
    .where(inArray(mediaAssets.id, input.assetIds));
  await tx.insert(orchestrationMessageMedia).values(
    input.assetIds.map((assetId, position) => ({
      messageId: input.messageId,
      assetId,
      position,
    })),
  );
}

export async function listMessageMediaAssets(
  db: Database["db"],
  messageIds: string[],
): Promise<Array<{ messageId: string; position: number; asset: MediaAsset }>> {
  if (messageIds.length === 0) return [];
  const rows = await db
    .select({
      messageId: orchestrationMessageMedia.messageId,
      position: orchestrationMessageMedia.position,
      asset: mediaAssets,
    })
    .from(orchestrationMessageMedia)
    .innerJoin(mediaAssets, eq(orchestrationMessageMedia.assetId, mediaAssets.id))
    .innerJoin(
      orchestrationMessages,
      eq(orchestrationMessageMedia.messageId, orchestrationMessages.id),
    )
    .where(inArray(orchestrationMessageMedia.messageId, messageIds))
    .orderBy(orchestrationMessageMedia.messageId, orchestrationMessageMedia.position);
  return rows;
}
