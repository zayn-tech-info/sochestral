ALTER TABLE "image_jobs" ADD COLUMN "result_media_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "image_jobs" ADD COLUMN "variant_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "image_jobs" ADD CONSTRAINT "image_jobs_variant_count_check" CHECK ("variant_count" between 1 and 3);
