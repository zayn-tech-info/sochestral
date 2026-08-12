ALTER TABLE "business_profiles" ADD COLUMN "persona_role" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "persona_role_other" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "primary_platforms" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "attribution_source" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "attribution_other" text;
