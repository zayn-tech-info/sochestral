CREATE TABLE "conversation_content_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"horizon_days" integer DEFAULT 14 NOT NULL,
	"platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_type" text,
	"direction" text,
	"themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accepted_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"research_summary" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_content_plans" ADD CONSTRAINT "conversation_content_plans_conversation_id_orchestration_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."orchestration_conversations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversation_content_plans" ADD CONSTRAINT "conversation_content_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_content_plans_conversation_unique" ON "conversation_content_plans" USING btree ("conversation_id");
--> statement-breakpoint
CREATE INDEX "conversation_content_plans_user_idx" ON "conversation_content_plans" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "conversation_content_plans" ADD CONSTRAINT "conversation_content_plans_horizon_check" CHECK ("horizon_days" between 1 and 30);
--> statement-breakpoint
ALTER TABLE "orchestration_tool_calls" DROP CONSTRAINT "orchestration_tool_calls_name_check";
--> statement-breakpoint
ALTER TABLE "orchestration_tool_calls" ADD CONSTRAINT "orchestration_tool_calls_name_check" CHECK ("orchestration_tool_calls"."tool_name" in ('list_connected_accounts', 'validate_post', 'publish_now', 'prepare_review', 'save_profile_entry', 'schedule_post', 'propose_image_job', 'research_web', 'save_content_plan', 'update_business_identity', 'upsert_profile_entry', 'skip_competitors', 'research_competitors', 'save_tone_rule', 'complete_setup_if_ready'));
