import { createHash } from "node:crypto";
import {
  createPublishAttempts,
  createReviewGroup,
  finishPublishAttempt,
  getOwnedPublishAttempt,
  getOwnedReviewDraft,
  listConversationReviewData,
  listDraftMediaItems,
  listOwnedAttemptsByApprovalRequestId,
  listOwnedReviewGroup,
  replaceDraftValidation,
  ReviewDatabaseError,
  updateOwnedReviewDraft,
  type Database,
  type Draft,
  type DraftPublishAttempt,
  type TargetPlatform,
} from "@sochestral/database";
import type { ConnectorService, PublicConnectorAccount } from "./connectors.js";
import type { SocialMcpGateway } from "./mcp.js";
import { safeToolSummary } from "./tools.js";

export type PublicReviewAttempt = {
  id: string;
  draftId: string;
  platform: string;
  state: "publishing" | "succeeded" | "failed" | "unknown";
  mcpPostId: string | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  completedAt: string | null;
  authorizationKind: "manual" | "approve_for_me" | "full_access";
};

export type PublicReviewDraft = {
  id: string;
  platform: "threads" | "linkedin_personal" | "instagram";
  body: string;
  mediaUrls: string[];
  mediaItems: Array<{ assetId: string | null; externalUrl: string | null }>;
  selectedAccountId: string | null;
  revision: number;
  status: string;
  validation: { errors: string[]; warnings: string[]; validatedRevision: number | null };
  latestAttempt: PublicReviewAttempt | null;
};

export type PublicReviewGroup = {
  id: string;
  conversationId: string;
  drafts: PublicReviewDraft[];
};

export class ReviewError extends Error {
  constructor(
    readonly code:
      | "REVIEW_NOT_FOUND"
      | "INVALID_REVIEW_INPUT"
      | "STALE_REVISION"
      | "DRAFT_LOCKED"
      | "PUBLISH_IN_PROGRESS"
      | "PREFLIGHT_FAILED"
      | "PUBLISH_RATE_LIMIT"
      | "SOCIALMCP_UNAVAILABLE",
    readonly status: 404 | 409 | 422 | 429 | 502,
    message = code,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof ReviewDatabaseError) {
    if (error.code === "REVIEW_NOT_FOUND") {
      throw new ReviewError("REVIEW_NOT_FOUND", 404);
    }
    if (error.code === "PUBLISH_RATE_LIMIT") {
      throw new ReviewError("PUBLISH_RATE_LIMIT", 429);
    }
    if (error.code === "STALE_REVISION") {
      throw new ReviewError("STALE_REVISION", 409);
    }
    if (error.code === "DRAFT_LOCKED") {
      throw new ReviewError("DRAFT_LOCKED", 409);
    }
    throw new ReviewError("PUBLISH_IN_PROGRESS", 409);
  }
  throw error;
}

function publicAttempt(row: DraftPublishAttempt): PublicReviewAttempt {
  return {
    id: row.id,
    draftId: row.draftId,
    platform: row.platform,
    state: row.status as PublicReviewAttempt["state"],
    mcpPostId: row.mcpPostId,
    error:
      row.safeErrorCode
        ? {
            code: row.safeErrorCode,
            message: row.safeErrorMessage ?? "The platform could not complete this post.",
          }
        : null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    authorizationKind: row.authorizationKind as PublicReviewAttempt["authorizationKind"],
  };
}

function publicDraft(
  row: Draft,
  latestAttempt: DraftPublishAttempt | undefined,
  mediaItems: Array<{ assetId: string | null; externalUrl: string | null }> = [],
): PublicReviewDraft {
  return {
    id: row.id,
    platform: row.platform as PublicReviewDraft["platform"],
    body: row.body,
    mediaUrls: row.mediaUrls,
    mediaItems:
      mediaItems.length > 0
        ? mediaItems
        : row.mediaUrls.map((externalUrl) => ({ assetId: null, externalUrl })),
    selectedAccountId: row.selectedAccountId,
    revision: row.revision,
    status: row.status,
    validation: {
      errors: row.validationErrors,
      warnings: row.validationWarnings,
      validatedRevision: row.validatedRevision,
    },
    latestAttempt: latestAttempt ? publicAttempt(latestAttempt) : null,
  };
}

