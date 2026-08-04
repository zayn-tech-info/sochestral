CREATE TABLE "draft_publish_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"user_id" text NOT NULL,
	"approval_request_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"platform" text NOT NULL,
	"body" text NOT NULL,
	"media_urls" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"selected_account_id" text NOT NULL,
	"revision" integer NOT NULL,
	"status" text DEFAULT 'publishing' NOT NULL,
	"safe_error_code" text,
	"safe_error_message" text,
	"mcp_post_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "draft_publish_attempts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "draft_publish_attempts_platform_check" CHECK ("draft_publish_attempts"."platform" in ('threads', 'linkedin_personal', 'instagram')),
	CONSTRAINT "draft_publish_attempts_status_check" CHECK ("draft_publish_attempts"."status" in ('publishing', 'succeeded', 'failed', 'unknown')),
	CONSTRAINT "draft_publish_attempts_revision_check" CHECK ("draft_publish_attempts"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "drafts" DROP CONSTRAINT "drafts_platform_check";--> statement-breakpoint
ALTER TABLE "drafts" DROP CONSTRAINT "drafts_status_check";--> statement-breakpoint
ALTER TABLE "orchestration_tool_calls" DROP CONSTRAINT "orchestration_tool_calls_name_check";--> statement-breakpoint
ALTER TABLE "drafts" ALTER COLUMN "media_urls" SET DEFAULT ARRAY[]::text[];--> statement-breakpoint
UPDATE "drafts" SET "media_urls" = ARRAY[]::text[] WHERE "media_urls" IS NULL;--> statement-breakpoint
ALTER TABLE "drafts" ALTER COLUMN "media_urls" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "conversation_id" text;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "review_group_id" text;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "selected_account_id" text;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "validation_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "validated_revision" integer;--> statement-breakpoint
ALTER TABLE "draft_publish_attempts" ADD CONSTRAINT "draft_publish_attempts_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_publish_attempts" ADD CONSTRAINT "draft_publish_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_publish_attempts_draft_created_idx" ON "draft_publish_attempts" USING btree ("draft_id","created_at");--> statement-breakpoint
CREATE INDEX "draft_publish_attempts_user_created_idx" ON "draft_publish_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_publish_attempts_one_active_draft_unique" ON "draft_publish_attempts" USING btree ("draft_id") WHERE "draft_publish_attempts"."status" = 'publishing';--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_conversation_id_orchestration_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."orchestration_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drafts_conversation_id_idx" ON "drafts" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "drafts_review_group_id_idx" ON "drafts" USING btree ("review_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "drafts_review_group_platform_unique" ON "drafts" USING btree ("review_group_id","platform") WHERE "drafts"."review_group_id" is not null;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_revision_check" CHECK ("drafts"."revision" > 0);--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_platform_check" CHECK ("drafts"."platform" in ('threads', 'linkedin', 'linkedin_personal', 'instagram'));--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_status_check" CHECK ("drafts"."status" in ('draft', 'approved', 'publish_requested', 'published', 'failed', 'unknown'));
--> statement-breakpoint
ALTER TABLE "orchestration_tool_calls" ADD CONSTRAINT "orchestration_tool_calls_name_check" CHECK ("orchestration_tool_calls"."tool_name" in ('list_connected_accounts', 'validate_post', 'publish_now', 'prepare_review'));
