CREATE TABLE "draft_media" (
	"draft_id" text NOT NULL,
	"position" integer NOT NULL,
	"asset_id" text,
	"external_url" text,
	CONSTRAINT "draft_media_position_check" CHECK ("draft_media"."position" >= 0),
	CONSTRAINT "draft_media_one_source_check" CHECK (("draft_media"."asset_id" is not null) <> ("draft_media"."external_url" is not null))
);
--> statement-breakpoint
CREATE TABLE "draft_publish_attempt_media" (
	"attempt_id" text NOT NULL,
	"position" integer NOT NULL,
	"asset_id" text,
	"external_url" text,
	CONSTRAINT "draft_publish_attempt_media_position_check" CHECK ("draft_publish_attempt_media"."position" >= 0),
	CONSTRAINT "draft_publish_attempt_media_one_source_check" CHECK (("draft_publish_attempt_media"."asset_id" is not null) <> ("draft_publish_attempt_media"."external_url" is not null))
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text,
	"storage_key" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"mime_type" text,
	"byte_size" integer,
	"width" integer,
	"height" integer,
	"pending_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "media_assets_state_check" CHECK ("media_assets"."state" in ('pending', 'ready', 'deleting')),
	CONSTRAINT "media_assets_dimensions_check" CHECK (("media_assets"."width" is null and "media_assets"."height" is null) or ("media_assets"."width" > 0 and "media_assets"."height" > 0)),
	CONSTRAINT "media_assets_size_check" CHECK ("media_assets"."byte_size" is null or "media_assets"."byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE "orchestration_message_media" (
	"message_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "orchestration_message_media_position_check" CHECK ("orchestration_message_media"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "publishing_authority_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"previous_mode" text NOT NULL,
	"next_mode" text NOT NULL,
	"source" text NOT NULL,
	"event_kind" text DEFAULT 'preference_changed' NOT NULL,
	"consent_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publishing_authority_events_modes_check" CHECK ("publishing_authority_events"."previous_mode" in ('always_draft', 'approve_for_me', 'full_access') and "publishing_authority_events"."next_mode" in ('always_draft', 'approve_for_me', 'full_access')),
	CONSTRAINT "publishing_authority_events_source_check" CHECK ("publishing_authority_events"."source" in ('composer', 'settings', 'system')),
	CONSTRAINT "publishing_authority_events_kind_check" CHECK ("publishing_authority_events"."event_kind" in ('preference_changed', 'consent_expired'))
);
--> statement-breakpoint
CREATE TABLE "publishing_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'always_draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"full_access_consent_version" text,
	"full_access_consented_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publishing_preferences_mode_check" CHECK ("publishing_preferences"."mode" in ('always_draft', 'approve_for_me', 'full_access')),
	CONSTRAINT "publishing_preferences_revision_check" CHECK ("publishing_preferences"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "orchestration_tool_calls" DROP CONSTRAINT "orchestration_tool_calls_name_check";--> statement-breakpoint
ALTER TABLE "draft_publish_attempts" ADD COLUMN "authorization_kind" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "draft_publish_attempts" ADD COLUMN "triggering_message_id" text;--> statement-breakpoint
ALTER TABLE "draft_publish_attempts" ADD COLUMN "consent_version" text;--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD COLUMN "publishing_mode" text DEFAULT 'always_draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD COLUMN "publishing_consent_version" text;--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD COLUMN "publishing_authority_event_id" text;--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD COLUMN "explicit_live_intent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "draft_media" ADD CONSTRAINT "draft_media_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_media" ADD CONSTRAINT "draft_media_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_publish_attempt_media" ADD CONSTRAINT "draft_publish_attempt_media_attempt_id_draft_publish_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."draft_publish_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_publish_attempt_media" ADD CONSTRAINT "draft_publish_attempt_media_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_conversation_id_orchestration_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."orchestration_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestration_message_media" ADD CONSTRAINT "orchestration_message_media_message_id_orchestration_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."orchestration_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestration_message_media" ADD CONSTRAINT "orchestration_message_media_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishing_authority_events" ADD CONSTRAINT "publishing_authority_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishing_preferences" ADD CONSTRAINT "publishing_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "draft_media" ("draft_id", "position", "external_url")
SELECT "drafts"."id", "media"."ordinality" - 1, "media"."url"
FROM "drafts"
CROSS JOIN LATERAL unnest("drafts"."media_urls") WITH ORDINALITY AS "media"("url", "ordinality");--> statement-breakpoint
INSERT INTO "draft_publish_attempt_media" ("attempt_id", "position", "external_url")
SELECT "draft_publish_attempts"."id", "media"."ordinality" - 1, "media"."url"
FROM "draft_publish_attempts"
CROSS JOIN LATERAL unnest("draft_publish_attempts"."media_urls") WITH ORDINALITY AS "media"("url", "ordinality");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_media_draft_position_unique" ON "draft_media" USING btree ("draft_id","position");--> statement-breakpoint
CREATE INDEX "draft_media_asset_idx" ON "draft_media" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_publish_attempt_media_position_unique" ON "draft_publish_attempt_media" USING btree ("attempt_id","position");--> statement-breakpoint
CREATE INDEX "draft_publish_attempt_media_asset_idx" ON "draft_publish_attempt_media" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "media_assets_user_created_idx" ON "media_assets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "media_assets_conversation_idx" ON "media_assets" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "media_assets_pending_expiry_idx" ON "media_assets" USING btree ("state","pending_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orchestration_message_media_message_position_unique" ON "orchestration_message_media" USING btree ("message_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "orchestration_message_media_message_asset_unique" ON "orchestration_message_media" USING btree ("message_id","asset_id");--> statement-breakpoint
CREATE INDEX "orchestration_message_media_asset_idx" ON "orchestration_message_media" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "publishing_authority_events_user_created_idx" ON "publishing_authority_events" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "draft_publish_attempts" ADD CONSTRAINT "draft_publish_attempts_triggering_message_id_orchestration_messages_id_fk" FOREIGN KEY ("triggering_message_id") REFERENCES "public"."orchestration_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD CONSTRAINT "orchestration_runs_publishing_authority_event_id_publishing_authority_events_id_fk" FOREIGN KEY ("publishing_authority_event_id") REFERENCES "public"."publishing_authority_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_publish_attempts" ADD CONSTRAINT "draft_publish_attempts_authorization_check" CHECK ("draft_publish_attempts"."authorization_kind" in ('manual', 'approve_for_me', 'full_access'));--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD CONSTRAINT "orchestration_runs_publishing_mode_check" CHECK ("orchestration_runs"."publishing_mode" in ('always_draft', 'approve_for_me', 'full_access'));--> statement-breakpoint
ALTER TABLE "orchestration_tool_calls" ADD CONSTRAINT "orchestration_tool_calls_name_check" CHECK ("orchestration_tool_calls"."tool_name" in ('list_connected_accounts', 'validate_post', 'publish_now', 'prepare_review'));