export async function getPublicReviewGroups(
  db: Database["db"],
  userId: string,
  conversationId: string,
): Promise<PublicReviewGroup[]> {
  const data = await listConversationReviewData(db, userId, conversationId);
  const latestByDraft = new Map<string, DraftPublishAttempt>();
  for (const attempt of data.attempts) {
    if (!latestByDraft.has(attempt.draftId)) latestByDraft.set(attempt.draftId, attempt);
  }
  const groups = new Map<string, PublicReviewGroup>();
  const mediaByDraft = new Map<string, typeof data.media>();
  for (const item of data.media) {
    const current = mediaByDraft.get(item.draftId) ?? [];
    current.push(item);
    mediaByDraft.set(item.draftId, current);
  }
  for (const draft of data.drafts) {
    if (!draft.reviewGroupId || !draft.conversationId) continue;
    const group = groups.get(draft.reviewGroupId) ?? {
      id: draft.reviewGroupId,
      conversationId: draft.conversationId,
      drafts: [],
    };
    group.drafts.push(
      publicDraft(
        draft,
        latestByDraft.get(draft.id),
        (mediaByDraft.get(draft.id) ?? []).map((item) => ({
          assetId: item.assetId,
          externalUrl: item.externalUrl,
        })),
      ),
    );
    groups.set(group.id, group);
  }
  return [...groups.values()];
}

function normalizeBody(value: string): string {
  return value.trim();
}

function validateProductInput(
  platform: string,
  bodyValue: string,
  mediaUrlsValue: string[],
  mediaAssetCount = 0,
): { body: string; mediaUrls: string[]; errors: string[] } {
  const body = normalizeBody(bodyValue);
  if (body.length > 8000 || mediaUrlsValue.length > 5) {
    throw new ReviewError("INVALID_REVIEW_INPUT", 422);
  }
  const mediaUrls = mediaUrlsValue.map((value) => value.trim()).filter(Boolean);
  if (mediaUrls.length !== mediaUrlsValue.length) {
    throw new ReviewError("INVALID_REVIEW_INPUT", 422);
  }
  for (const raw of mediaUrls) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ReviewError("INVALID_REVIEW_INPUT", 422);
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new ReviewError("INVALID_REVIEW_INPUT", 422);
    }
  }
  const errors: string[] = [];
  if (!body && mediaUrls.length === 0 && mediaAssetCount === 0) {
    errors.push("Add post text or media.");
  }
  if (platform === "instagram" && mediaUrls.length === 0 && mediaAssetCount === 0) {
    errors.push("Instagram requires at least one image.");
  }
  return { body, mediaUrls, errors };
}

function messagesFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return [entry.slice(0, 240)];
    if (typeof entry === "object" && entry !== null) {
      const record = entry as Record<string, unknown>;
      const message = record.message ?? record.code;
      return typeof message === "string" ? [message.slice(0, 240)] : [];
    }
    return [];
  });
}

function connectedAccountsFor(
  accounts: PublicConnectorAccount[],
): PublicConnectorAccount[] {
  return accounts.filter((account) => account.state === "connected");
}

function newestConnectedAccount(
  accounts: PublicConnectorAccount[],
): PublicConnectorAccount | undefined {
  return [...connectedAccountsFor(accounts)].sort((left, right) => {
    const time = (right.connectedAt ? Date.parse(right.connectedAt) : 0) -
      (left.connectedAt ? Date.parse(left.connectedAt) : 0);
    return time || left.id.localeCompare(right.id);
  })[0];
}

