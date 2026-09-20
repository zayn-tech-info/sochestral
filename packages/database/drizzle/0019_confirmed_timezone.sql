ALTER TABLE "business_profiles" ADD COLUMN "timezone" text;
--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "timezone_confirmed_at" timestamp with time zone;
