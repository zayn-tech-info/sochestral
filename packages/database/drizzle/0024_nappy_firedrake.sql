ALTER TABLE "plan_comments" ADD COLUMN "reattached_from_id" text;--> statement-breakpoint
ALTER TABLE "plan_revision_batches" ADD COLUMN "comment_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "plan_comments" ADD CONSTRAINT "plan_comments_reattached_from_id_plan_comments_id_fk" FOREIGN KEY ("reattached_from_id") REFERENCES "public"."plan_comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_comments" ADD CONSTRAINT "plan_comments_reattached_from_id_unique" UNIQUE("reattached_from_id");--> statement-breakpoint
UPDATE "plan_revision_batches" AS batch
SET "comment_ids" = COALESCE((SELECT jsonb_agg(comment.id ORDER BY comment.created_at, comment.id)
  FROM "plan_comments" AS comment WHERE comment.batch_id = batch.id), '[]'::jsonb);
