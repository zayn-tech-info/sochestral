CREATE TABLE "drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"body" text NOT NULL,
	"media_urls" text[],
	"status" text DEFAULT 'draft' NOT NULL,
	"last_error" text,
	"mcp_post_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drafts_platform_check" CHECK ("drafts"."platform" in ('threads', 'linkedin', 'instagram')),
	CONSTRAINT "drafts_status_check" CHECK ("drafts"."status" in ('draft', 'approved', 'publish_requested', 'published', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drafts_user_id_idx" ON "drafts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "drafts_user_id_status_idx" ON "drafts" USING btree ("user_id","status");