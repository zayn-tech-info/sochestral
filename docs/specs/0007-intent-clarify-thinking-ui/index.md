# 0007. Intent clarify, action labels, and Q&A carousel

**Date**: 2026-08-05
**Status**: In Progress
**Amended**: 2026-08-08 — action labels replace Thesean think-stream UI; structured `intent_questions` carousel for ambiguous or multi-goal turns.

## Summary

When Approve for me or Full access cannot tell live publish from draft, or when a turn mixes conflicting goals (for example suggest captions and also post), Sochestral asks structured product-owned questions instead of silently creating a review draft or publishing. The chat UI shows safe progress **action labels** (chevron + label such as Publishing or Preparing a draft) without an expandable think-log body. Additive NDJSON streaming delivers those steps and `intent_questions` live while sync JSON routes stay for recovery.

## Requirements

**User stories**:
- As a business owner on Full access, I want unclear go-ahead wording or mixed goals to produce a clarify Q&A so that Sochestral never invents a draft or publishes by accident.
- As a business owner, I want to watch safe progress action labels so that I understand what Sochestral is doing during a turn.

**Acceptance criteria**:
- **AC-1**: For effective modes `approve_for_me` and `full_access`, product owned intent resolution returns one of `live`, `draft`, or `unclear` before the chat tool loop. Always draft keeps draft-first behavior for clear turns; mixed suggest-and-post goals still emit structured intent questions before acting.
- **AC-2**: Local veto maps obvious draft, edit, preview, validate, suggest, caption, idea, recommend, negation, and question wording to `draft`. Clear affirmative live wording may resolve to `live` through local live matches or the forced Thesean intent tool. Ambiguous action-like wording that is not an obvious draft maps to `unclear` when the classifier is false, missing, or errors. Mixed help + post wording requires intent questions.
- **AC-3**: An `unclear` or mixed-goal clarify turn persists a short product owned assistant message, emits `intent_questions` (1..N questions, each with up to 4 options and Custom last), creates no run tool calls, and never calls `prepare_review` for that turn. Completing answers posts a follow-up with `intentAnswers` before acting.
- **AC-4**: `live` keeps the trusted automatic publish path after `prepare_review`. `draft` still prepares review without automatic publish. Chat model tools cannot authorize live publishing. Publish media allowlist is the current message attachments (and HTTPS image URLs in that message only).
- **AC-5**: Each run stores `liveIntentKind` (`live` | `draft` | `unclear` | null for Always draft turns without classification) and keeps `explicitLiveIntent` true only when kind is `live`.
- **AC-6**: Additive NDJSON stream routes emit ordered events for turn start, safe step start and complete, `intent_questions`, assistant text, tool status, and terminal completion or failure. Sync JSON create and message routes remain for recovery.
- **AC-7**: Safe step labels are product controlled strings only (`understanding`, `checking_intent`, `clarifying_intent`, `preparing_draft`, `validating`, `publishing`). They never include tool arguments or secrets.
- **AC-8**: Chat completions do **not** request Thesean extended thinking for the product UI. Steps still stream. The `thinking_text` column may remain unused. `THESEAN_THINKING_*` env vars are soft-deprecated.
- **AC-9**: Retained for history: any future thinking text would be redacted like other public projections. Full provider reasoning is never written to info level logs.
- **AC-10**: The web composer consumes the stream by default. A non-expandable action row shows the current or final safe step label (chevron + label + spinner while live). Ambiguous turns show a Motion Q&A carousel above the composer; until answers are submitted (or the user sends a new freeform message that replaces the pending clarify), no prepare or auto-publish runs.

## Decision

**Chosen option**: Product owned ternary intent with structured clarify Q&A, streamed safe action labels, and no Thesean think-stream UI.

**Implementation skills**: `hono` (`.agents/skills/hono/`) · `postgres-drizzle` (`.agents/skills/postgres-drizzle/`) · `drizzle-orm-patterns` (`.agents/skills/drizzle-orm-patterns/`)

## Rationale

See [rationale.md](./rationale.md). Amendment: product value is action visibility and intent confirmation, not model think-log disclosure.

## Feature design

**Data model sketch**:
- `orchestration_runs.live_intent_kind` text nullable, check in (`live`, `draft`, `unclear`) when present.
- `orchestration_runs.thinking_text` text nullable (legacy; unused by product UI after 2026-08-08 amendment).
- `explicit_live_intent` remains boolean, derived as kind equals `live`.

