CREATE TABLE "usage_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" text NOT NULL,
	"role" text NOT NULL,
	"kind" text DEFAULT 'model' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"attempt" integer NOT NULL,
	"outcome" text DEFAULT 'started' NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cache_write_tokens" integer,
	"reasoning_tokens" integer,
	"duration_ms" integer,
	"internal_cost_usd" numeric(20, 9),
	"cost_status" text DEFAULT 'unresolved' NOT NULL,
	"rate_card_version" text,
	"customer_charge_status" text DEFAULT 'unassessed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "usage_attempts" ADD CONSTRAINT "usage_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_attempts_user_parent_idx" ON "usage_attempts" USING btree ("user_id","parent_id");