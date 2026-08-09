import type { Hono } from "hono";
import type { Env } from "./app.js";
import type { WhatsAppBridge } from "./whatsapp-bridge.js";
import type { WhatsAppClient } from "./whatsapp-client.js";
import type { WhatsAppConfig } from "./whatsapp-config.js";

type WebhookDeps = {
  getConfig: () => WhatsAppConfig;
  getClient: () => WhatsAppClient;
  getBridge: () => WhatsAppBridge;
};

const recentHits = new Map<string, number>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const pruneBefore = now - RATE_WINDOW_MS;
  for (const [entry, at] of recentHits) {
    if (at < pruneBefore) recentHits.delete(entry);
  }
  const count = [...recentHits.values()].filter((at) => at >= pruneBefore).length;
  if (count >= RATE_MAX) return true;
  recentHits.set(`${key}:${now}:${Math.random()}`, now);
  return false;
}

export function registerWhatsAppWebhookRoutes(
  app: Hono<Env>,
  deps: WebhookDeps,
): void {
  app.get("/webhooks/whatsapp", async (c) => {
    const config = deps.getConfig();
    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    const challenge = c.req.query("hub.challenge");
    if (
      mode === "subscribe" &&
      config.verifyToken &&
      token === config.verifyToken &&
      typeof challenge === "string"
    ) {
      return c.text(challenge, 200);
    }
    return c.body(null, 403);
  });

  app.post("/webhooks/whatsapp", async (c) => {
    if (rateLimited(c.req.header("x-forwarded-for") ?? "unknown")) {
      return c.json({ error: "RATE_LIMITED" }, 429);
    }

    const config = deps.getConfig();
    const client = deps.getClient();
    const rawBody = await c.req.text();
    const signature = c.req.header("x-hub-signature-256") ?? undefined;
    if (!client.verifySignature(rawBody, signature)) {
      return c.json({ error: "INVALID_SIGNATURE" }, 401);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "INVALID_JSON" }, 400);
    }

    const inbound = client.parseInbound(payload);
    // Acknowledge quickly; process inline for v1 with a small set of messages.
    const bridge = deps.getBridge();
    for (const message of inbound) {
      try {
        await bridge.handleInboundText(message);
      } catch (error) {
        console.error("[sochestral:whatsapp] inbound handler failed", {
          wamid: message.wamid,
          error: error instanceof Error ? error.message : "unknown",
          enabled: config.enabled,
        });
      }
    }
    return c.json({ ok: true }, 200);
  });
}
