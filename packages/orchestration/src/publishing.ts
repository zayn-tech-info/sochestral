import {
  expirePublishingConsent,
  getPublishingPreference,
  PublishingDatabaseError,
  updatePublishingPreference,
  type Database,
  type PublishingAuthoritySource,
  type PublishingMode,
} from "@sochestral/database";
import type { ModelProvider, ModelTool } from "./model.js";

export const DEFAULT_PUBLISHING_CONSENT_VERSION = "2026-08-01";

export type PublicPublishingPreference = {
  currentMode: PublishingMode;
  effectiveMode: PublishingMode;
  revision: number;
  consentVersion: string | null;
  consentedAt: string | null;
  consentCurrent: boolean;
  policyVersion: string;
  enabled: boolean;
  authorityEventId: string | null;
};

export type PublishingAuthoritySnapshot = {
  mode: PublishingMode;
  consentVersion: string | null;
  authorityEventId: string | null;
  explicitLiveIntent: boolean;
};

export class PublishingPreferenceError extends Error {
  constructor(
    readonly code: "INVALID_PREFERENCE" | "STALE_REVISION" | "INVALID_CONSENT",
    readonly status: 409 | 422,
  ) {
    super(code);
    this.name = "PublishingPreferenceError";
  }
}

function enabledFromEnvironment(): boolean {
  return process.env.PUBLISHING_AUTHORITY_ENABLED === "true";
}

function consentVersionFromEnvironment(): string {
  return process.env.PUBLISHING_CONSENT_VERSION?.trim() || DEFAULT_PUBLISHING_CONSENT_VERSION;
}

export const LIVE_PUBLISH_INTENT_TOOL_NAME = "resolve_live_publish_intent";

export const LIVE_PUBLISH_INTENT_TOOL: ModelTool = {
  name: LIVE_PUBLISH_INTENT_TOOL_NAME,
  description:
    "Decide whether the user message is an explicit instruction to publish content live right now.",
  inputSchema: {
    type: "object",
    properties: {
      explicitLivePublish: {
        type: "boolean",
        description:
          "True only when the user clearly instructs publishing live now. False for drafts, previews, validation, edits, questions, negation, or ambiguous wording.",
      },
    },
    required: ["explicitLivePublish"],
    additionalProperties: false,
  },
};

export const LIVE_PUBLISH_INTENT_SYSTEM =
  "You classify whether a user message is an explicit instruction to publish content live right now. " +
  "Call resolve_live_publish_intent once. Set explicitLivePublish true only for clear affirmative live publish instructions. " +
  "Set it false for drafts, previews, validation, edits, questions, negation, ambiguous confirmations, or anything that does not clearly authorize going live. " +
  "Judge only the supplied user message. Do not invent missing context.";

function modeNeedsLiveIntent(mode: PublishingMode): boolean {
  return mode === "approve_for_me" || mode === "full_access";
}

export async function resolveExplicitLivePublishIntent(
  model: ModelProvider,
  input: { message: string; modelName: string },
): Promise<boolean> {
  const message = input.message.trim();
  if (!message) return false;
  try {
    const result = await model.complete({
      system: LIVE_PUBLISH_INTENT_SYSTEM,
      messages: [{ role: "user", content: [{ type: "text", text: message }] }],
      tools: [LIVE_PUBLISH_INTENT_TOOL],
      toolChoice: { type: "tool", name: LIVE_PUBLISH_INTENT_TOOL_NAME },
      model: input.modelName,
      maxTokens: 64,
    });
    const call = result.toolCalls.find(
      (toolCall) => toolCall.name === LIVE_PUBLISH_INTENT_TOOL_NAME,
    );
    if (!call || typeof call.input !== "object" || call.input === null) {
      return false;
    }
    return (
      (call.input as { explicitLivePublish?: unknown }).explicitLivePublish ===
      true
    );
  } catch {
    return false;
  }
}

export class PublishingPreferenceService {
  constructor(private readonly db: Database["db"]) {}

  async get(userId: string): Promise<PublicPublishingPreference> {
    const policyVersion = consentVersionFromEnvironment();
    const enabled = enabledFromEnvironment();
    let record = await getPublishingPreference(this.db, userId);
    if (record.mode === "full_access" && record.consentVersion !== policyVersion) {
      record = await expirePublishingConsent(this.db, userId, policyVersion);
    }
    const consentCurrent = record.mode === "full_access" && record.consentVersion === policyVersion;
    return {
      currentMode: record.mode,
      effectiveMode: enabled && (record.mode !== "full_access" || consentCurrent)
        ? record.mode
        : "always_draft",
      revision: record.revision,
      consentVersion: record.consentVersion,
      consentedAt: record.consentedAt?.toISOString() ?? null,
      consentCurrent,
      policyVersion,
      enabled,
      authorityEventId: record.authorityEventId,
    };
  }

  async update(
    userId: string,
    input: {
      expectedRevision: number;
      mode: PublishingMode;
      source: PublishingAuthoritySource;
      acknowledged: boolean;
      consentVersion: string | null;
    },
  ): Promise<PublicPublishingPreference> {
    if (
      !Number.isInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      !["always_draft", "approve_for_me", "full_access"].includes(input.mode) ||
      !["composer", "settings"].includes(input.source)
    ) {
      throw new PublishingPreferenceError("INVALID_PREFERENCE", 422);
    }
    try {
      await updatePublishingPreference(this.db, {
        userId,
        expectedRevision: input.expectedRevision,
        mode: input.mode,
        source: input.source,
        currentConsentVersion: consentVersionFromEnvironment(),
        acknowledged: input.acknowledged,
        consentVersion: input.consentVersion,
      });
    } catch (error) {
      if (error instanceof PublishingDatabaseError) {
        if (error.code === "PREFERENCE_STALE") {
          throw new PublishingPreferenceError("STALE_REVISION", 409);
        }
        if (error.code === "INVALID_CONSENT") {
          throw new PublishingPreferenceError("INVALID_CONSENT", 409);
        }
      }
      throw error;
    }
    return this.get(userId);
  }

  async snapshot(
    userId: string,
    message: string,
    resolveIntent?: (message: string) => Promise<boolean>,
  ): Promise<PublishingAuthoritySnapshot> {
    const preference = await this.get(userId);
    const explicitLiveIntent =
      modeNeedsLiveIntent(preference.effectiveMode) && resolveIntent
        ? await resolveIntent(message)
        : false;
    return {
      mode: preference.effectiveMode,
      consentVersion: preference.effectiveMode === "full_access" ? preference.consentVersion : null,
      authorityEventId: preference.authorityEventId,
      explicitLiveIntent,
    };
  }
}
