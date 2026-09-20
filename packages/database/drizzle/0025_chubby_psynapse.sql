CREATE TABLE "plan_interviews" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"state" jsonb NOT NULL,
	"plan_id" text,
	"context_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_interviews" ADD CONSTRAINT "plan_interviews_conversation_id_orchestration_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."orchestration_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_interviews" ADD CONSTRAINT "plan_interviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_interviews" ADD CONSTRAINT "plan_interviews_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_interviews" ADD CONSTRAINT "plan_interviews_context_id_generation_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."generation_contexts"("id") ON DELETE set null ON UPDATE no action;