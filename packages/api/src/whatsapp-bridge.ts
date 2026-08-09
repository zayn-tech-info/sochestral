import { randomUUID } from "node:crypto";
import {
  claimWhatsappInboundReceipt,
  consumePendingApproveAction,
  consumeWhatsappLinkChallenge,
  DatabaseError,
  findWhatsappConversation,
  getActiveChannelIdentity,
  getOpenPendingApproveAction,
  isWithinCareWindow,
  replacePendingApproveAction,
  setConversationSource,
  touchChannelInbound,
  type ChannelIdentity,
  type Database,
} from "@sochestral/database";
import {
  getPublicReviewGroups,
  type ConnectorService,
  type OrchestrationService,
  type PublicReviewGroup,
  type ReviewService,
} from "@sochestral/orchestration";
import type { WhatsAppClient } from "./whatsapp-client.js";
import type { WhatsAppConfig } from "./whatsapp-config.js";

const UNLINKED_REPLY =
  "This WhatsApp number is not linked to Sochestral yet. Sign in on the web, open Settings → Channels, start a WhatsApp link, then send the LINK message from that screen.";
const DISABLED_REPLY =
  "WhatsApp chat is temporarily disabled on this Sochestral environment. Use the web app for now.";
const LINKED_REPLY =
  "Linked. You can draft, approve, and check publish status here. Reply APPROVE to publish a pending draft, or STATUS for the latest result.";
const WORKING_REPLY = "Working on that…";

function summarizeGroup(group: PublicReviewGroup): string {
  const parts = group.drafts.map((draft) => {
    const body = draft.body.trim();
    const clipped = body.length > 280 ? `${body.slice(0, 277)}...` : body;
    return `${draft.platform}: ${clipped || "(empty draft)"}`;
  });
  return parts.join("\n\n");
}

function parseLinkToken(text: string): string | null {
  const match = text.trim().match(/^LINK\s+(\S+)/i);
  return match?.[1] ?? null;
}

function isApproveCommand(text: string): boolean {
  return /^(APPROVE|YES)$/i.test(text.trim());
}

function isStatusCommand(text: string): boolean {
  return /^STATUS$/i.test(text.trim());
}

function parseConnectPlatform(text: string): string | null {
  const match = text
    .trim()
    .match(/^CONNECT\s+(threads|linkedin|linkedin_personal|instagram)\b/i);
  if (!match) return null;
  const platform = match[1]!.toLowerCase();
  return platform === "linkedin" ? "linkedin_personal" : platform;
}

export type WhatsAppBridgeDeps = {
  db: Database["db"];
  config: WhatsAppConfig;
  client: WhatsAppClient;
  getOrchestration: () => OrchestrationService;
  getReview: () => ReviewService;
  getConnectors: () => ConnectorService;
};

export class WhatsAppBridge {
  constructor(private readonly deps: WhatsAppBridgeDeps) {}

  async handleInboundText(input: {
    wamid: string;
    waId: string;
    text: string;
    profileName: string | null;
  }): Promise<void> {
    const identity = await getActiveChannelIdentity(
      this.deps.db,
      "whatsapp",
      input.waId,
    );
    const claimed = await claimWhatsappInboundReceipt(
      this.deps.db,
      input.wamid,
      identity?.id ?? null,
    );
    if (!claimed) return;

    if (!this.deps.config.enabled) {
      await this.safeSend(input.waId, DISABLED_REPLY);
      return;
    }

    const linkToken = parseLinkToken(input.text);
    if (linkToken) {
      await this.handleLink(input.waId, linkToken, input.profileName);
      return;
    }

    if (!identity) {
      await this.safeSend(input.waId, UNLINKED_REPLY);
      return;
    }

    await touchChannelInbound(this.deps.db, identity.id);
    const refreshed = {
      ...identity,
      lastInboundAt: new Date(),
    };

    await this.flushPendingStatus(refreshed);

    if (isApproveCommand(input.text)) {
      await this.handleApprove(refreshed);
      return;
    }
    if (isStatusCommand(input.text)) {
      await this.handleStatus(refreshed);
      return;
    }
    const connectPlatform = parseConnectPlatform(input.text);
    if (connectPlatform) {
      await this.handleConnect(refreshed, connectPlatform);
      return;
    }

    await this.handleOrchestration(refreshed, input.text);
  }

  private async handleLink(
    waId: string,
    rawToken: string,
    profileName: string | null,
  ): Promise<void> {
    try {
      await consumeWhatsappLinkChallenge(
        this.deps.db,
        rawToken,
        waId,
        profileName,
      );
      await this.safeSend(waId, LINKED_REPLY);
    } catch (error) {
      if (error instanceof DatabaseError) {
        await this.safeSend(
          waId,
          "That link code is invalid or expired. Start a new WhatsApp link from Settings → Channels.",
        );
        return;
      }
      throw error;
    }
  }

  private async handleOrchestration(
    identity: ChannelIdentity,
    text: string,
  ): Promise<void> {
    await this.safeSend(identity.externalId, WORKING_REPLY);
    const existing = await findWhatsappConversation(
      this.deps.db,
      identity.userId,
    );
    const orchestration = this.deps.getOrchestration();
    const requestId = `wa_${randomUUID()}`;
    const turn = existing
      ? await orchestration.addMessage(identity.userId, existing.id, {
          message: text,
          requestId,
        })
      : await orchestration.createConversation(identity.userId, {
          message: text,
          requestId,
        });

    if (!existing) {
      await setConversationSource(
        this.deps.db,
        turn.conversation.id,
        "whatsapp",
      );
    }

    const pendingGroup = turn.reviewGroups[0];
    if (pendingGroup) {
      const summary = summarizeGroup(pendingGroup);
      await replacePendingApproveAction(
        this.deps.db,
        identity.id,
        pendingGroup.id,
        summary,
      );
      await this.replyInCareWindow(
        identity,
        `${turn.assistantMessage.content}\n\nPending draft:\n${summary}\n\nReply APPROVE to publish, or send edits in plain language.`,
      );
      return;
    }

    await this.replyInCareWindow(identity, turn.assistantMessage.content);
  }

