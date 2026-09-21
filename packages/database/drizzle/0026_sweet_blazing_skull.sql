CREATE TABLE "content_generation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"plan_version" integer NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"claim_token" text,
	"lease_expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_generation_jobs_status_check" CHECK ("content_generation_jobs"."status" in ('submitted', 'running', 'applied', 'needs_attention'))
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"plan_version" integer NOT NULL,
	"calendar_item_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_items_status_check" CHECK ("content_items"."status" in ('blocked', 'ready'))
);
--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"revision" integer NOT NULL,
	"caption" text NOT NULL,
	"destinations" jsonb NOT NULL,
	"format" text NOT NULL,
	"asset_needs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"block_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_revisions_block_reason_check" CHECK ("content_revisions"."block_reason" is null or "content_revisions"."block_reason" in ('missing_media', 'unverified_placeholder'))
);
--> statement-breakpoint
ALTER TABLE "content_generation_jobs" ADD CONSTRAINT "content_generation_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_generation_jobs" ADD CONSTRAINT "content_generation_jobs_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_item_id_content_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_generation_jobs_plan_version_uidx" ON "content_generation_jobs" USING btree ("plan_id","plan_version");--> statement-breakpoint
CREATE INDEX "content_generation_jobs_status_idx" ON "content_generation_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "content_items_plan_version_calendar_uidx" ON "content_items" USING btree ("plan_id","plan_version","calendar_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_revisions_item_revision_uidx" ON "content_revisions" USING btree ("item_id","revision");