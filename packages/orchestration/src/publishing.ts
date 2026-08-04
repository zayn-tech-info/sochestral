import {
  expirePublishingConsent,
  getPublishingPreference,
  PublishingDatabaseError,
  updatePublishingPreference,
  type Database,
  type PublishingAuthoritySource,
  type PublishingMode,
} from "@sochestral/database";

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

export function hasExplicitLivePublishIntent(message: string): boolean {
  const value = message.trim().toLowerCase().replace(/\s+/g, " ");
  if (!value || /\b(?:don't|do not|never|not yet|without publishing|no publish)\b/.test(value)) return false;
  if (/\b(?:draft|write|preview|validate|check|edit|revise)\b/.test(value)) return false;
  if (/^(?:can|could|would|should)\b/.test(value) && value.endsWith("?")) return false;
  return (
    /\bpublish(?: it| this| that| now)?\b/.test(value) ||
    /\bpost (?:it|this|that)(?: now)?\b/.test(value) ||
    /\bshare (?:it|this|that)(?: now)?\b/.test(value) ||
    /\bsend (?:it|this|that) live\b/.test(value) ||
    /\bgo live (?:with )?(?:it|this|that)\b/.test(value)
  );
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

  async snapshot(userId: string, message: string): Promise<PublishingAuthoritySnapshot> {
    const preference = await this.get(userId);
    return {
      mode: preference.effectiveMode,
      consentVersion: preference.effectiveMode === "full_access" ? preference.consentVersion : null,
      authorityEventId: preference.authorityEventId,
      explicitLiveIntent: hasExplicitLivePublishIntent(message),
    };
  }
}
