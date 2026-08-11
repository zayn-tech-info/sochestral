# 0013. Autonomous schedule planner

**Date**: 2026-08-10
**Status**: In Progress

## Summary

When an operator asks chat to decide posting for them (topic, timing, format), orchestration builds a grounded context brief from the business profile, competitors, platform playbooks, cadence, and calendar occupancy, then the model calls `schedule_post` in that same turn. Timing uses heuristics until analytics exist. Autonomy schedules only; it never silent live publishes.

## Requirements

**User stories**:

- As a business owner, I want to tell the agent to manage posting itself so that it schedules real posts without me picking every time and topic.
- As a business owner, I want those choices grounded in my profile, competitors, platform norms, and existing calendar so that decisions are not random.
- As a business owner, I want to cancel on Calendar if I disagree so that I stay in control after autonomy runs.

**Acceptance criteria**:

- **AC-1**: Autonomy intent is detected from local cues (and clarify option “Decide and schedule for me”). It sets schedule path without `explicitLiveIntent`.
- **AC-2**: Autonomy bypasses plan-only (tools stay enabled) even when the user did not give a concrete clock time.
- **AC-3**: Before the model turn, trusted code builds a context brief from profile identity and entries (tone, audience, competitor, cadence, do_not, brand_fact), connected accounts, calendar occupancy for the planning window, and static platform playbooks with heuristic publishAt candidates. The brief is injected as authoritative system context; the model must not invent competitors, metrics, or times outside it.
- **AC-4**: Default planning horizon is 7 days unless the user names another window. Platforms are those named, else connected among Threads, LinkedIn Personal, and Instagram. Autonomy raises the per-turn `schedule_post` cap to 14 (non-autonomy stays 2). Candidates spread across about 85% of the horizon with platform `maxPostsPerDay` limits. Media cap stays 5.
- **AC-5**: If the profile minimum is incomplete or no connected accounts match the target platforms, autonomy refuses with a clear chat ask (finish setup / connect). It does not schedule randomly.
- **AC-6**: Autonomy never sets live auto publish. Publishing modes still gate `publish_now` / trusted live publish.
- **AC-7**: After successful `schedule_post`, the assistant summarizes what was scheduled and why (brief-grounded), and may deep link Calendar / Scheduled Posts.
- **AC-8**: Unit tests cover autonomy intent, brief building (candidates avoid occupancy), plan-only bypass, refuse paths, and schedule cap.

## Decision

**Chosen option**: Chat-triggered contextual autonomy with a trusted brief builder and heuristic timing (no analytics ingest, no background cron).

**Implementation skills**: `hono` (`.agents/skills/hono/`) · `postgres-drizzle` (`.agents/skills/postgres-drizzle/`)

## Rationale

Reasoning: see [rationale.md](./rationale.md).

## Feature design

**Data model sketch**:

No new product tables. Reuse profile, SocialMCP schedules, existing `live_intent_kind` = `schedule`. Autonomy is a turn-time flag derived from message/clarify, not a new DB enum.

**API surface**:

| Surface | Change |
|---|---|
| Intent helpers | `localAutonomousScheduleIntent`; clarify option `decide_schedule` |
| Context brief | Product-owned builder module; injected into system prompt |
| `schedule_post` | Cap 7 when autonomy active; description updated |
| Stream step | Optional `planning` while brief builds |

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| Autonomy detect | boolean | Local regex + clarify `decide_schedule` |
| Profile context | note + structured fields | `getCompiledProfile` / profile entries |
| Competitors | titles/bodies | Active `competitor` entries (no live scrape) |
| Connected platforms | list | Connector / `list_connected_accounts` |
| Occupancy | scheduledAt list | CalendarService `listSlots` / SocialMCP |
| Format guidance | playbook text | Static `platform-playbooks` module |
| publishAt candidates | UTC ISO list | Heuristic windows × cadence × free slots |
| Horizon | days | Default 7 or parsed from user message |
| Schedule rows | SocialMCP | Existing `schedule_post` |

**Key invariants**:

- Never claim scheduled without successful tool result.
- Never invent analytics or competitor scrape results.
- Autonomy schedules only; no silent live publish.
- Refuse when profile or connectors are insufficient.

**Security model**: Session user → MCP JWT `sub`. Brief contains no tokens. Safe tool summaries only.

**Configuration required**: None new (optional later: user timezone on chat; v1 uses UTC labeled candidates).

**Critical test scenarios**:

- Autonomy phrase → schedule intent, tools enabled, brief present, verifies **AC-1**, **AC-2**, **AC-3**
- Incomplete profile → refuse, no `schedule_post`, verifies **AC-5**
- Occupied slot skipped in candidates, verifies **AC-3**
- Cap 7 enforced under autonomy, verifies **AC-4**
- Live publish still gated, verifies **AC-6**

## Build plan

1. [x] Platform playbooks + timing heuristics + `buildAutonomyBrief` + unit tests (**AC-3**, **AC-4**, **AC-8**)
2. [x] Autonomy intent + clarify option + service branch (bypass plan-only, inject brief, raise cap, refuse paths) (**AC-1**, **AC-2**, **AC-5**, **AC-6**, **AC-7**)
3. [x] Stream `planning` label + tool description update (**AC-3**, **AC-7**)
4. [x] Tests + 0012 follow-up pointer (**AC-8**)

## Consequences

**Positive**: Operators get true “decide for me” scheduling grounded in real product context.

**Negative / tradeoffs**: Timing is heuristic until analytics; competitors are profile text only; no background cadence manager.

**Neutral**: Feature 15 concrete-time and plan-accept paths stay unchanged.

## Follow-up

- [ ] Analytics-backed best times
- [ ] Background autonomous cadence job
- [ ] Live competitor / account scrape
- [ ] MCP reschedule verb for Calendar edit