export interface ReviewService {
  updateDraft(userId: string, draftId: string, input: {
    expectedRevision: number;
    body: string;
    mediaUrls: string[];
    mediaItems?: Array<{ assetId: string | null; externalUrl: string | null }>;
    selectedAccountId: string | null;
  }): Promise<{ draft: PublicReviewDraft; eligibleAccounts: PublicConnectorAccount[] }>;
  publishGroup(userId: string, groupId: string, input: {
    requestId: string;
    drafts: Array<{ draftId: string; expectedRevision: number }>;
    authorization?: {
      kind: "approve_for_me" | "full_access";
      triggeringMessageId: string;
      consentVersion: string | null;
      warningsBlock: boolean;
    };
  }): Promise<{ groupId: string; replayed: boolean; results: PublicReviewAttempt[] }>;
  checkAttempt(userId: string, attemptId: string): Promise<PublicReviewAttempt>;
}

export interface ReviewMediaService {
  publishUrl(userId: string, assetId: string): Promise<string>;
}

export class DefaultReviewService implements ReviewService {
  constructor(
    private readonly db: Database["db"],
    private readonly connectors: ConnectorService,
    private readonly mcp: SocialMcpGateway,
    private readonly hourlyLimit = 20,
    private readonly media?: ReviewMediaService,
  ) {}

  private async resolvedMediaUrls(userId: string, draft: Draft): Promise<string[]> {
    const items = await listDraftMediaItems(this.db, [draft.id]);
    if (items.length === 0) return draft.mediaUrls;
    return Promise.all(
      items.map(async (item) => {
        if (item.externalUrl) return item.externalUrl;
        if (item.assetId && this.media) return this.media.publishUrl(userId, item.assetId);
        throw new ReviewError("INVALID_REVIEW_INPUT", 422);
      }),
    );
  }

  private async eligibleAccounts(userId: string, platform: string) {
    const list = await this.connectors.list(userId).catch(() => {
      throw new ReviewError("SOCIALMCP_UNAVAILABLE", 502);
    });
    const connector = list.connectors.find((item) => item.platform === platform);
    return connectedAccountsFor(connector?.accounts ?? []);
  }

  private async validation(
    userId: string,
    draft: Pick<Draft, "platform" | "body" | "mediaUrls" | "selectedAccountId">,
    automaticAccountSelection = false,
  ): Promise<{ errors: string[]; warnings: string[]; accounts: PublicConnectorAccount[] }> {
    const local = validateProductInput(draft.platform, draft.body, draft.mediaUrls);
    const accounts = await this.eligibleAccounts(userId, draft.platform);
    const errors = [...local.errors];
    if (accounts.length === 0) errors.push(`Connect an active ${draft.platform} account first.`);
    if (!draft.selectedAccountId && accounts.length > 1 && !automaticAccountSelection) {
      errors.push("Choose the destination account.");
    }
    if (
      draft.selectedAccountId &&
      !accounts.some((account) => account.id === draft.selectedAccountId)
    ) {
      errors.push("Choose an active account you own.");
    }
    const selectedAccountId =
      draft.selectedAccountId ??
      (automaticAccountSelection
        ? newestConnectedAccount(accounts)?.id
        : accounts.length === 1
          ? accounts[0]!.id
          : undefined);
    if (errors.length > 0) return { errors, warnings: [], accounts };
    try {
      const result = await this.mcp.callTool({
        userId,
        name: "validate_post",
        arguments: {
          platforms: [draft.platform],
          text: local.body,
          connectedAccountId: selectedAccountId,
          options: { mediaUrls: local.mediaUrls },
        },
      });
      const summary = safeToolSummary("validate_post", result.value);
      return {
        errors: summary.valid === true ? [] : messagesFrom(summary.errors),
        warnings: messagesFrom(summary.warnings),
        accounts,
      };
    } catch {
      throw new ReviewError("SOCIALMCP_UNAVAILABLE", 502);
    }
  }

