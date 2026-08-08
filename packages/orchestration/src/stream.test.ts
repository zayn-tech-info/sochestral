import { describe, expect, it } from "vitest";
import {
  STEP_LABELS,
  createSequenceSink,
  type OrchestrationStreamEvent,
} from "./stream.js";

describe("createSequenceSink", () => {
  it("assigns monotonic sequence numbers to stream events (SOC-8 AC-5)", () => {
    const events: OrchestrationStreamEvent[] = [];
    const sink = createSequenceSink((event) => {
      events.push(event);
    });

    sink.emit({ type: "turn_started" });
    sink.emit({ type: "step_started", step: "preparing_draft" });
    sink.emit({ type: "thinking_delta", delta: "reason" });
    sink.emit({ type: "thinking_completed" });
    sink.emit({ type: "step_completed", step: "preparing_draft" });
    sink.emit({ type: "turn_completed", result: { ok: true } });

    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(events.map((event) => event.type)).toEqual([
      "turn_started",
      "step_started",
      "thinking_delta",
      "thinking_completed",
      "step_completed",
      "turn_completed",
    ]);
    expect(events[2]).toMatchObject({
      type: "thinking_delta",
      delta: "reason",
      sequence: 3,
    });
  });

  it("keeps product owned step labels stable", () => {
    expect(STEP_LABELS).toEqual({
      checking_intent: "Checking intent",
      clarifying_intent: "Clarifying intent",
      preparing_draft: "Preparing a draft",
      validating: "Validating",
      publishing: "Publishing",
    });
  });
});
