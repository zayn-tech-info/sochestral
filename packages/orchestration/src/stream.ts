export type OrchestrationStreamStep =
  | "understanding"
  | "checking_intent"
  | "checking_plan"
  | "clarifying_intent"
  | "planning"
  | "booking_campaign"
  | "preparing_draft"
  | "validating"
  | "scheduling"
  | "publishing";

export type OrchestrationStreamEventInput =
  | { type: "turn_started" }
  | {
      type: "step_started" | "step_completed";
      step: OrchestrationStreamStep;
    }
  | {
      type: "intent_questions";
      questions: Array<{
        id: string;
        prompt: string;
        reason?: string;
        options: Array<{
          id: string;
          label: string;
          recommended?: boolean;
          custom?: boolean;
        }>;
      }>;
    }
  | { type: "assistant_delta"; step: number; delta: string }
  | {
      type: "tool_started" | "tool_completed";
      toolName: string;
      status?: string;
    }
  | { type: "turn_completed"; result: unknown }
  | {
      type: "turn_failed";
      error: string;
      result?: unknown;
    };

export type OrchestrationStreamEvent = OrchestrationStreamEventInput & {
  sequence: number;
};

export type OrchestrationStreamSink = {
  emit: (event: OrchestrationStreamEventInput) => void;
};

export function createSequenceSink(
  write: (event: OrchestrationStreamEvent) => void,
): OrchestrationStreamSink {
  let sequence = 0;
  return {
    emit(event) {
      sequence += 1;
      write({ ...event, sequence });
    },
  };
}

export const STEP_LABELS: Record<OrchestrationStreamStep, string> = {
  understanding: "Thinking",
  checking_intent: "Figuring out what to do",
  checking_plan: "Checking your plan",
  clarifying_intent: "Asking a follow-up",
  planning: "Planning",
  booking_campaign: "Booking your campaign",
  preparing_draft: "Drafting",
  validating: "Checking the post",
  scheduling: "Scheduling",
  publishing: "Publishing",
};