  async updateDraft(userId: string, draftId: string, input: {
    expectedRevision: number;
    body: string;
    mediaUrls: string[];
    mediaItems?: Array<{ assetId: string | null; externalUrl: string | null }>;
    selectedAccountId: string | null;
  }) {
    const current = await getOwnedReviewDraft(this.db, userId, draftId);
    if (!current?.reviewGroupId) throw new ReviewError("REVIEW_NOT_FOUND", 404);
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new ReviewError("INVALID_REVIEW_INPUT", 422);
    }
    if (current.revision !== input.expectedRevision) {
      throw new ReviewError("STALE_REVISION", 409);
    }
    if (current.status === "published" || current.status === "unknown") {
      throw new ReviewError("DRAFT_LOCKED", 409);
    }
    const mediaItems = input.mediaItems ?? input.mediaUrls.map((externalUrl) => ({
      assetId: null,
      externalUrl,
    }));
    if (
      mediaItems.length > 5 ||
      mediaItems.some((item) => Boolean(item.assetId) === Boolean(item.externalUrl))
    ) {
      throw new ReviewError("INVALID_REVIEW_INPUT", 422);
    }
    const resolvedMediaUrls = await Promise.all(
      mediaItems.map(async (item) => {
        if (item.externalUrl) return item.externalUrl;
        if (item.assetId && this.media) return this.media.publishUrl(userId, item.assetId);
        throw new ReviewError("INVALID_REVIEW_INPUT", 422);
      }),
    );
    const product = validateProductInput(current.platform, input.body, resolvedMediaUrls);
    const accounts = await this.eligibleAccounts(userId, current.platform);
    const selectedAccountId =
      input.selectedAccountId ?? (accounts.length === 1 ? accounts[0]!.id : null);
    const validation = await this.validation(userId, {
      platform: current.platform,
      body: product.body,
      mediaUrls: product.mediaUrls,
      selectedAccountId,
    });
    try {
      const updated = await updateOwnedReviewDraft(this.db, {
        userId,
        draftId,
        expectedRevision: input.expectedRevision,
        body: product.body,
        mediaUrls: mediaItems.flatMap((item) => item.externalUrl ? [item.externalUrl] : []),
        mediaItems,
        selectedAccountId,
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
      });
      return { draft: publicDraft(updated, undefined, mediaItems), eligibleAccounts: accounts };
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async publishGroup(userId: string, groupId: string, input: {
    requestId: string;
    drafts: Array<{ draftId: string; expectedRevision: number }>;
    authorization?: {
      kind: "approve_for_me" | "full_access";
      triggeringMessageId: string;
      consentVersion: string | null;
      warningsBlock: boolean;
    };
  }) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) {
      throw new ReviewError("INVALID_REVIEW_INPUT", 422);
    }
    const group = await listOwnedReviewGroup(this.db, userId, groupId);
    if (group.length === 0) throw new ReviewError("REVIEW_NOT_FOUND", 404);
    const replay = await listOwnedAttemptsByApprovalRequestId(
      this.db,
      userId,
      input.requestId,
    );
    if (replay.length > 0) {
      const groupDraftIds = new Set(group.map((draft) => draft.id));
      if (replay.some((attempt) => !groupDraftIds.has(attempt.draftId))) {
        throw new ReviewError("PUBLISH_IN_PROGRESS", 409);
      }
      return { groupId, replayed: true, results: replay.map(publicAttempt) };
    }
    if (
      input.drafts.length === 0 ||
      input.drafts.some(
        (entry) =>
          !entry.draftId ||
          !Number.isInteger(entry.expectedRevision) ||
          entry.expectedRevision < 1,
      )
    ) {
      throw new ReviewError("INVALID_REVIEW_INPUT", 422);
    }
    const expected = new Map(input.drafts.map((entry) => [entry.draftId, entry.expectedRevision]));
    if (expected.size !== group.length || group.some((draft) => expected.get(draft.id) !== draft.revision)) {
      throw new ReviewError("STALE_REVISION", 409);
    }
    if (group.some((draft) => draft.status === "unknown")) {
      throw new ReviewError("DRAFT_LOCKED", 409);
    }
    const candidates = group.filter((draft) => draft.status !== "published");
    if (candidates.length === 0) throw new ReviewError("DRAFT_LOCKED", 409);
    const validated: Draft[] = [];
    let hasErrors = false;
    for (const draft of candidates) {
      const mediaItems = await listDraftMediaItems(this.db, [draft.id]);
      const mediaUrls = await this.resolvedMediaUrls(userId, draft);
      const validation = await this.validation(
        userId,
        { ...draft, mediaUrls },
        Boolean(input.authorization),
      );
      const selectedAccountId =
        draft.selectedAccountId ??
        (input.authorization
          ? newestConnectedAccount(validation.accounts)?.id ?? null
          : validation.accounts.length === 1
            ? validation.accounts[0]!.id
            : null);
      const updated = await updateOwnedReviewDraft(this.db, {
        userId,
        draftId: draft.id,
        expectedRevision: draft.revision,
        body: draft.body,
        mediaUrls: draft.mediaUrls,
        mediaItems: mediaItems.length > 0
          ? mediaItems.map((item) => ({
              assetId: item.assetId,
              externalUrl: item.externalUrl,
            }))
          : draft.mediaUrls.map((externalUrl) => ({ assetId: null, externalUrl })),
        selectedAccountId,
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
      });
      validated.push(updated);
      updated.mediaUrls = mediaUrls;
      if (validation.errors.length > 0) hasErrors = true;
      if (input.authorization?.warningsBlock && validation.warnings.length > 0) {
        hasErrors = true;
      }
    }
    if (hasErrors) throw new ReviewError("PREFLIGHT_FAILED", 422);
    const snapshots = validated.map((draft) => ({
      draftId: draft.id,
      platform: draft.platform as TargetPlatform,
      body: draft.body,
      mediaUrls: draft.mediaUrls,
      selectedAccountId: draft.selectedAccountId!,
      revision: draft.revision,
      idempotencyKey:
        "pub_" +
        createHash("sha256")
          .update(`${userId}\0${input.requestId}\0${draft.id}\0${draft.revision}`)
          .digest("hex"),
    }));
    let created;
    try {
      created = await createPublishAttempts(this.db, {
        userId,
        approvalRequestId: input.requestId,
        snapshots,
        hourlyLimit: this.hourlyLimit,
        authorizationKind: input.authorization?.kind ?? "manual",
        triggeringMessageId: input.authorization?.triggeringMessageId ?? null,
        consentVersion: input.authorization?.consentVersion ?? null,
      });
    } catch (error) {
      mapDatabaseError(error);
    }
    if (created.replayed) {
      return { groupId, replayed: true, results: created.attempts.map(publicAttempt) };
    }

