import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client.js";
import {
  claimWhatsappInboundReceipt,
  consumeWhatsappLinkChallenge,
  createWhatsappLinkChallenge,
  getActiveChannelIdentity,
  getActiveChannelIdentityForUser,
  hashChannelLinkToken,
  maskDisplayKey,
  revokeActiveWhatsappLink,
} from "./channels.js";
import { DatabaseError } from "./errors.js";
import { requireTestDatabaseUrl } from "./env.js";
import { channelLinkChallenges } from "./schema.js";
import { provisionUser } from "./users.js";
import { eq } from "drizzle-orm";

describe("channel identity helpers", () => {
  let database: Database;
  let userId: string;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "wa-owner@example.com")).id;
  });

  it("links a WhatsApp id uniquely to one user (AC-1, AC-2)", async () => {
    const { rawToken } = await createWhatsappLinkChallenge(database.db, userId);
    const identity = await consumeWhatsappLinkChallenge(
      database.db,
      rawToken,
      "15551234567",
      "+15551234567",
    );

    expect(identity.userId).toBe(userId);
    expect(identity.externalId).toBe("15551234567");
    expect(identity.status).toBe("active");
    expect(identity.channel).toBe("whatsapp");

    const byExternal = await getActiveChannelIdentity(
      database.db,
      "whatsapp",
      "15551234567",
    );
    expect(byExternal?.id).toBe(identity.id);

    const other = (await provisionUser(database.db, "wa-other@example.com")).id;
    const otherChallenge = await createWhatsappLinkChallenge(database.db, other);
    await expect(
      consumeWhatsappLinkChallenge(
        database.db,
        otherChallenge.rawToken,
        "15551234567",
        null,
      ),
    ).rejects.toBeInstanceOf(DatabaseError);
  });

  it("rejects reuse of a consumed or hashed-only token (AC-2)", async () => {
    const { rawToken, challenge } = await createWhatsappLinkChallenge(
      database.db,
      userId,
    );
    const [stored] = await database.db
      .select()
      .from(channelLinkChallenges)
      .where(eq(channelLinkChallenges.id, challenge.id));
    expect(stored?.tokenHash).toBe(hashChannelLinkToken(rawToken));
    expect(stored?.tokenHash).not.toContain(rawToken);

    await consumeWhatsappLinkChallenge(
      database.db,
      rawToken,
      "15550001111",
      null,
    );
    await expect(
      consumeWhatsappLinkChallenge(
        database.db,
        rawToken,
        "15550001111",
        null,
      ),
    ).rejects.toMatchObject({ code: "CHANNEL_LINK_INVALID" });
  });

  it("revokes an active link so inbound no longer resolves (AC-1)", async () => {
    const { rawToken } = await createWhatsappLinkChallenge(database.db, userId);
    await consumeWhatsappLinkChallenge(
      database.db,
      rawToken,
      "15550002222",
      null,
    );
    const revoked = await revokeActiveWhatsappLink(database.db, userId);
    expect(revoked?.status).toBe("revoked");
    expect(
      await getActiveChannelIdentityForUser(database.db, userId, "whatsapp"),
    ).toBeNull();
  });

  it("claims inbound wamid once for idempotency (AC-7)", async () => {
    const first = await claimWhatsappInboundReceipt(
      database.db,
      "wamid_1",
      null,
    );
    const second = await claimWhatsappInboundReceipt(
      database.db,
      "wamid_1",
      null,
    );
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("masks display keys for status responses", () => {
    expect(maskDisplayKey("+15551234567")).toBe("••••4567");
    expect(maskDisplayKey(null)).toBeNull();
  });
});