  private async handleApprove(identity: ChannelIdentity): Promise<void> {
    const pending = await getOpenPendingApproveAction(
      this.deps.db,
      identity.id,
    );
    if (!pending) {
      await this.replyInCareWindow(
        identity,
        "There is no pending draft to approve. Ask for a draft first.",
      );
      return;
    }

    const conversation = await findWhatsappConversation(
      this.deps.db,
      identity.userId,
    );
    if (!conversation) {
      await this.replyInCareWindow(
        identity,
        "No WhatsApp conversation found for that draft.",
      );
      return;
    }

    const groups = await getPublicReviewGroups(
      this.deps.db,
      identity.userId,
      conversation.id,
    );
    const group = groups.find((item) => item.id === pending.groupId);
    if (!group) {
      await consumePendingApproveAction(this.deps.db, pending.id);
      await this.replyInCareWindow(
        identity,
        "That draft is no longer available. Ask for a new draft.",
      );
      return;
    }

    const consumed = await consumePendingApproveAction(
      this.deps.db,
      pending.id,
    );
    if (!consumed) {
      await this.replyInCareWindow(
        identity,
        "That approval was already handled.",
      );
      return;
    }

    try {
      const result = await this.deps.getReview().publishGroup(
        identity.userId,
        group.id,
        {
          requestId: `wa_approve_${randomUUID()}`,
          drafts: group.drafts.map((draft) => ({
            draftId: draft.id,
            expectedRevision: draft.revision,
          })),
        },
      );
      const lines = result.results.map((attempt) => {
        if (attempt.state === "succeeded") {
          return `${attempt.platform}: published${attempt.mcpPostId ? ` (${attempt.mcpPostId})` : ""}`;
        }
        return `${attempt.platform}: ${attempt.state}${
          attempt.error?.message ? ` — ${attempt.error.message}` : ""
        }`;
      });
      await this.replyInCareWindow(
        identity,
        lines.length > 0
          ? `Publish result:\n${lines.join("\n")}`
          : "Publish finished with no attempt rows.",
      );
    } catch (error) {
      const code =
        typeof error === "object" &&
        error &&
        "code" in error &&
        typeof (error as { code: unknown }).code === "string"
          ? (error as { code: string }).code
          : "PUBLISH_FAILED";
      await this.replyInCareWindow(
        identity,
        `Could not publish (${code}). Fix the draft or connectors, then try again.`,
      );
    }
  }

  private async handleStatus(identity: ChannelIdentity): Promise<void> {
    const text = await this.statusText(identity.userId);
    await this.replyInCareWindow(identity, text);
  }

  private async handleConnect(
    identity: ChannelIdentity,
    platform: string,
  ): Promise<void> {
    try {
      const started = await this.deps
        .getConnectors()
        .startConnect(identity.userId, platform);
      await this.replyInCareWindow(
        identity,
        `Open this link in a browser to connect ${platform}:\n${started.authorizeUrl}`,
      );
    } catch (error) {
      const code =
        typeof error === "object" &&
        error &&
        "code" in error &&
        typeof (error as { code: unknown }).code === "string"
          ? (error as { code: string }).code
          : "CONNECT_FAILED";
      await this.replyInCareWindow(
        identity,
        `Could not start connect (${code}). Try again from Settings → Connected Accounts.`,
      );
    }
  }

  private async flushPendingStatus(identity: ChannelIdentity): Promise<void> {
    // v1: status flush is available via STATUS / next inbound status ask.
    // Care-window replies for publish already go out when APPROVE completes.
    void identity;
  }

  private async statusText(userId: string): Promise<string> {
    const conversation = await findWhatsappConversation(this.deps.db, userId);
    if (!conversation) {
      return "No WhatsApp drafts yet. Send a draft request to start.";
    }
    const groups = await getPublicReviewGroups(
      this.deps.db,
      userId,
      conversation.id,
    );
    if (groups.length === 0) {
      return "No review groups on your WhatsApp conversation yet.";
    }
    const lines: string[] = [];
    for (const group of groups.slice(0, 3)) {
      for (const draft of group.drafts) {
        const attempt = draft.latestAttempt;
        if (!attempt) {
          lines.push(`${draft.platform}: draft ready (not published)`);
          continue;
        }
        if (attempt.state === "succeeded") {
          lines.push(
            `${draft.platform}: published${attempt.mcpPostId ? ` (${attempt.mcpPostId})` : ""}`,
          );
        } else {
          lines.push(
            `${draft.platform}: ${attempt.state}${
              attempt.error?.message ? ` — ${attempt.error.message}` : ""
            }`,
          );
        }
      }
    }
    return lines.length > 0
      ? `Latest status:\n${lines.join("\n")}`
      : "No publish attempts yet.";
  }

  private async replyInCareWindow(
    identity: ChannelIdentity,
    body: string,
  ): Promise<void> {
    if (!isWithinCareWindow(identity)) {
      console.warn("[sochestral:whatsapp] care window closed; skip outbound", {
        identityId: identity.id,
      });
      return;
    }
    await this.safeSend(identity.externalId, body);
  }

  private async safeSend(waId: string, body: string): Promise<void> {
    try {
      await this.deps.client.sendText(waId, body);
    } catch (error) {
      console.error("[sochestral:whatsapp] outbound send failed", {
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
}