    const results = await Promise.all(
      created.attempts.map((attempt) => this.executeAttempt(userId, attempt)),
    );
    return { groupId, replayed: false, results };
  }

  private async executeAttempt(userId: string, attempt: DraftPublishAttempt) {
    try {
      const result = await this.mcp.callTool({
        userId,
        name: "publish_now",
        arguments: {
          platforms: [attempt.platform],
          text: attempt.body,
          connectedAccountId: attempt.selectedAccountId,
          options: { mediaUrls: attempt.mediaUrls },
          confirm: true,
          dryRun: false,
          idempotencyKey: attempt.idempotencyKey,
        },
      });
      const value =
        typeof result.value === "object" && result.value !== null
          ? (result.value as Record<string, unknown>)
          : {};
      const state = value.state;
      const status =
        state === "succeeded" || value.ok === true
          ? "succeeded"
          : state === "unknown" || state === "publishing"
            ? "unknown"
            : "failed";
      const completed = await finishPublishAttempt(this.db, {
        attemptId: attempt.id,
        status,
        mcpPostId: typeof value.platformPostId === "string" ? value.platformPostId : null,
        safeErrorCode: status === "failed" ? "PLATFORM_PUBLISH_FAILED" : null,
        safeErrorMessage:
          status === "failed" ? "The platform could not complete this post." : null,
      });
      return publicAttempt(completed);
    } catch {
      const unknown = await finishPublishAttempt(this.db, {
        attemptId: attempt.id,
        status: "unknown",
        safeErrorCode: "PUBLISH_STATUS_UNKNOWN",
        safeErrorMessage: "Publishing may still be processing. Check its status before trying again.",
      });
      return publicAttempt(unknown);
    }
  }

  async checkAttempt(userId: string, attemptId: string) {
    const attempt = await getOwnedPublishAttempt(this.db, userId, attemptId);
    if (!attempt) throw new ReviewError("REVIEW_NOT_FOUND", 404);
    if (attempt.status !== "unknown") return publicAttempt(attempt);
    return this.executeAttempt(userId, attempt);
  }
}

