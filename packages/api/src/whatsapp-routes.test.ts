import { createHmac } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createConversationTurn,
  createDb,
  createReviewGroup,
  createWhatsappLinkChallenge,
  consumeWhatsappLinkChallenge,
  getActiveChannelIdentityForUser,
  provisionUser,
  replacePendingApproveAction,
  requireTestDatabaseUrl,
  setConversationSource,
  type Database,
} from "@sochestral/database";
import { createSession, SESSION_COOKIE_NAME } from "@sochestral/auth";
import type {
  ConnectorService,
  OrchestrationService,
  ReviewService,
} from "@sochestral/orchestration";
import { createApp } from "./app.js";
import type { WhatsAppClient } from "./whatsapp-client.js";
import type { WhatsAppConfig } from "./whatsapp-config.js";

function sign(raw: string, secret: string) {
  return (
    "sha256=" + createHmac("sha256", secret).update(raw, "utf8").digest("hex")
  );
}

describe("WhatsApp channel routes", () => {
  let database: Database;
  let userId: string;
  let cookie: string;
  let client: WhatsAppClient;
  let sent: Array<{ waId: string; body: string }>;
  let orchestration: OrchestrationService;
  let review: ReviewService;
  let connectors: ConnectorService;
  let config: WhatsAppConfig;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.client`delete from users`;
    const user = await provisionUser(database.db, "wa-api@example.com");
    userId = user.id;
    const session = await createSession(database.db, user.id);
    cookie = `${SESSION_COOKIE_NAME}=${session.rawToken}`;
    sent = [];
    client = {
      verifySignature: (raw, header) =>
        header === sign(raw, "app-secret"),
      parseInbound: (payload) => {
        const body = payload as {
          messages?: Array<{
            wamid: string;
            waId: string;
            text: string;
          }>;
        };
        return (body.messages ?? []).map((m) => ({
          wamid: m.wamid,
          waId: m.waId,
          text: m.text,
          profileName: null,
        }));
      },
      sendText: vi.fn(async (waId, body) => {
        sent.push({ waId, body });
      }),
    };
    orchestration = {
      createConversation: vi.fn().mockResolvedValue({
        conversation: {
          id: "conv_wa",
          title: "WhatsApp",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        userMessage: {
          id: "msg_u",
          role: "user",
          content: "draft",
          sequence: 1,
          createdAt: new Date().toISOString(),
        },
        assistantMessage: {
          id: "msg_a",
          role: "assistant",
          content: "Here is a draft.",
          sequence: 2,
          createdAt: new Date().toISOString(),
        },
        run: null,
        toolSummaries: [],
        reviewGroups: [
          {
            id: "review_1",
            conversationId: "conv_wa",
            drafts: [
              {
                id: "draft_1",
                platform: "threads",
                body: "Hello world",
                mediaUrls: [],
                mediaItems: [],
                selectedAccountId: null,
                revision: 1,
                status: "draft",
                validation: {
                  errors: [],
                  warnings: [],
                  validatedRevision: 1,
                },
                latestAttempt: null,
              },
            ],
          },
        ],
        turnActivity: null,
      }),
      addMessage: vi.fn(),
      createConversationStream: vi.fn(),
      addMessageStream: vi.fn(),
      listConversations: vi.fn(),
      getConversation: vi.fn(),
      deleteConversation: vi.fn(),
    } as unknown as OrchestrationService;
    review = {
      publishGroup: vi.fn().mockResolvedValue({
        groupId: "review_1",
        replayed: false,
        results: [
          {
            id: "attempt_1",
            draftId: "draft_1",
            platform: "threads",
            state: "succeeded",
            mcpPostId: "post_1",
            error: null,
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            authorizationKind: null,
          },
        ],
      }),
      updateDraft: vi.fn(),
      checkAttempt: vi.fn(),
    } as unknown as ReviewService;
    connectors = {
      list: vi.fn(),
      startConnect: vi.fn().mockResolvedValue({
        platform: "threads",
        authorizeUrl: "https://threads.net/oauth/authorize?x=1",
        expiresAt: "2026-08-09T16:00:00.000Z",
      }),
    };
    config = {
      enabled: true,
      appSecret: "app-secret",
      verifyToken: "verify-token",
      accessToken: "token",
      phoneNumberId: "phone_1",
      businessAccountId: null,
      apiVersion: "v21.0",
      publicWebOrigin: "http://localhost:3000",
    };
    app = createApp(database.db, orchestration, connectors, review, {
      config,
      client,
    });
  });

  it("requires a session for channel link APIs", async () => {
    const response = await app.request("/channels/whatsapp/link", {
      method: "POST",
    });
    expect(response.status).toBe(401);
  });

  it("creates a link challenge for the session user (AC-2)", async () => {
    const response = await app.request("/channels/whatsapp/link", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(body.deepLink).toContain("/app/settings/channels/whatsapp?token=");
    expect(body.waMeUrl).toContain("LINK%20");
  });

  it("rejects webhook verify with the wrong token (AC-7)", async () => {
    const bad = await app.request(
      "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=123",
    );
    expect(bad.status).toBe(403);

    const good = await app.request(
      "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=123",
    );
    expect(good.status).toBe(200);
    expect(await good.text()).toBe("123");
  });

  it("rejects inbound posts with a bad signature (AC-7)", async () => {
    const raw = JSON.stringify({ messages: [] });
    const response = await app.request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=bad" },
      body: raw,
    });
    expect(response.status).toBe(401);
  });

  it("replies with link instructions for unlinked senders and never orchestrates (AC-3)", async () => {
    const payload = {
      messages: [
        { wamid: "wamid_unlinked", waId: "15550009999", text: "hello" },
      ],
    };
    const raw = JSON.stringify(payload);
    const response = await app.request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(raw, "app-secret") },
      body: raw,
    });
    expect(response.status).toBe(200);
    expect(orchestration.createConversation).not.toHaveBeenCalled();
    expect(sent.some((m) => m.body.includes("not linked"))).toBe(true);
  });

  it("does not orchestrate when the channel flag is off (AC-9)", async () => {
    config.enabled = false;
    app = createApp(database.db, orchestration, connectors, review, {
      config,
      client,
    });
    const { rawToken } = await createWhatsappLinkChallenge(database.db, userId);
    await consumeWhatsappLinkChallenge(
      database.db,
      rawToken,
      "15550008888",
      null,
    );
    const payload = {
      messages: [
        { wamid: "wamid_disabled", waId: "15550008888", text: "draft please" },
      ],
    };
    const raw = JSON.stringify(payload);
    await app.request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(raw, "app-secret") },
      body: raw,
    });
    expect(orchestration.createConversation).not.toHaveBeenCalled();
    expect(sent.some((m) => m.body.includes("temporarily disabled"))).toBe(
      true,
    );
  });

  it("orchestrates linked inbound text with the resolved userId (AC-4)", async () => {
    const { rawToken } = await createWhatsappLinkChallenge(database.db, userId);
    await consumeWhatsappLinkChallenge(
      database.db,
      rawToken,
      "15550007777",
      null,
    );
    const payload = {
      messages: [
        { wamid: "wamid_linked", waId: "15550007777", text: "draft a post" },
      ],
    };
    const raw = JSON.stringify(payload);
    await app.request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(raw, "app-secret") },
      body: raw,
    });
    expect(orchestration.createConversation).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ message: "draft a post" }),
    );
    expect(sent.some((m) => m.body.includes("Here is a draft"))).toBe(true);
  });

  it("ignores duplicate wamid deliveries (AC-7)", async () => {
    const { rawToken } = await createWhatsappLinkChallenge(database.db, userId);
    await consumeWhatsappLinkChallenge(
      database.db,
      rawToken,
      "15550006666",
      null,
    );
    const payload = {
      messages: [
        { wamid: "wamid_dup", waId: "15550006666", text: "draft again" },
      ],
    };
    const raw = JSON.stringify(payload);
    const headers = { "x-hub-signature-256": sign(raw, "app-secret") };
    await app.request("/webhooks/whatsapp", { method: "POST", headers, body: raw });
    await app.request("/webhooks/whatsapp", { method: "POST", headers, body: raw });
    expect(orchestration.createConversation).toHaveBeenCalledTimes(1);
  });

  it("sends a browser authorize URL from connectors on CONNECT (AC-6)", async () => {
    const { rawToken } = await createWhatsappLinkChallenge(database.db, userId);
    await consumeWhatsappLinkChallenge(
      database.db,
      rawToken,
      "15550005555",
      null,
    );
    const payload = {
      messages: [
        {
          wamid: "wamid_connect",
          waId: "15550005555",
          text: "CONNECT threads",
        },
      ],
    };
    const raw = JSON.stringify(payload);
    await app.request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(raw, "app-secret") },
      body: raw,
    });
    expect(connectors.startConnect).toHaveBeenCalledWith(userId, "threads");
    expect(
      sent.some((m) =>
        m.body.includes("https://threads.net/oauth/authorize?x=1"),
      ),
    ).toBe(true);
    expect(orchestration.createConversation).not.toHaveBeenCalled();
  });

  it("APPROVE calls trusted ReviewService.publishGroup (AC-5, AC-10)", async () => {
    const { rawToken } = await createWhatsappLinkChallenge(database.db, userId);
    await consumeWhatsappLinkChallenge(
      database.db,
      rawToken,
      "15550004444",
      null,
    );
    const identity = await getActiveChannelIdentityForUser(
      database.db,
      userId,
      "whatsapp",
    );
    expect(identity).not.toBeNull();

    const turn = await createConversationTurn(database.db, {
      userId,
      title: "WhatsApp",
      content: "draft please",
      requestId: "wa-req-approve-1",
      assistantContent: "draft ready",
    });
    await setConversationSource(database.db, turn.conversation.id, "whatsapp");
    const drafts = await createReviewGroup(database.db, {
      userId,
      conversationId: turn.conversation.id,
      variants: [
        {
          platform: "threads",
          body: "Ship it",
          mediaUrls: [],
        },
      ],
    });
    const groupId = drafts[0]!.reviewGroupId!;
    await replacePendingApproveAction(
      database.db,
      identity!.id,
      groupId,
      "threads: Ship it",
    );

    const payload = {
      messages: [
        { wamid: "wamid_approve", waId: "15550004444", text: "APPROVE" },
      ],
    };
    const raw = JSON.stringify(payload);
    await app.request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(raw, "app-secret") },
      body: raw,
    });

    expect(review.publishGroup).toHaveBeenCalledWith(
      userId,
      groupId,
      expect.objectContaining({
        drafts: [{ draftId: drafts[0]!.id, expectedRevision: drafts[0]!.revision }],
      }),
    );
    expect(sent.some((m) => m.body.includes("Publish result"))).toBe(true);
  });
});
