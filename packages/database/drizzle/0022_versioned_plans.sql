CREATE TABLE "plan_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"version" integer NOT NULL,
	"block_id" text NOT NULL,
	"quote" text,
	"quote_context" text,
	"range_start" integer,
	"range_end" integer,
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"batch_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_revision_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"version" integer NOT NULL,
	"parent_version" integer,
	"document" jsonb NOT NULL,
	"context_id" text,
	"changed_block_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"handled_comment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text,
	"title" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"scope" text NOT NULL,
	"target_id" text NOT NULL,
	"revision" integer NOT NULL,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_comments" ADD CONSTRAINT "plan_comments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_comments" ADD CONSTRAINT "plan_comments_batch_id_plan_revision_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."plan_revision_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_revision_batches" ADD CONSTRAINT "plan_revision_batches_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_context_id_generation_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."generation_contexts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_conversation_id_orchestration_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."orchestration_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_approvals" ADD CONSTRAINT "workflow_approvals_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_comments_plan_status_idx" ON "plan_comments" USING btree ("plan_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_versions_plan_version_uidx" ON "plan_versions" USING btree ("plan_id","version");--> statement-breakpoint
CREATE INDEX "plans_user_updated_idx" ON "plans" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_approvals_exact_uidx" ON "workflow_approvals" USING btree ("user_id","scope","target_id","revision");