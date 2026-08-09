CREATE TABLE "channel_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"external_id" text NOT NULL,
	"display_key" text,
	"status" text NOT NULL,
	"linked_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_identities_channel_check" CHECK ("channel_identities"."channel" in ('whatsapp', 'telegram')),
	CONSTRAINT "channel_identities_status_check" CHECK ("channel_identities"."status" in ('pending', 'active', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "channel_link_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_link_challenges_channel_check" CHECK ("channel_link_challenges"."channel" in ('whatsapp', 'telegram'))
);
--> statement-breakpoint
CREATE TABLE "channel_pending_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_identity_id" text NOT NULL,
	"kind" text NOT NULL,
	"group_id" text NOT NULL,
	"summary_text" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_pending_actions_kind_check" CHECK ("channel_pending_actions"."kind" in ('approve_group'))
);
--> statement-breakpoint
CREATE TABLE "whatsapp_inbound_receipts" (
	"wamid" text PRIMARY KEY NOT NULL,
	"channel_identity_id" text,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orchestration_conversations" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "channel_identities" ADD CONSTRAINT "channel_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_link_challenges" ADD CONSTRAINT "channel_link_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_pending_actions" ADD CONSTRAINT "channel_pending_actions_channel_identity_id_channel_identities_id_fk" FOREIGN KEY ("channel_identity_id") REFERENCES "public"."channel_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_inbound_receipts" ADD CONSTRAINT "whatsapp_inbound_receipts_channel_identity_id_channel_identities_id_fk" FOREIGN KEY ("channel_identity_id") REFERENCES "public"."channel_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_identities_active_external_unique" ON "channel_identities" USING btree ("channel","external_id") WHERE "channel_identities"."status" in ('pending', 'active');--> statement-breakpoint
CREATE UNIQUE INDEX "channel_identities_active_user_channel_unique" ON "channel_identities" USING btree ("user_id","channel") WHERE "channel_identities"."status" = 'active';--> statement-breakpoint
CREATE INDEX "channel_identities_user_channel_idx" ON "channel_identities" USING btree ("user_id","channel");--> statement-breakpoint
CREATE INDEX "channel_link_challenges_user_channel_idx" ON "channel_link_challenges" USING btree ("user_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_link_challenges_token_hash_unique" ON "channel_link_challenges" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_pending_actions_open_identity_unique" ON "channel_pending_actions" USING btree ("channel_identity_id") WHERE "channel_pending_actions"."consumed_at" is null;--> statement-breakpoint
CREATE INDEX "orchestration_conversations_user_source_idx" ON "orchestration_conversations" USING btree ("user_id","source");--> statement-breakpoint
ALTER TABLE "orchestration_conversations" ADD CONSTRAINT "orchestration_conversations_source_check" CHECK ("orchestration_conversations"."source" is null or "orchestration_conversations"."source" in ('web', 'whatsapp'));
