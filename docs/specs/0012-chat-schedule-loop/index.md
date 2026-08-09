# 0012. Chat schedule loop

**Date**: 2026-08-09
**Status**: In Progress

## Summary

Chat can draft for preview, publish live through existing authority, and schedule posts through SocialMCP. The agent understands the ask before tools run, proposes original content, caps media at five images, and calls `schedule_post` only when schedule intent and a publish time are clear. Multi day series wait for an accepted plan. No Neon schedule store and no autonomous planner.

## Requirements

**User stories**:

- As a business owner, I want to tell the agent to schedule a post so that it lands in SocialMCP and shows on Calendar and Scheduled Posts.
- As a business owner, I want the agent to draft and preview content before or while scheduling so that I can see what will go out.
- As a business owner, when my ask is ambiguous or over constrained (for example ten days with five images), I want clarify questions and a proposed plan before any schedule tool runs.

**Acceptance criteria**:

- **AC-1**: Orchestration allowlists SocialMCP `schedule_post` with Zod validation: platforms, text (optional when media only), `publishAt` UTC ISO required, `mediaAssetIds` max 5, optional connected account fields. Invalid args → 422 product error.
- **AC-2**: Intent classification includes `schedule` beside `live`, `draft`, and `unclear`. Clarify UI offers Schedule as a goal. `schedule` does not set `explicitLiveIntent` (live auto publish stays separate).
- **AC-3**: `SYSTEM_MESSAGE` requires understand before act; for schedule intent with known `publishAt` (or an accepted plan), call `schedule_post` directly and do not stop at `prepare_review`; use `prepare_review` for draft/preview asks; never claim scheduled unless the tool succeeded; never use canned regression reply banks for content.
- **AC-4**: More than five media on a turn is rejected by existing upload/validation limits; the agent must tell the user the cap and ask which images to keep when the ask exceeds five.
- **AC-5**: Multi day or multi post series: agent proposes a plan in chat and waits for acceptance; does not auto call `schedule_post` N times for an unconfirmed series (SOC-39 out of scope).
- **AC-6**: Publishing modes still gate live auto publish. Explicit schedule intent may call `schedule_post` even when mode is `always_draft`.
- **AC-7**: Successful schedule tool result is summarized safely (no tokens); stream/UI can deep link to `/app/calendar` or `/app/scheduled`.
- **AC-8**: DB `orchestration_tool_calls` name check includes `schedule_post`; `live_intent_kind` check allows `schedule`.
- **AC-9**: Unit tests cover validation, intent schedule path, and a service happy path that calls `schedule_post` with `publishAt`.

## Decision

**Chosen option**: Schedule via SocialMCP `schedule_post` when schedule intent and time are clear (map product `publishAt` to MCP `scheduledAt` with `confirm: true`); use `prepare_review` for draft/preview asks; extend intent with `schedule`; no Neon mirror; no SOC-39 planner.

**Implementation skills**: `hono` (`.agents/skills/hono/`) · `postgres-drizzle` (`.agents/skills/postgres-drizzle/`)

## Rationale

Reasoning: see [rationale.md](./rationale.md).

## Feature design

**Data model sketch**:

No new product schedule tables. Extend check constraints on `orchestration_tool_calls.tool_name` and `orchestration_runs.live_intent_kind`.

**API surface**:

| Surface | Change |
|---|---|
| Model tool `schedule_post` | MCP via orchestration gateway |
| Intent classify | enum adds `schedule` |
| Clarify goal options | adds Schedule a post |
| Chat UI | schedule option + success link |

**Value sourcing**:

| Value | Source |
|---|---|
| `publishAt` | Model tool arg from user when / clarify |
| Media cap | Existing upload + schema max 5 |
| Schedule rows on calendar | SocialMCP list (0010/0011) after `schedule_post` |
| Intent `schedule` | Classifier + clarify answers |

**Key invariants**:

- Never claim scheduled without successful tool result.
- Live auto publish still requires `explicitLiveIntent`.
- No Neon schedules table.

**Security model**: Session user → MCP JWT `sub`. Safe tool summaries only.

**Configuration required**: None new.

**Critical test scenarios**:

- Happy path schedule with `publishAt` → MCP called, verifies **AC-1**, **AC-3**, **AC-9**
- Intent schedule from clarify → `liveIntentKind` schedule, not live, verifies **AC-2**, **AC-6**
- Invalid schedule args → 422, verifies **AC-1**
- Media max 5 enforced, verifies **AC-4**

## Build plan

1. [x] Migration + schema: `schedule_post` tool name, `schedule` intent kind, satisfies **AC-8**
2. [x] Zod + allowlist + MCP gateway + `safeToolSummary` for `schedule_post`, satisfies **AC-1**, **AC-7**
3. [x] Intent classifier + clarify questions + `SYSTEM_MESSAGE` + service wiring, satisfies **AC-2**, **AC-3**, **AC-5**, **AC-6**
4. [x] Web intent option + schedule success deep link; tests, satisfies **AC-2**, **AC-7**, **AC-9**

## Consequences

**Positive**: Chat can create schedules that calendar already displays.

**Negative / tradeoffs**: Multi day automation waits for SOC-39; reschedule still MCP limited.

**Neutral**: Feature 10 verify stays independent.

## Follow-up

- [ ] SOC-39 autonomous schedule planner
- [ ] Manual create form (0011 deferred)
- [ ] MCP reschedule verb
