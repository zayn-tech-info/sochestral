ALTER TABLE "draft_media" DROP CONSTRAINT "draft_media_asset_id_media_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "draft_publish_attempt_media" DROP CONSTRAINT "draft_publish_attempt_media_asset_id_media_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "orchestration_message_media" DROP CONSTRAINT "orchestration_message_media_asset_id_media_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "draft_media" ADD CONSTRAINT "draft_media_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "draft_publish_attempt_media" ADD CONSTRAINT "draft_publish_attempt_media_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "orchestration_message_media" ADD CONSTRAINT "orchestration_message_media_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;
