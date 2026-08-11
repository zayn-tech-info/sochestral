export type OrchestrationStreamStep =
  | "understanding"
  | "checking_intent"
  | "clarifying_intent"
  | "planning"
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
  understanding: "Reading your message",
  checking_intent: "Checking intent",
  clarifying_intent: "Clarifying intent",
  planning: "Planning from your context",
  preparing_draft: "Preparing a draft",
  validating: "Validating",
  scheduling: "Scheduling",
  publishing: "Publishing",
};
