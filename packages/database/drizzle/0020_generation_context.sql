CREATE TABLE "generation_context_uses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"context_id" text NOT NULL,
	"role" text NOT NULL,
	"parent_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_contexts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"version" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_context_uses" ADD CONSTRAINT "generation_context_uses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_context_uses" ADD CONSTRAINT "generation_context_uses_context_id_generation_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."generation_contexts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_contexts" ADD CONSTRAINT "generation_contexts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_context_uses_parent_uidx" ON "generation_context_uses" USING btree ("user_id","role","parent_id","context_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_contexts_user_version_uidx" ON "generation_contexts" USING btree ("user_id","version");