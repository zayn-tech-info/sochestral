CREATE TABLE "orchestration_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orchestration_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"sequence" integer NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orchestration_messages_role_check" CHECK ("orchestration_messages"."role" in ('user', 'assistant'))
);
--> statement-breakpoint
CREATE TABLE "orchestration_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"trigger_message_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"target_platforms" text[] NOT NULL,
	"model_step_count" integer DEFAULT 0 NOT NULL,
	"provider_attempt_count" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"duration_ms" integer,
	"safe_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "orchestration_runs_status_check" CHECK ("orchestration_runs"."status" in ('running', 'completed', 'failed')),
	CONSTRAINT "orchestration_runs_model_step_count_check" CHECK ("orchestration_runs"."model_step_count" between 0 and 4),
	CONSTRAINT "orchestration_runs_provider_attempt_count_check" CHECK ("orchestration_runs"."provider_attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orchestration_tool_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"provider_call_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"arguments" jsonb NOT NULL,
	"result" jsonb,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"duration_ms" integer,
	"safe_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "orchestration_tool_calls_name_check" CHECK ("orchestration_tool_calls"."tool_name" in ('list_connected_accounts', 'validate_post', 'publish_now')),
	CONSTRAINT "orchestration_tool_calls_status_check" CHECK ("orchestration_tool_calls"."status" in ('pending', 'succeeded', 'failed')),
	CONSTRAINT "orchestration_tool_calls_attempt_count_check" CHECK ("orchestration_tool_calls"."attempt_count" between 1 and 2)
);
--> statement-breakpoint
ALTER TABLE "orchestration_conversations" ADD CONSTRAINT "orchestration_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestration_messages" ADD CONSTRAINT "orchestration_messages_conversation_id_orchestration_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."orchestration_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD CONSTRAINT "orchestration_runs_conversation_id_orchestration_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."orchestration_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD CONSTRAINT "orchestration_runs_trigger_message_id_orchestration_messages_id_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."orchestration_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orchestration_tool_calls" ADD CONSTRAINT "orchestration_tool_calls_run_id_orchestration_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."orchestration_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orchestration_conversations_user_updated_idx" ON "orchestration_conversations" USING btree ("user_id","updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "orchestration_messages_conversation_sequence_unique" ON "orchestration_messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "orchestration_messages_request_id_unique" ON "orchestration_messages" USING btree ("request_id") WHERE "orchestration_messages"."request_id" is not null;--> statement-breakpoint
CREATE INDEX "orchestration_messages_conversation_sequence_idx" ON "orchestration_messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "orchestration_runs_one_active_conversation_unique" ON "orchestration_runs" USING btree ("conversation_id") WHERE "orchestration_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "orchestration_runs_conversation_created_idx" ON "orchestration_runs" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orchestration_tool_calls_run_provider_id_unique" ON "orchestration_tool_calls" USING btree ("run_id","provider_call_id");--> statement-breakpoint
CREATE INDEX "orchestration_tool_calls_run_created_idx" ON "orchestration_tool_calls" USING btree ("run_id","created_at");