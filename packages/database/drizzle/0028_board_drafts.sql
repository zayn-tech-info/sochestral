ALTER TABLE "content_items" ADD COLUMN "draft_local_time" text;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "draft_accounts" jsonb;--> statement-breakpoint
ALTER TABLE "content_items" ADD COLUMN "draft_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
