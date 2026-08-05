ALTER TABLE "orchestration_runs" ADD COLUMN "live_intent_kind" text;--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD COLUMN "thinking_text" text;--> statement-breakpoint
ALTER TABLE "orchestration_runs" ADD CONSTRAINT "orchestration_runs_live_intent_kind_check" CHECK ("orchestration_runs"."live_intent_kind" is null or "orchestration_runs"."live_intent_kind" in ('live', 'draft', 'unclear'));
