import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MetaWhatsAppClient } from "./whatsapp-client.js";
import type { WhatsAppConfig } from "./whatsapp-config.js";

const baseConfig: WhatsAppConfig = {
  enabled: true,
  appSecret: "test-secret",
  verifyToken: "verify-me",
  accessToken: "token",
  phoneNumberId: "phone_1",
  businessAccountId: null,
  apiVersion: "v21.0",
  publicWebOrigin: "http://localhost:3000",
};

describe("MetaWhatsAppClient", () => {
  it("accepts a valid X-Hub-Signature-256 and rejects a bad one (AC-7)", () => {
    const client = new MetaWhatsAppClient(baseConfig);
    const raw = '{"object":"whatsapp_business_account"}';
    const good =
      "sha256=" +
      createHmac("sha256", baseConfig.appSecret).update(raw).digest("hex");
    expect(client.verifySignature(raw, good)).toBe(true);
    expect(client.verifySignature(raw, "sha256=deadbeef")).toBe(false);
    expect(client.verifySignature(raw, undefined)).toBe(false);
  });

  it("parses inbound text messages and ignores non-text", () => {
    const client = new MetaWhatsAppClient(baseConfig);
    const parsed = client.parseInbound({
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: "15551234567", profile: { name: "Ada" } }],
                messages: [
                  {
                    id: "wamid.1",
                    from: "15551234567",
                    type: "text",
                    text: { body: " draft please " },
                  },
                  {
                    id: "wamid.2",
                    from: "15551234567",
                    type: "image",
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(parsed).toEqual([
      {
        wamid: "wamid.1",
        waId: "15551234567",
        text: "draft please",
        profileName: "Ada",
      },
    ]);
  });

  it("posts sendText to Graph with the phone number id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    const client = new MetaWhatsAppClient(baseConfig, fetchImpl as typeof fetch);
    await client.sendText("15551234567", "hello");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/phone_1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      }),
    );
  });
});
