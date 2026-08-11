# Rationale: Autonomous schedule planner

## Context

Feature 15 taught chat to schedule when the user gives a concrete time or accepts a plan. Vague multi slot asks stay plan only. That blocks the product stand of a contextual agentic social operator that can decide topic, format, and timing from real business context when the user asks it to take the lead.

SOC-39 was parked in 0012. Profile, competitors, cadence, and calendar already exist as inputs. Analytics and live competitor scrape do not.

## Options considered

### Option 1: Chat-triggered brief + schedule in turn

Trusted code builds a brief; model schedules up to a raised cap in the same turn.

**Pros**: Matches “do it yourself” language; reuses schedule_post and Calendar; ships without analytics.

**Cons**: Heuristic times; one turn cap; no always on manager.

### Option 2: Plan then auto accept

Always show a plan and wait for acceptance.

**Pros**: Safer.

**Cons**: Not autonomous enough for the ask.

### Option 3: Background cron planner

Schedule on a timer without chat.

**Pros**: True always on manager.

**Cons**: Needs trust, jobs, and ops; out of scope for this slice.

## Rationale

Option 1 matches the locked product decisions: chat-triggered commit, heuristic timing plus profile cadence and occupancy, schedule only. The brief keeps decisions grounded so the model cannot invent metrics or competitors. Analytics and background cadence stay follow ups.

## References

- [0012 chat schedule loop](../0012-chat-schedule-loop/index.md)
- [0009 setup agent business profile](../0009-setup-agent-business-profile/index.md)
- [0010 schedule calendar](../0010-schedule-calendar/index.md)
- Plan: Contextual autonomous schedule planner (SOC-39)