**State transitions**:
- Intent: classify → `live` | `draft` | `unclear` (Approve for me / Full access; mixed goals also clarify under Always draft before acting).
- Unclear / mixed turn: user message + clarify assistant + `intent_questions`, no running tool loop.
- Answer follow-up: `intentAnswers` resolve goal / platforms / media scope, then classify and act.
- Action labels: step_started / step_completed only (no thinking deltas).

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/orchestration/conversations/stream` | POST | message, requestId, mediaAssetIds, intentAnswers? | NDJSON progress + terminal TurnResponse (`intentQuestions` when clarifying) | session | pre stream JSON errors; after start `turn_failed` |
| `/orchestration/conversations/:id/messages/stream` | POST | message, requestId, mediaAssetIds, intentAnswers? | NDJSON progress + terminal TurnResponse | owner session | same |
| existing create/message JSON | POST | same | TurnResponse including `liveIntentKind`; optional `intentQuestions` | session | existing |

**Stream event kinds** (one JSON object per line, monotonic `sequence`):
- `turn_started`
- `step_started` / `step_completed` with `step`: `understanding` | `checking_intent` | `preparing_draft` | `validating` | `publishing` | `clarifying_intent`
- `intent_questions` with `questions` array
- `assistant_delta`, `tool_started`, `tool_completed`, `review_groups`
- `turn_completed` | `turn_failed` with canonical public response

**Value sourcing**:

| Action | Value produced | Source |
|---|---|---|
| Resolve intent kind | live/draft/unclear | local veto + Thesean forced tool + mode gate + answer resolution |
| Clarify UI | `intent_questions` + short assistant text | product templates + inherited platforms / current media |
| Step label | UI string | trusted orchestration emission only |
| Media allowlist | asset ids + URLs | current user message only |
| Auto publish | review outcome | existing trusted review service when kind is live |

**Key invariants**:
- Chat model output never sets `liveIntentKind` or triggers publish without product snapshot.
- Unclear and mixed-goal turns never call `prepare_review` until answers are submitted.
- Action labels never include tool arguments or secrets.
- Prior conversation media is never auto-included in live prepare for a new turn.

**Security model**:
- Same session ownership as 0003.
- Stream events remain free of MCP JWTs, OAuth tokens, and raw tool inputs.

**Configuration required**:
- `THESEAN_THINKING_ENABLED` / `THESEAN_THINKING_BUDGET_TOKENS`: soft-deprecated; unused by chat UI path.

**Amends**:
- 0003 **AC-12**: thinking deltas are no longer part of the product stream; raw provider events and tool arguments remain forbidden.
- 0004 tool activity AC: action label is an additional control; tool activity rules unchanged.
- 0006 **AC-4**: non live is no longer always draft; `unclear` asks first under Approve for me and Full access.
- SOC-8 closeout becomes action labels + intent Q&A, not Thesean think-stream smoke.

**Critical test scenarios**:
- Happy path: Full access + clear “Publish this on Threads now” → live → prepare + publish, verifies **AC-1**, **AC-4**.
- Unclear: Full access + “Just shot it there” with prior Threads context → intent questions, no prepare_review, verifies **AC-2**, **AC-3**.
- Mixed: “Suggest captions and post” → intent questions before act, verifies **AC-2**, **AC-3**.
- Draft: “Draft this for Threads” → draft path prepare only, verifies **AC-2**, **AC-4**.
- Media: live prepare uses only current-message attachments, verifies **AC-4**.
- Stream: step and intent_questions events then terminal JSON, verifies **AC-6**, **AC-7**, **AC-8**.
- UI: action label without expand body; carousel advances and submits answers, verifies **AC-10**.

## Build plan

1. Migrate `live_intent_kind` and `thinking_text` on `orchestration_runs`, satisfies **AC-5**.
2. Implement ternary intent resolver and unclear clarify turn in orchestration, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**.
3. Soft-deprecate Thesean thinking capture for product UI, satisfies **AC-8**, **AC-9**.
4. Add NDJSON stream routes, step emitters, and `intent_questions`, satisfies **AC-6**, **AC-7**.
5. Wire web stream client, action labels, and Q&A carousel, satisfies **AC-10**.
6. Tests for intent, stream contract, media scope, and UI, satisfies **AC-1** through **AC-10**.

## Consequences

**Positive**:
- Stops silent duplicate drafts on slangy go aheads and mixed goals.
- Gives live progress without a think-log product surface.
- Scopes publish media to the current turn.

**Negative / tradeoffs**:
- Clarify UX requires an extra answer turn for ambiguous requests.

**Neutral**:
- Sync JSON routes remain; stream is additive.
- `thinking_text` column retained unused.

## Follow-up

- [ ] `/sync` AGENTS.md for stream routes and soft-deprecated thinking env vars after merge.
- [ ] Update SOC-8 closeout notes to action labels + intent Q&A.
