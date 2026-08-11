import { describe, expect, it } from "vitest";
import {
  STEP_LABELS,
  createSequenceSink,
  type OrchestrationStreamEvent,
} from "./stream.js";

describe("createSequenceSink", () => {
  it("assigns monotonic sequence numbers to stream events", () => {
    const events: OrchestrationStreamEvent[] = [];
    const sink = createSequenceSink((event) => {
      events.push(event);
    });

    sink.emit({ type: "turn_started" });
    sink.emit({ type: "step_started", step: "preparing_draft" });
    sink.emit({
      type: "intent_questions",
      questions: [
        {
          id: "goal",
          prompt: "What should I do?",
          options: [{ id: "draft_review", label: "Draft" }],
        },
      ],
    });
    sink.emit({ type: "step_completed", step: "preparing_draft" });
    sink.emit({ type: "turn_completed", result: { ok: true } });

    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(events.map((event) => event.type)).toEqual([
      "turn_started",
      "step_started",
      "intent_questions",
      "step_completed",
      "turn_completed",
    ]);
    expect(events[2]).toMatchObject({
      type: "intent_questions",
      sequence: 3,
    });
  });

  it("keeps product owned step labels stable", () => {
    expect(STEP_LABELS).toEqual({
      understanding: "Reading your message",
      checking_intent: "Checking intent",
      clarifying_intent: "Clarifying intent",
      planning: "Planning from your context",
      preparing_draft: "Preparing a draft",
      validating: "Validating",
      scheduling: "Scheduling",
      publishing: "Publishing",
    });
  });
});
