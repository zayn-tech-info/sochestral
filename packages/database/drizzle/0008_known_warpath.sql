CREATE TABLE "business_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"business_name" text,
	"business_description" text,
	"website_url" text,
	"target_audience" text,
	"industry" text,
	"setup_status" text DEFAULT 'not_started' NOT NULL,
	"setup_step" text,
	"competitors_skipped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_profiles_setup_status_check" CHECK ("business_profiles"."setup_status" in ('not_started', 'in_progress', 'complete'))
);
--> statement-breakpoint
CREATE TABLE "profile_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_entries_category_check" CHECK ("profile_entries"."category" in ('tone', 'do_not', 'cadence', 'competitor', 'audience', 'skill', 'brand_fact')),
	CONSTRAINT "profile_entries_status_check" CHECK ("profile_entries"."status" in ('proposed', 'active', 'rejected', 'archived')),
	CONSTRAINT "profile_entries_source_check" CHECK ("profile_entries"."source" in ('setup', 'settings', 'operator_confirm', 'research'))
);
--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_entries" ADD CONSTRAINT "profile_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_profiles_user_id_uidx" ON "business_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profile_entries_user_id_idx" ON "profile_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profile_entries_user_category_idx" ON "profile_entries" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "profile_entries_user_status_idx" ON "profile_entries" USING btree ("user_id","status");
