CREATE TABLE "board_schedule_confirmations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"plan_version" integer NOT NULL,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_schedule_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"confirmation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"item_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"destination" text NOT NULL,
	"connected_account_id" text NOT NULL,
	"local_time" text NOT NULL,
	"publish_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"receipt" jsonb,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_schedule_operations_status_check" CHECK ("board_schedule_operations"."status" in ('queued', 'scheduling', 'scheduled', 'needs_attention')),
	CONSTRAINT "board_schedule_operations_destination_check" CHECK ("board_schedule_operations"."destination" in ('threads', 'instagram', 'linkedin_personal'))
);
--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "excluded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plan_comments" ADD COLUMN "scope" text DEFAULT 'plan' NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_revision_batches" ADD COLUMN "kind" text DEFAULT 'plan' NOT NULL;--> statement-breakpoint
ALTER TABLE "board_schedule_confirmations" ADD CONSTRAINT "board_schedule_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_schedule_confirmations" ADD CONSTRAINT "board_schedule_confirmations_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_schedule_operations" ADD CONSTRAINT "board_schedule_operations_confirmation_id_board_schedule_confirmations_id_fk" FOREIGN KEY ("confirmation_id") REFERENCES "public"."board_schedule_confirmations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_schedule_operations" ADD CONSTRAINT "board_schedule_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_schedule_operations" ADD CONSTRAINT "board_schedule_operations_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_schedule_operations" ADD CONSTRAINT "board_schedule_operations_item_id_content_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_schedule_operations" ADD CONSTRAINT "board_schedule_operations_revision_id_content_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."content_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "board_schedule_operations_idempotency_uidx" ON "board_schedule_operations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "board_schedule_operations_plan_idx" ON "board_schedule_operations" USING btree ("plan_id");--> statement-breakpoint
ALTER TABLE "plan_comments" ADD CONSTRAINT "plan_comments_scope_check" CHECK ("plan_comments"."scope" in ('plan', 'board', 'post'));--> statement-breakpoint
ALTER TABLE "plan_revision_batches" ADD CONSTRAINT "plan_revision_batches_kind_check" CHECK ("plan_revision_batches"."kind" in ('plan', 'content'));