ALTER TABLE "plan_revision_batches" ADD COLUMN "claim_token" text;--> statement-breakpoint
ALTER TABLE "plan_revision_batches" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plan_revision_batches" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plan_revision_batches" ADD COLUMN "error_code" text;