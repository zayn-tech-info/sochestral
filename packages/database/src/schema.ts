import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const publishingPreferences = pgTable("publishing_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  mode: text("mode").notNull().default("always_draft"),
  revision: integer("revision").notNull().default(1),
  fullAccessConsentVersion: text("full_access_consent_version"),
  fullAccessConsentedAt: timestamp("full_access_consented_at", {
    withTimezone: true,
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  check(
    "publishing_preferences_mode_check",
    sql`${table.mode} in ('always_draft', 'approve_for_me', 'full_access')`,
  ),
  check("publishing_preferences_revision_check", sql`${table.revision} > 0`),
]);

export const publishingAuthorityEvents = pgTable(
  "publishing_authority_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    previousMode: text("previous_mode").notNull(),
    nextMode: text("next_mode").notNull(),
    source: text("source").notNull(),
    eventKind: text("event_kind").notNull().default("preference_changed"),
    consentVersion: text("consent_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("publishing_authority_events_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    check(
      "publishing_authority_events_modes_check",
      sql`${table.previousMode} in ('always_draft', 'approve_for_me', 'full_access') and ${table.nextMode} in ('always_draft', 'approve_for_me', 'full_access')`,
    ),
    check(
      "publishing_authority_events_source_check",
      sql`${table.source} in ('composer', 'settings', 'system')`,
    ),
    check(
      "publishing_authority_events_kind_check",
      sql`${table.eventKind} in ('preference_changed', 'consent_expired')`,
    ),
  ],
);

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(
      () => orchestrationConversations.id,
      { onDelete: "cascade" },
    ),
    storageKey: text("storage_key").notNull().unique(),
    state: text("state").notNull().default("pending"),
    mimeType: text("mime_type"),
    byteSize: integer("byte_size"),
    width: integer("width"),
    height: integer("height"),
    pendingExpiresAt: timestamp("pending_expires_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("media_assets_user_created_idx").on(table.userId, table.createdAt),
    index("media_assets_conversation_idx").on(table.conversationId),
    index("media_assets_pending_expiry_idx").on(table.state, table.pendingExpiresAt),
    check(
      "media_assets_state_check",
      sql`${table.state} in ('pending', 'ready', 'deleting', 'deleted')`,
    ),
    check(
      "media_assets_dimensions_check",
      sql`(${table.width} is null and ${table.height} is null) or (${table.width} > 0 and ${table.height} > 0)`,
    ),
    check(
      "media_assets_size_check",
      sql`${table.byteSize} is null or ${table.byteSize} > 0`,
    ),
  ],
);

export const brandAssets = pgTable(
  "brand_assets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    mediaAssetId: text("media_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    colorValue: text("color_value"),
    noteText: text("note_text"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("brand_assets_user_kind_idx").on(table.userId, table.kind),
    index("brand_assets_user_created_idx").on(table.userId, table.createdAt),
    check(
      "brand_assets_kind_check",
      sql`${table.kind} in ('logo', 'reference_image', 'color', 'design_note')`,
    ),
  ],
);

export const brandDesignBriefs = pgTable(
  "brand_design_briefs",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    briefText: text("brief_text"),
    sourceHash: text("source_hash").notNull(),
    status: text("status").notNull().default("pending"),
    compiledAt: timestamp("compiled_at", { withTimezone: true }),
    pendingAt: timestamp("pending_at", { withTimezone: true }),
    errorCode: text("error_code"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "brand_design_briefs_status_check",
      sql`${table.status} in ('pending', 'ready', 'failed')`,
    ),
    index("brand_design_briefs_pending_idx").on(table.status, table.pendingAt),
  ],
);

