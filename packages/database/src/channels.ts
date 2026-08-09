import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Database } from "./client.js";
import { DatabaseError, isUniqueViolation } from "./errors.js";
import {
  createChannelIdentityId,
  createChannelLinkChallengeId,
  createChannelPendingActionId,
} from "./ids.js";
import {
  channelIdentities,
  channelLinkChallenges,
  channelPendingActions,
  orchestrationConversations,
  whatsappInboundReceipts,
  type ChannelIdentity,
  type ChannelKind,
  type ChannelLinkChallenge,
  type ChannelPendingAction,
  type ConversationSource,
  type OrchestrationConversation,
} from "./schema.js";

type DbConn =
  | Database["db"]
  | Parameters<Parameters<Database["db"]["transaction"]>[0]>[0];

const LINK_CHALLENGE_TTL_MS = 30 * 60 * 1000;
const PENDING_ACTION_TTL_MS = 24 * 60 * 60 * 1000;
const CARE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function hashChannelLinkToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function createChannelLinkToken(): string {
  return randomBytes(24).toString("base64url");
}

export function tokensEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function getActiveChannelIdentity(
  db: DbConn,
  channel: ChannelKind,
  externalId: string,
): Promise<ChannelIdentity | null> {
  const [row] = await db
    .select()
    .from(channelIdentities)
    .where(
      and(
        eq(channelIdentities.channel, channel),
        eq(channelIdentities.externalId, externalId),
        eq(channelIdentities.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getActiveChannelIdentityForUser(
  db: DbConn,
  userId: string,
  channel: ChannelKind,
): Promise<ChannelIdentity | null> {
  const [row] = await db
    .select()
    .from(channelIdentities)
    .where(
      and(
        eq(channelIdentities.userId, userId),
        eq(channelIdentities.channel, channel),
        eq(channelIdentities.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createWhatsappLinkChallenge(
  db: Database["db"],
  userId: string,
): Promise<{ challenge: ChannelLinkChallenge; rawToken: string }> {
  const existing = await getActiveChannelIdentityForUser(db, userId, "whatsapp");
  if (existing) {
    throw new DatabaseError(
      "CHANNEL_ALREADY_LINKED",
      "This user already has an active WhatsApp link",
    );
  }

  const rawToken = createChannelLinkToken();
  const now = new Date();
  const [challenge] = await db
    .insert(channelLinkChallenges)
    .values({
      id: createChannelLinkChallengeId(),
      userId,
      channel: "whatsapp",
      tokenHash: hashChannelLinkToken(rawToken),
      expiresAt: new Date(now.getTime() + LINK_CHALLENGE_TTL_MS),
      createdAt: now,
    })
    .returning();

  if (!challenge) {
    throw new Error("createWhatsappLinkChallenge insert returned no row");
  }
  return { challenge, rawToken };
}

export async function consumeWhatsappLinkChallenge(
  db: Database["db"],
  rawToken: string,
  externalId: string,
  displayKey: string | null,
): Promise<ChannelIdentity> {
  const tokenHash = hashChannelLinkToken(rawToken);
  const now = new Date();

  return db.transaction(async (tx) => {
    const [challenge] = await tx
      .update(channelLinkChallenges)
      .set({ consumedAt: now })
      .where(
        and(
          eq(channelLinkChallenges.tokenHash, tokenHash),
          eq(channelLinkChallenges.channel, "whatsapp"),
          isNull(channelLinkChallenges.consumedAt),
          gt(channelLinkChallenges.expiresAt, now),
        ),
      )
      .returning();

    if (!challenge) {
      throw new DatabaseError(
        "CHANNEL_LINK_INVALID",
        "Link challenge is missing, expired, or already used",
      );
    }

    const activeExternal = await getActiveChannelIdentity(
      tx,
      "whatsapp",
      externalId,
    );
    if (activeExternal && activeExternal.userId !== challenge.userId) {
      throw new DatabaseError(
        "CHANNEL_EXTERNAL_TAKEN",
        "This WhatsApp id is already linked to another user",
      );
    }

    const activeUser = await getActiveChannelIdentityForUser(
      tx,
      challenge.userId,
      "whatsapp",
    );
    if (activeUser) {
      throw new DatabaseError(
        "CHANNEL_ALREADY_LINKED",
        "This user already has an active WhatsApp link",
      );
    }

    try {
      const [identity] = await tx
        .insert(channelIdentities)
        .values({
          id: createChannelIdentityId(),
          userId: challenge.userId,
          channel: "whatsapp",
          externalId,
          displayKey,
          status: "active",
          linkedAt: now,
          lastInboundAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (!identity) {
        throw new Error("consumeWhatsappLinkChallenge insert returned no row");
      }
      return identity;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DatabaseError(
          "CHANNEL_EXTERNAL_TAKEN",
          "This WhatsApp id is already linked",
        );
      }
      throw error;
    }
  });
}

export async function revokeActiveWhatsappLink(
  db: Database["db"],
  userId: string,
): Promise<ChannelIdentity | null> {
  const existing = await getActiveChannelIdentityForUser(db, userId, "whatsapp");
  if (!existing) return null;
  const now = new Date();
  const [row] = await db
    .update(channelIdentities)
    .set({
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    })
    .where(eq(channelIdentities.id, existing.id))
    .returning();
  return row ?? null;
}

export async function touchChannelInbound(
  db: Database["db"],
  identityId: string,
  at = new Date(),
): Promise<void> {
  await db
    .update(channelIdentities)
    .set({ lastInboundAt: at, updatedAt: at })
    .where(eq(channelIdentities.id, identityId));
}

export function isWithinCareWindow(
  identity: Pick<ChannelIdentity, "lastInboundAt">,
  now = new Date(),
): boolean {
  if (!identity.lastInboundAt) return false;
  return now.getTime() - identity.lastInboundAt.getTime() <= CARE_WINDOW_MS;
}

export async function claimWhatsappInboundReceipt(
  db: Database["db"],
  wamid: string,
  channelIdentityId: string | null,
): Promise<boolean> {
  try {
    await db.insert(whatsappInboundReceipts).values({
      wamid,
      channelIdentityId,
      processedAt: new Date(),
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

export async function findWhatsappConversation(
  db: Database["db"],
  userId: string,
): Promise<OrchestrationConversation | null> {
  const [row] = await db
    .select()
    .from(orchestrationConversations)
    .where(
      and(
        eq(orchestrationConversations.userId, userId),
        eq(orchestrationConversations.source, "whatsapp"),
      ),
    )
    .orderBy(desc(orchestrationConversations.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function setConversationSource(
  db: Database["db"],
  conversationId: string,
  source: ConversationSource,
): Promise<void> {
  await db
    .update(orchestrationConversations)
    .set({ source, updatedAt: new Date() })
    .where(eq(orchestrationConversations.id, conversationId));
}

export async function replacePendingApproveAction(
  db: Database["db"],
  channelIdentityId: string,
  groupId: string,
  summaryText: string,
): Promise<ChannelPendingAction> {
  const now = new Date();
  return db.transaction(async (tx) => {
    await tx
      .update(channelPendingActions)
      .set({ consumedAt: now })
      .where(
        and(
          eq(channelPendingActions.channelIdentityId, channelIdentityId),
          isNull(channelPendingActions.consumedAt),
        ),
      );

    const [row] = await tx
      .insert(channelPendingActions)
      .values({
        id: createChannelPendingActionId(),
        channelIdentityId,
        kind: "approve_group",
        groupId,
        summaryText,
        expiresAt: new Date(now.getTime() + PENDING_ACTION_TTL_MS),
        createdAt: now,
      })
      .returning();

    if (!row) {
      throw new Error("replacePendingApproveAction insert returned no row");
    }
    return row;
  });
}

export async function getOpenPendingApproveAction(
  db: Database["db"],
  channelIdentityId: string,
): Promise<ChannelPendingAction | null> {
  const now = new Date();
  const [row] = await db
    .select()
    .from(channelPendingActions)
    .where(
      and(
        eq(channelPendingActions.channelIdentityId, channelIdentityId),
        eq(channelPendingActions.kind, "approve_group"),
        isNull(channelPendingActions.consumedAt),
        gt(channelPendingActions.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function consumePendingApproveAction(
  db: Database["db"],
  actionId: string,
): Promise<ChannelPendingAction | null> {
  const now = new Date();
  const [row] = await db
    .update(channelPendingActions)
    .set({ consumedAt: now })
    .where(
      and(
        eq(channelPendingActions.id, actionId),
        isNull(channelPendingActions.consumedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export function maskDisplayKey(displayKey: string | null): string | null {
  if (!displayKey) return null;
  const digits = displayKey.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••${digits.slice(-4)}`;
}

export { sql };
