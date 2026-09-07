ALTER TABLE "image_job_inputs" DROP CONSTRAINT "image_job_inputs_brand_asset_id_brand_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "image_job_inputs" ADD CONSTRAINT "image_job_inputs_brand_asset_id_brand_assets_id_fk" FOREIGN KEY ("brand_asset_id") REFERENCES "public"."brand_assets"("id") ON DELETE cascade ON UPDATE no action;