export const imageJobs = pgTable(
  "image_jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(
      () => orchestrationConversations.id,
      { onDelete: "set null" },
    ),
    requestId: text("request_id"),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("pending_confirm"),
    prompt: text("prompt"),
    sizePreset: text("size_preset").notNull().default("portrait_4_5"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sourceMediaAssetId: text("source_media_asset_id").references(
      () => mediaAssets.id,
      { onDelete: "set null" },
    ),
    resultMediaAssetId: text("result_media_asset_id").references(
      () => mediaAssets.id,
      { onDelete: "set null" },
    ),
    resultMediaAssetIds: jsonb("result_media_asset_ids")
      .$type<string[]>()
      .notNull()
      .default([]),
    variantCount: integer("variant_count").notNull().default(1),
    provider: text("provider").notNull().default("openai"),
    model: text("model").notNull(),
    estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
    creditsCharged: integer("credits_charged").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("image_jobs_user_created_idx").on(table.userId, table.createdAt),
    index("image_jobs_status_created_idx").on(table.status, table.createdAt),
    uniqueIndex("image_jobs_user_request_uidx").on(table.userId, table.requestId),
    check(
      "image_jobs_kind_check",
      sql`${table.kind} in ('generate', 'reframe', 'vary', 'prompt_edit')`,
    ),
    check(
      "image_jobs_status_check",
      sql`${table.status} in ('pending_confirm', 'queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check(
      "image_jobs_size_preset_check",
      sql`${table.sizePreset} in ('square', 'portrait_4_5', 'story_9_16', 'linkedin_landscape')`,
    ),
    check(
      "image_jobs_variant_count_check",
      sql`${table.variantCount} between 1 and 3`,
    ),
  ],
);

export const imageJobInputs = pgTable(
  "image_job_inputs",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => imageJobs.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    mediaAssetId: text("media_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    brandAssetId: text("brand_asset_id").references(() => brandAssets.id, {
      onDelete: "cascade",
    }),
    role: text("role").notNull(),
  },
  (table) => [
    uniqueIndex("image_job_inputs_job_position_uidx").on(
      table.jobId,
      table.position,
    ),
    check(
      "image_job_inputs_role_check",
      sql`${table.role} in ('reference', 'brand')`,
    ),
    check(
      "image_job_inputs_source_check",
      sql`(${table.mediaAssetId} is not null and ${table.brandAssetId} is null) or (${table.mediaAssetId} is null and ${table.brandAssetId} is not null)`,
    ),
  ],
);

export const imageCreditWallets = pgTable(
  "image_credit_wallets",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    periodYm: text("period_ym").notNull(),
    creditsUsed: integer("credits_used").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.periodYm] }),
    check(
      "image_credit_wallets_used_check",
      sql`${table.creditsUsed} >= 0`,
    ),
  ],
);

export const drafts = pgTable(
  "drafts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(
      () => orchestrationConversations.id,
      { onDelete: "cascade" },
    ),
    reviewGroupId: text("review_group_id"),
    platform: text("platform").notNull(),
    body: text("body").notNull(),
    mediaUrls: text("media_urls")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    selectedAccountId: text("selected_account_id"),
    revision: integer("revision").notNull().default(1),
    validationErrors: jsonb("validation_errors")
      .$type<string[]>()
      .notNull()
      .default([]),
    validationWarnings: jsonb("validation_warnings")
      .$type<string[]>()
      .notNull()
      .default([]),
    validatedRevision: integer("validated_revision"),
    status: text("status").notNull().default("draft"),
    lastError: text("last_error"),
    mcpPostId: text("mcp_post_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("drafts_user_id_idx").on(table.userId),
    index("drafts_user_id_status_idx").on(table.userId, table.status),
    index("drafts_conversation_id_idx").on(table.conversationId),
    index("drafts_review_group_id_idx").on(table.reviewGroupId),
    uniqueIndex("drafts_review_group_platform_unique")
      .on(table.reviewGroupId, table.platform)
      .where(sql`${table.reviewGroupId} is not null`),
    check(
      "drafts_platform_check",
      sql`${table.platform} in ('threads', 'linkedin', 'linkedin_personal', 'instagram')`,
    ),
    check(
      "drafts_status_check",
      sql`${table.status} in ('draft', 'approved', 'publish_requested', 'published', 'failed', 'unknown')`,
    ),
    check("drafts_revision_check", sql`${table.revision} > 0`),
  ],
);

export const draftPublishAttempts = pgTable(
  "draft_publish_attempts",
  {
    id: text("id").primaryKey(),
    draftId: text("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    approvalRequestId: text("approval_request_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    platform: text("platform").notNull(),
    body: text("body").notNull(),
    mediaUrls: text("media_urls")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    selectedAccountId: text("selected_account_id").notNull(),
    revision: integer("revision").notNull(),
    authorizationKind: text("authorization_kind").notNull().default("manual"),
    triggeringMessageId: text("triggering_message_id").references(
      () => orchestrationMessages.id,
      { onDelete: "set null" },
    ),
    consentVersion: text("consent_version"),
    status: text("status").notNull().default("publishing"),
    safeErrorCode: text("safe_error_code"),
    safeErrorMessage: text("safe_error_message"),
    mcpPostId: text("mcp_post_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("draft_publish_attempts_draft_created_idx").on(
      table.draftId,
      table.createdAt,
    ),
    index("draft_publish_attempts_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    uniqueIndex("draft_publish_attempts_one_active_draft_unique")
      .on(table.draftId)
      .where(sql`${table.status} = 'publishing'`),
    check(
      "draft_publish_attempts_platform_check",
      sql`${table.platform} in ('threads', 'linkedin_personal', 'instagram')`,
    ),
    check(
      "draft_publish_attempts_status_check",
      sql`${table.status} in ('publishing', 'succeeded', 'failed', 'unknown')`,
    ),
    check("draft_publish_attempts_revision_check", sql`${table.revision} > 0`),
    check(
      "draft_publish_attempts_authorization_check",
      sql`${table.authorizationKind} in ('manual', 'approve_for_me', 'full_access')`,
    ),
  ],
);

export const orchestrationConversations = pgTable(
  "orchestration_conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("orchestration_conversations_user_updated_idx").on(
      table.userId,
      table.updatedAt,
      table.id,
    ),
  ],
);

export type PlanCadence = {
  threadsPerDay?: number;
  linkedinPerDay?: number;
  instagramPerDay?: number;
};

export const conversationContentPlans = pgTable(
  "conversation_content_plans",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => orchestrationConversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    horizonDays: integer("horizon_days").notNull().default(14),
    platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
    contentType: text("content_type"),
    direction: text("direction"),
    themes: jsonb("themes").$type<string[]>().notNull().default([]),
    acceptedItems: jsonb("accepted_items")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    researchSummary: text("research_summary"),
    startDate: date("start_date"),
    timezone: text("timezone"),
    cadence: jsonb("cadence")
      .$type<PlanCadence>()
      .notNull()
      .default({}),
    timeMode: text("time_mode"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("conversation_content_plans_conversation_unique").on(
      table.conversationId,
    ),
    index("conversation_content_plans_user_idx").on(table.userId),
    check(
      "conversation_content_plans_horizon_check",
      sql`${table.horizonDays} between 1 and 30`,
    ),
    check(
      "conversation_content_plans_time_mode_check",
      sql`${table.timeMode} is null or ${table.timeMode} in ('spread', 'windows')`,
    ),
  ],
);

export const campaignJobs = pgTable(
  "campaign_jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => orchestrationConversations.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => conversationContentPlans.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    cap: integer("cap").notNull().default(30),
    bookedCount: integer("booked_count").notNull().default(0),
    nextDate: date("next_date").notNull(),
    dayAttempts: integer("day_attempts").notNull().default(0),
    bookedPublishAts: jsonb("booked_publish_ats")
      .$type<string[]>()
      .notNull()
      .default([]),
    notice: text("notice"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("campaign_jobs_one_inflight_user")
      .on(table.userId)
      .where(sql`${table.status} in ('queued', 'running', 'paused')`),
    index("campaign_jobs_user_created_idx").on(table.userId, table.createdAt),
    index("campaign_jobs_status_idx").on(table.status, table.createdAt),
    check(
      "campaign_jobs_status_check",
      sql`${table.status} in ('queued', 'running', 'paused', 'succeeded', 'stopped', 'failed')`,
    ),
    check(
      "campaign_jobs_cap_check",
      sql`${table.cap} between 1 and 30`,
    ),
    check(
      "campaign_jobs_booked_count_check",
      sql`${table.bookedCount} >= 0`,
    ),
  ],
);

export const voiceBibles = pgTable(
  "voice_bibles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    briefText: text("brief_text"),
    sourceHash: text("source_hash").notNull(),
    status: text("status").notNull().default("compiling"),
    pendingAt: timestamp("pending_at", { withTimezone: true }),
    compileHash: text("compile_hash"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "voice_bibles_status_check",
      sql`${table.status} in ('current', 'compiling', 'failed')`,
    ),
    index("voice_bibles_pending_idx").on(table.status, table.pendingAt),
  ],
);

export const orchestrationMessages = pgTable(
  "orchestration_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => orchestrationConversations.id, {
        onDelete: "cascade",
      }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    sequence: integer("sequence").notNull(),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("orchestration_messages_conversation_sequence_unique").on(
      table.conversationId,
      table.sequence,
    ),
    uniqueIndex("orchestration_messages_request_id_unique")
      .on(table.requestId)
      .where(sql`${table.requestId} is not null`),
    index("orchestration_messages_conversation_sequence_idx").on(
      table.conversationId,
      table.sequence,
    ),
    check(
      "orchestration_messages_role_check",
      sql`${table.role} in ('user', 'assistant')`,
    ),
  ],
);

export const orchestrationMessageMedia = pgTable(
  "orchestration_message_media",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => orchestrationMessages.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
  },
  (table) => [
    uniqueIndex("orchestration_message_media_message_position_unique").on(
      table.messageId,
      table.position,
    ),
    uniqueIndex("orchestration_message_media_message_asset_unique").on(
      table.messageId,
      table.assetId,
    ),
    index("orchestration_message_media_asset_idx").on(table.assetId),
    check("orchestration_message_media_position_check", sql`${table.position} >= 0`),
  ],
);

export const orchestrationRuns = pgTable(
  "orchestration_runs",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => orchestrationConversations.id, {
        onDelete: "cascade",
      }),
    triggerMessageId: text("trigger_message_id")
      .notNull()
      .references(() => orchestrationMessages.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    targetPlatforms: text("target_platforms").array().notNull(),
    publishingMode: text("publishing_mode").notNull().default("always_draft"),
    publishingConsentVersion: text("publishing_consent_version"),
    publishingAuthorityEventId: text("publishing_authority_event_id").references(
      () => publishingAuthorityEvents.id,
      { onDelete: "set null" },
    ),
    explicitLiveIntent: boolean("explicit_live_intent").notNull().default(false),
    liveIntentKind: text("live_intent_kind"),
    thinkingText: text("thinking_text"),
    modelStepCount: integer("model_step_count").notNull().default(0),
    providerAttemptCount: integer("provider_attempt_count").notNull().default(0),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    safeError: text("safe_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("orchestration_runs_one_active_conversation_unique")
      .on(table.conversationId)
      .where(sql`${table.status} = 'running'`),
    index("orchestration_runs_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    check(
      "orchestration_runs_status_check",
      sql`${table.status} in ('running', 'completed', 'failed')`,
    ),
    check(
      "orchestration_runs_model_step_count_check",
      sql`${table.modelStepCount} between 0 and 4`,
    ),
    check(
      "orchestration_runs_provider_attempt_count_check",
      sql`${table.providerAttemptCount} >= 0`,
    ),
    check(
      "orchestration_runs_publishing_mode_check",
      sql`${table.publishingMode} in ('always_draft', 'approve_for_me', 'full_access')`,
    ),
    check(
      "orchestration_runs_live_intent_kind_check",
      sql`${table.liveIntentKind} is null or ${table.liveIntentKind} in ('live', 'draft', 'unclear', 'schedule')`,
    ),
  ],
);

export const draftMedia = pgTable(
  "draft_media",
  {
    draftId: text("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    assetId: text("asset_id").references(() => mediaAssets.id, {
      onDelete: "restrict",
    }),
    externalUrl: text("external_url"),
  },
  (table) => [
    uniqueIndex("draft_media_draft_position_unique").on(
      table.draftId,
      table.position,
    ),
    index("draft_media_asset_idx").on(table.assetId),
    check("draft_media_position_check", sql`${table.position} >= 0`),
    check(
      "draft_media_one_source_check",
      sql`(${table.assetId} is not null) <> (${table.externalUrl} is not null)`,
    ),
  ],
);

export const draftPublishAttemptMedia = pgTable(
  "draft_publish_attempt_media",
  {
    attemptId: text("attempt_id")
      .notNull()
      .references(() => draftPublishAttempts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    assetId: text("asset_id").references(() => mediaAssets.id, {
      onDelete: "restrict",
    }),
    externalUrl: text("external_url"),
  },
  (table) => [
    uniqueIndex("draft_publish_attempt_media_position_unique").on(
      table.attemptId,
      table.position,
    ),
    index("draft_publish_attempt_media_asset_idx").on(table.assetId),
    check("draft_publish_attempt_media_position_check", sql`${table.position} >= 0`),
    check(
      "draft_publish_attempt_media_one_source_check",
      sql`(${table.assetId} is not null) <> (${table.externalUrl} is not null)`,
    ),
  ],
);

export const orchestrationToolCalls = pgTable(
  "orchestration_tool_calls",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => orchestrationRuns.id, { onDelete: "cascade" }),
    providerCallId: text("provider_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    status: text("status").notNull().default("pending"),
    arguments: jsonb("arguments").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    attemptCount: integer("attempt_count").notNull().default(1),
    durationMs: integer("duration_ms"),
    safeError: text("safe_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("orchestration_tool_calls_run_provider_id_unique").on(
      table.runId,
      table.providerCallId,
    ),
    index("orchestration_tool_calls_run_created_idx").on(
      table.runId,
      table.createdAt,
    ),
    check(
      "orchestration_tool_calls_name_check",
      sql`${table.toolName} in ('list_connected_accounts', 'validate_post', 'publish_now', 'prepare_review', 'save_profile_entry', 'schedule_post', 'propose_image_job', 'research_web', 'save_content_plan', 'update_business_identity', 'upsert_profile_entry', 'skip_competitors', 'research_competitors', 'save_tone_rule', 'complete_setup_if_ready')`,
    ),
    check(
      "orchestration_tool_calls_status_check",
      sql`${table.status} in ('pending', 'succeeded', 'failed')`,
    ),
    check(
      "orchestration_tool_calls_attempt_count_check",
      sql`${table.attemptCount} between 1 and 2`,
    ),
  ],
);

export const businessProfiles = pgTable(
  "business_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessName: text("business_name"),
    businessDescription: text("business_description"),
    websiteUrl: text("website_url"),
    targetAudience: text("target_audience"),
    industry: text("industry"),
    personaRole: text("persona_role"),
    personaRoleOther: text("persona_role_other"),
    primaryPlatforms: jsonb("primary_platforms")
      .$type<string[]>()
      .notNull()
      .default([]),
    attributionSource: text("attribution_source"),
    attributionOther: text("attribution_other"),
    setupStatus: text("setup_status").notNull().default("not_started"),
    setupStep: text("setup_step"),
    competitorsSkipped: boolean("competitors_skipped").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("business_profiles_user_id_uidx").on(table.userId),
    check(
      "business_profiles_setup_status_check",
      sql`${table.setupStatus} in ('not_started', 'in_progress', 'complete')`,
    ),
  ],
);

export const profileEntries = pgTable(
  "profile_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    status: text("status").notNull().default("active"),
    source: text("source").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("profile_entries_user_id_idx").on(table.userId),
    index("profile_entries_user_category_idx").on(table.userId, table.category),
    index("profile_entries_user_status_idx").on(table.userId, table.status),
    check(
      "profile_entries_category_check",
      sql`${table.category} in ('tone', 'do_not', 'cadence', 'competitor', 'audience', 'skill', 'brand_fact')`,
    ),
    check(
      "profile_entries_status_check",
      sql`${table.status} in ('proposed', 'active', 'rejected', 'archived')`,
    ),
    check(
      "profile_entries_source_check",
      sql`${table.source} in ('setup', 'settings', 'operator_confirm', 'research')`,
    ),
  ],
);

export const usersRelations = relations(users, ({ many, one }) => ({
  orchestrationConversations: many(orchestrationConversations),
  drafts: many(drafts),
  draftPublishAttempts: many(draftPublishAttempts),
  publishingAuthorityEvents: many(publishingAuthorityEvents),
  mediaAssets: many(mediaAssets),
  businessProfile: one(businessProfiles, {
    fields: [users.id],
    references: [businessProfiles.userId],
  }),
  profileEntries: many(profileEntries),
}));

export const businessProfilesRelations = relations(businessProfiles, ({ one }) => ({
  user: one(users, {
    fields: [businessProfiles.userId],
    references: [users.id],
  }),
}));

export const profileEntriesRelations = relations(profileEntries, ({ one }) => ({
  user: one(users, {
    fields: [profileEntries.userId],
    references: [users.id],
  }),
}));

export const orchestrationConversationsRelations = relations(
  orchestrationConversations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [orchestrationConversations.userId],
      references: [users.id],
    }),
    messages: many(orchestrationMessages),
    runs: many(orchestrationRuns),
    drafts: many(drafts),
    contentPlan: one(conversationContentPlans, {
      fields: [orchestrationConversations.id],
      references: [conversationContentPlans.conversationId],
    }),
  }),
);

export const conversationContentPlansRelations = relations(
  conversationContentPlans,
  ({ one, many }) => ({
    conversation: one(orchestrationConversations, {
      fields: [conversationContentPlans.conversationId],
      references: [orchestrationConversations.id],
    }),
    user: one(users, {
      fields: [conversationContentPlans.userId],
      references: [users.id],
    }),
    campaignJobs: many(campaignJobs),
  }),
);

export const campaignJobsRelations = relations(campaignJobs, ({ one }) => ({
  user: one(users, {
    fields: [campaignJobs.userId],
    references: [users.id],
  }),
  conversation: one(orchestrationConversations, {
    fields: [campaignJobs.conversationId],
    references: [orchestrationConversations.id],
  }),
  plan: one(conversationContentPlans, {
    fields: [campaignJobs.planId],
    references: [conversationContentPlans.id],
  }),
}));

export const voiceBiblesRelations = relations(voiceBibles, ({ one }) => ({
  user: one(users, {
    fields: [voiceBibles.userId],
    references: [users.id],
  }),
}));

export const draftsRelations = relations(drafts, ({ one, many }) => ({
  user: one(users, { fields: [drafts.userId], references: [users.id] }),
  conversation: one(orchestrationConversations, {
    fields: [drafts.conversationId],
    references: [orchestrationConversations.id],
  }),
  attempts: many(draftPublishAttempts),
}));

export const draftPublishAttemptsRelations = relations(
  draftPublishAttempts,
  ({ one }) => ({
    draft: one(drafts, {
      fields: [draftPublishAttempts.draftId],
      references: [drafts.id],
    }),
    user: one(users, {
      fields: [draftPublishAttempts.userId],
      references: [users.id],
    }),
  }),
);

export const orchestrationMessagesRelations = relations(
  orchestrationMessages,
  ({ one }) => ({
    conversation: one(orchestrationConversations, {
      fields: [orchestrationMessages.conversationId],
      references: [orchestrationConversations.id],
    }),
  }),
);

export const orchestrationRunsRelations = relations(
  orchestrationRuns,
  ({ one, many }) => ({
    conversation: one(orchestrationConversations, {
      fields: [orchestrationRuns.conversationId],
      references: [orchestrationConversations.id],
    }),
    triggerMessage: one(orchestrationMessages, {
      fields: [orchestrationRuns.triggerMessageId],
      references: [orchestrationMessages.id],
    }),
    toolCalls: many(orchestrationToolCalls),
  }),
);

export const orchestrationToolCallsRelations = relations(
  orchestrationToolCalls,
  ({ one }) => ({
    run: one(orchestrationRuns, {
      fields: [orchestrationToolCalls.runId],
      references: [orchestrationRuns.id],
    }),
  }),
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type BusinessProfile = typeof businessProfiles.$inferSelect;
export type ProfileEntry = typeof profileEntries.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type DraftPublishAttempt = typeof draftPublishAttempts.$inferSelect;
export type PublishingPreference = typeof publishingPreferences.$inferSelect;
export type PublishingAuthorityEvent = typeof publishingAuthorityEvents.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type BrandAsset = typeof brandAssets.$inferSelect;
export type BrandDesignBrief = typeof brandDesignBriefs.$inferSelect;
export type ImageJob = typeof imageJobs.$inferSelect;
export type ImageJobInput = typeof imageJobInputs.$inferSelect;
export type ImageCreditWallet = typeof imageCreditWallets.$inferSelect;
export type BrandAssetKind = "logo" | "reference_image" | "color" | "design_note";
export type ImageJobKind = "generate" | "reframe" | "vary" | "prompt_edit";
export type ImageJobStatus =
  | "pending_confirm"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";
export type ImageSizePreset =
  | "square"
  | "portrait_4_5"
  | "story_9_16"
  | "linkedin_landscape";
export type ImageJobInputRole = "reference" | "brand";
export type BrandDesignBriefStatus = "pending" | "ready" | "failed";
export type OrchestrationConversation =
  typeof orchestrationConversations.$inferSelect;
export type OrchestrationMessage = typeof orchestrationMessages.$inferSelect;
export type OrchestrationRun = typeof orchestrationRuns.$inferSelect;
export type OrchestrationToolCall = typeof orchestrationToolCalls.$inferSelect;
export type ConversationContentPlan =
  typeof conversationContentPlans.$inferSelect;
export type CampaignJob = typeof campaignJobs.$inferSelect;
export type VoiceBible = typeof voiceBibles.$inferSelect;
export type CampaignJobStatus =
  | "queued"
  | "running"
  | "paused"
  | "succeeded"
  | "stopped"
  | "failed";
export type VoiceBibleStatus = "current" | "compiling" | "failed";
export type PlanTimeMode = "spread" | "windows";
export type NewUser = typeof users.$inferInsert;
export type NewSession = typeof sessions.$inferInsert;
export type NewDraft = typeof drafts.$inferInsert;
export type NewDraftPublishAttempt = typeof draftPublishAttempts.$inferInsert;
export type NewOrchestrationConversation =
  typeof orchestrationConversations.$inferInsert;
export type NewOrchestrationMessage =
  typeof orchestrationMessages.$inferInsert;
export type NewOrchestrationRun = typeof orchestrationRuns.$inferInsert;
export type NewOrchestrationToolCall =
  typeof orchestrationToolCalls.$inferInsert;

export type DraftPlatform =
  | "threads"
  | "linkedin"
  | "linkedin_personal"
  | "instagram";
export type DraftStatus =
  | "draft"
  | "approved"
  | "publish_requested"
  | "published"
  | "failed"
  | "unknown";
export type DraftPublishAttemptStatus =
  | "publishing"
  | "succeeded"
  | "failed"
  | "unknown";
export type PublishingMode = "always_draft" | "approve_for_me" | "full_access";
export type PublishingAuthoritySource = "composer" | "settings" | "system";
export type SetupStatus = "not_started" | "in_progress" | "complete";
export type ProfileEntryCategory =
  | "tone"
  | "do_not"
  | "cadence"
  | "competitor"
  | "audience"
  | "skill"
  | "brand_fact";
export type ProfileEntryStatus =
  | "proposed"
  | "active"
  | "rejected"
  | "archived";
export type ProfileEntrySource =
  | "setup"
  | "settings"
  | "operator_confirm"
  | "research";
