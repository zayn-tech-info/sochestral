CREATE TABLE "brand_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"media_asset_id" text,
	"color_value" text,
	"note_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_assets_kind_check" CHECK ("brand_assets"."kind" in ('logo', 'reference_image', 'color', 'design_note'))
);
--> statement-breakpoint
CREATE TABLE "image_credit_wallets" (
	"user_id" text NOT NULL,
	"period_ym" text NOT NULL,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "image_credit_wallets_user_id_period_ym_pk" PRIMARY KEY("user_id","period_ym"),
	CONSTRAINT "image_credit_wallets_used_check" CHECK ("image_credit_wallets"."credits_used" >= 0)
);
--> statement-breakpoint
CREATE TABLE "image_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text,
	"request_id" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending_confirm' NOT NULL,
	"prompt" text,
	"size_preset" text DEFAULT 'portrait_4_5' NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"source_media_asset_id" text,
	"result_media_asset_id" text,
	"provider" text DEFAULT 'openai' NOT NULL,
	"model" text NOT NULL,
	"estimated_cost_cents" integer DEFAULT 0 NOT NULL,
	"credits_charged" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "image_jobs_kind_check" CHECK ("image_jobs"."kind" in ('generate', 'reframe', 'vary', 'prompt_edit')),
	CONSTRAINT "image_jobs_status_check" CHECK ("image_jobs"."status" in ('pending_confirm', 'queued', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "image_jobs_size_preset_check" CHECK ("image_jobs"."size_preset" in ('square', 'portrait_4_5', 'story_9_16', 'linkedin_landscape'))
);
--> statement-breakpoint
CREATE TABLE "image_job_inputs" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"position" integer NOT NULL,
	"media_asset_id" text,
	"brand_asset_id" text,
	"role" text NOT NULL,
	CONSTRAINT "image_job_inputs_role_check" CHECK ("image_job_inputs"."role" in ('reference', 'brand')),
	CONSTRAINT "image_job_inputs_source_check" CHECK (("image_job_inputs"."media_asset_id" is not null and "image_job_inputs"."brand_asset_id" is null) or ("image_job_inputs"."media_asset_id" is null and "image_job_inputs"."brand_asset_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_credit_wallets" ADD CONSTRAINT "image_credit_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_jobs" ADD CONSTRAINT "image_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_jobs" ADD CONSTRAINT "image_jobs_conversation_id_orchestration_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."orchestration_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_jobs" ADD CONSTRAINT "image_jobs_source_media_asset_id_media_assets_id_fk" FOREIGN KEY ("source_media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_jobs" ADD CONSTRAINT "image_jobs_result_media_asset_id_media_assets_id_fk" FOREIGN KEY ("result_media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_job_inputs" ADD CONSTRAINT "image_job_inputs_job_id_image_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."image_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_job_inputs" ADD CONSTRAINT "image_job_inputs_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_job_inputs" ADD CONSTRAINT "image_job_inputs_brand_asset_id_brand_assets_id_fk" FOREIGN KEY ("brand_asset_id") REFERENCES "public"."brand_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_assets_user_kind_idx" ON "brand_assets" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "brand_assets_user_created_idx" ON "brand_assets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "image_job_inputs_job_position_uidx" ON "image_job_inputs" USING btree ("job_id","position");--> statement-breakpoint
CREATE INDEX "image_jobs_user_created_idx" ON "image_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "image_jobs_status_created_idx" ON "image_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "image_jobs_user_request_uidx" ON "image_jobs" USING btree ("user_id","request_id") WHERE "request_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "orchestration_tool_calls" DROP CONSTRAINT IF EXISTS "orchestration_tool_calls_name_check";--> statement-breakpoint
ALTER TABLE "orchestration_tool_calls" ADD CONSTRAINT "orchestration_tool_calls_name_check" CHECK ("orchestration_tool_calls"."tool_name" in ('list_connected_accounts', 'validate_post', 'publish_now', 'prepare_review', 'save_profile_entry', 'schedule_post', 'propose_image_job', 'update_business_identity', 'upsert_profile_entry', 'skip_competitors', 'research_competitors', 'save_tone_rule', 'complete_setup_if_ready'));
