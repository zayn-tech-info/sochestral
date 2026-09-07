CREATE TABLE "brand_design_briefs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"brief_text" text,
	"source_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"compiled_at" timestamp with time zone,
	"pending_at" timestamp with time zone,
	"error_code" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_design_briefs_status_check" CHECK ("brand_design_briefs"."status" in ('pending', 'ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "orchestration_tool_calls" DROP CONSTRAINT "orchestration_tool_calls_name_check";--> statement-breakpoint
ALTER TABLE "brand_design_briefs" ADD CONSTRAINT "brand_design_briefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_design_briefs_pending_idx" ON "brand_design_briefs" USING btree ("status","pending_at");--> statement-breakpoint
ALTER TABLE "orchestration_tool_calls" ADD CONSTRAINT "orchestration_tool_calls_name_check" CHECK ("orchestration_tool_calls"."tool_name" in ('list_connected_accounts', 'validate_post', 'publish_now', 'prepare_review', 'save_profile_entry', 'schedule_post', 'propose_image_job', 'update_business_identity', 'upsert_profile_entry', 'skip_competitors', 'research_competitors', 'save_tone_rule', 'complete_setup_if_ready'));