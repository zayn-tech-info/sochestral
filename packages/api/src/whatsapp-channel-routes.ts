import type { Context, Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import {
  SESSION_COOKIE_NAME,
  validateSessionToken,
} from "@sochestral/auth";
import {
  createWhatsappLinkChallenge,
  DatabaseError,
  getActiveChannelIdentityForUser,
  maskDisplayKey,
  revokeActiveWhatsappLink,
  type Database,
} from "@sochestral/database";
import type { Env } from "./app.js";
import type { WhatsAppConfig } from "./whatsapp-config.js";

type ChannelDeps = {
  getConfig: () => WhatsAppConfig;
};

function businessWaMeUrl(phoneNumberIdHint: string, prefilled: string): string {
  // phoneNumberId is not the E.164 display number; use public web deep link as primary,
  // and a generic wa.me only when WHATSAPP_DISPLAY_NUMBER is set via config later.
  void phoneNumberIdHint;
  return `https://wa.me/?text=${encodeURIComponent(prefilled)}`;
}

export function registerWhatsAppChannelRoutes(
  app: Hono<Env>,
  db: Database["db"],
  deps: ChannelDeps,
): void {
  async function sessionUser(c: Context<Env>) {
    const raw = getCookie(c, SESSION_COOKIE_NAME);
    const session = await validateSessionToken(db, raw);
    if (!session && raw) {
      deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
    }
    return session?.user ?? null;
  }

  app.get("/channels/whatsapp", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const identity = await getActiveChannelIdentityForUser(
      db,
      user.id,
      "whatsapp",
    );
    if (!identity) {
      return c.json({
        status: "unlinked",
        displayKey: null,
        linkedAt: null,
      });
    }
    return c.json({
      status: "active",
      displayKey: maskDisplayKey(identity.displayKey),
      linkedAt: identity.linkedAt?.toISOString() ?? null,
    });
  });

  app.post("/channels/whatsapp/link", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const config = deps.getConfig();
    try {
      const { challenge, rawToken } = await createWhatsappLinkChallenge(
        db,
        user.id,
      );
      const deepLink =
        `${config.publicWebOrigin}/app/settings/channels/whatsapp` +
        `?token=${encodeURIComponent(rawToken)}`;
      const prefilled = `LINK ${rawToken}`;
      const waMeUrl = businessWaMeUrl(config.phoneNumberId, prefilled);
      return c.json({
        deepLink,
        waMeUrl,
        expiresAt: challenge.expiresAt.toISOString(),
        instructions:
          "Open WhatsApp to your Sochestral business number and send the prefilled LINK message, or paste the token from Settings → Channels.",
        token: rawToken,
      });
    } catch (error) {
      if (
        error instanceof DatabaseError &&
        error.code === "CHANNEL_ALREADY_LINKED"
      ) {
        return c.json({ error: "ALREADY_LINKED" }, 409);
      }
      throw error;
    }
  });

  app.delete("/channels/whatsapp", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const revoked = await revokeActiveWhatsappLink(db, user.id);
    if (!revoked) return c.json({ error: "NOT_LINKED" }, 404);
    return c.json({ ok: true });
  });
}
