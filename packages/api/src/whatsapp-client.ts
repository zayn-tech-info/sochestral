import { createHmac, timingSafeEqual } from "node:crypto";
import type { WhatsAppConfig } from "./whatsapp-config.js";
import { whatsappSendConfigured } from "./whatsapp-config.js";

export type InboundWhatsAppText = {
  wamid: string;
  waId: string;
  text: string;
  profileName: string | null;
};

export interface WhatsAppClient {
  verifySignature(rawBody: string, signatureHeader: string | undefined): boolean;
  parseInbound(payload: unknown): InboundWhatsAppText[];
  sendText(waId: string, body: string): Promise<void>;
}

export class MetaWhatsAppClient implements WhatsAppClient {
  constructor(
    private readonly config: WhatsAppConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  verifySignature(
    rawBody: string,
    signatureHeader: string | undefined,
  ): boolean {
    if (!this.config.appSecret || !signatureHeader) return false;
    const expected =
      "sha256=" +
      createHmac("sha256", this.config.appSecret)
        .update(rawBody, "utf8")
        .digest("hex");
    const left = Buffer.from(expected);
    const right = Buffer.from(signatureHeader);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }

  parseInbound(payload: unknown): InboundWhatsAppText[] {
    if (!payload || typeof payload !== "object") return [];
    const entries: InboundWhatsAppText[] = [];
    const body = payload as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
            messages?: Array<{
              id?: string;
              from?: string;
              type?: string;
              text?: { body?: string };
            }>;
          };
        }>;
      }>;
    };

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value?.messages?.length) continue;
        const contactByWa = new Map(
          (value.contacts ?? [])
            .filter((c) => typeof c.wa_id === "string")
            .map((c) => [c.wa_id as string, c.profile?.name ?? null]),
        );
        for (const message of value.messages) {
          if (message.type !== "text") continue;
          const text = message.text?.body?.trim();
          const wamid = message.id?.trim();
          const waId = message.from?.trim();
          if (!text || !wamid || !waId) continue;
          entries.push({
            wamid,
            waId,
            text,
            profileName: contactByWa.get(waId) ?? null,
          });
        }
      }
    }
    return entries;
  }

  async sendText(waId: string, body: string): Promise<void> {
    if (!whatsappSendConfigured(this.config)) {
      throw new Error("WHATSAPP_SEND_NOT_CONFIGURED");
    }
    const url =
      `https://graph.facebook.com/${this.config.apiVersion}/` +
      `${this.config.phoneNumberId}/messages`;
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: waId,
        type: "text",
        text: { preview_url: false, body: body.slice(0, 4096) },
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[sochestral:whatsapp] sendText failed", {
        status: response.status,
        detail: detail.slice(0, 200),
      });
      throw new Error("WHATSAPP_SEND_FAILED");
    }
  }
}