export function createReviewService(
  db: Database["db"],
  connectors: ConnectorService,
  mcp: SocialMcpGateway,
  media?: ReviewMediaService,
): ReviewService {
  const limit = Number(process.env.REVIEW_PUBLISH_HOURLY_LIMIT ?? "20");
  return new DefaultReviewService(
    db,
    connectors,
    mcp,
    Number.isInteger(limit) && limit > 0 ? limit : 20,
    media,
  );
}

export async function prepareReview(
  db: Database["db"],
  input: {
    userId: string;
    conversationId: string;
    platforms: TargetPlatform[];
    variants: Array<{
      platform: TargetPlatform;
      body: string;
      mediaUrls: string[];
      attachmentIndexes?: number[];
    }>;
    allowedMediaUrls: Set<string>;
    allowedMediaAssetIds?: string[];
  },
): Promise<PublicReviewGroup> {
  const unique = new Set(input.variants.map((variant) => variant.platform));
  if (
    unique.size !== input.variants.length ||
    input.platforms.length !== input.variants.length ||
    input.variants.some((variant) => !input.platforms.includes(variant.platform))
  ) {
    throw new ReviewError("INVALID_REVIEW_INPUT", 422);
  }
  const variants = input.variants.map((variant) => {
    const mediaAssetIds = variant.attachmentIndexes?.map(
      (index) => input.allowedMediaAssetIds?.[index],
    ).filter((value): value is string => Boolean(value)) ?? [];
    const product = validateProductInput(
      variant.platform,
      variant.body,
      variant.mediaUrls,
      mediaAssetIds.length,
    );
    if (product.mediaUrls.some((url) => !input.allowedMediaUrls.has(url))) {
      throw new ReviewError("INVALID_REVIEW_INPUT", 422);
    }
    return {
      platform: variant.platform,
      body: product.body,
      mediaUrls: product.mediaUrls,
      mediaAssetIds,
      validationErrors: product.errors,
    };
  });
  if (
    input.variants.some((variant) => {
      const indexes = variant.attachmentIndexes ?? [];
      return indexes.some(
        (index) => !Number.isInteger(index) || !input.allowedMediaAssetIds?.[index],
      );
    })
  ) {
    throw new ReviewError("INVALID_REVIEW_INPUT", 422);
  }
  const rows = await createReviewGroup(db, {
    userId: input.userId,
    conversationId: input.conversationId,
    variants,
  });
  const id = rows[0]?.reviewGroupId;
  if (!id) throw new ReviewError("INVALID_REVIEW_INPUT", 422);
  const groups = await getPublicReviewGroups(db, input.userId, input.conversationId);
  const group = groups.find((item) => item.id === id);
  if (!group) throw new ReviewError("REVIEW_NOT_FOUND", 404);
  return group;
}
