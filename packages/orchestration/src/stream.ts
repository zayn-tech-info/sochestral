export type OrchestrationStreamStep =
  | "checking_intent"
  | "clarifying_intent"
  | "preparing_draft"
  | "validating"
  | "publishing";

export type OrchestrationStreamEventInput =
  | { type: "turn_started" }
  | {
      type: "step_started" | "step_completed";
      step: OrchestrationStreamStep;
    }
  | { type: "thinking_delta"; delta: string }
  | { type: "thinking_completed" }
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
  checking_intent: "Checking intent",
  clarifying_intent: "Clarifying intent",
  preparing_draft: "Preparing a draft",
  validating: "Validating",
  publishing: "Publishing",
};
