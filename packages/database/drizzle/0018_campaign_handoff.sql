ALTER TABLE "conversation_content_plans" ADD COLUMN "start_date" date;
--> statement-breakpoint
ALTER TABLE "conversation_content_plans" ADD COLUMN "timezone" text;
--> statement-breakpoint
ALTER TABLE "conversation_content_plans" ADD COLUMN "cadence" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "conversation_content_plans" ADD COLUMN "time_mode" text;
--> statement-breakpoint
ALTER TABLE "conversation_content_plans" ADD COLUMN "locked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "conversation_content_plans" ADD CONSTRAINT "conversation_content_plans_time_mode_check" CHECK ("time_mode" is null or "time_mode" in ('spread', 'windows'));
--> statement-breakpoint
CREATE TABLE "campaign_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"cap" integer DEFAULT 30 NOT NULL,
	"booked_count" integer DEFAULT 0 NOT NULL,
	"next_date" date NOT NULL,
	"day_attempts" integer DEFAULT 0 NOT NULL,
	"booked_publish_ats" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notice" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_jobs" ADD CONSTRAINT "campaign_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaign_jobs" ADD CONSTRAINT "campaign_jobs_conversation_id_orchestration_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."orchestration_conversations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "campaign_jobs" ADD CONSTRAINT "campaign_jobs_plan_id_conversation_content_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."conversation_content_plans"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_jobs_one_inflight_user" ON "campaign_jobs" USING btree ("user_id") WHERE "status" in ('queued', 'running', 'paused');
--> statement-breakpoint
CREATE INDEX "campaign_jobs_user_created_idx" ON "campaign_jobs" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "campaign_jobs_status_idx" ON "campaign_jobs" USING btree ("status","created_at");
--> statement-breakpoint
ALTER TABLE "campaign_jobs" ADD CONSTRAINT "campaign_jobs_status_check" CHECK ("status" in ('queued', 'running', 'paused', 'succeeded', 'stopped', 'failed'));
--> statement-breakpoint
ALTER TABLE "campaign_jobs" ADD CONSTRAINT "campaign_jobs_cap_check" CHECK ("cap" between 1 and 30);
--> statement-breakpoint
ALTER TABLE "campaign_jobs" ADD CONSTRAINT "campaign_jobs_booked_count_check" CHECK ("booked_count" >= 0);
--> statement-breakpoint
CREATE TABLE "voice_bibles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"brief_text" text,
	"source_hash" text NOT NULL,
	"status" text DEFAULT 'compiling' NOT NULL,
	"pending_at" timestamp with time zone,
	"compile_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_bibles" ADD CONSTRAINT "voice_bibles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "voice_bibles" ADD CONSTRAINT "voice_bibles_status_check" CHECK ("status" in ('current', 'compiling', 'failed'));
--> statement-breakpoint
CREATE INDEX "voice_bibles_pending_idx" ON "voice_bibles" USING btree ("status","pending_at");
