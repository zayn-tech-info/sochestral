# 0007. Intent clarify and Thinking UI

**Date**: 2026-08-05
**Status**: In Progress

## Summary

When Approve for me or Full access cannot tell live publish from draft, Sochestral asks a short product owned question instead of silently creating another review draft. The chat UI gains a Claude like Thinking disclosure: collapsed safe step labels such as Checking intent and Preparing a draft, with an expand path that shows sanitized model reasoning from Thesean extended thinking. Additive NDJSON streaming delivers those steps and thinking deltas live while sync JSON routes stay for recovery.

## Requirements

**User stories**:
- As a business owner on Full access, I want unclear go ahead wording to produce a clarify question so that Sochestral never invents a draft or publishes by accident.
- As a business owner, I want to watch safe progress steps and optionally open model thinking so that I understand what Sochestral is doing during a turn.

**Acceptance criteria**:
- **AC-1**: For effective modes `approve_for_me` and `full_access`, product owned intent resolution returns one of `live`, `draft`, or `unclear` before the chat tool loop. Always draft keeps draft first behavior and never enters the unclear ask gate.
- **AC-2**: Local veto maps obvious draft, edit, preview, validate, negation, and question wording to `draft`. Clear affirmative live wording may resolve to `live` only through the forced Thesean intent tool. Ambiguous action like wording that is not an obvious draft maps to `unclear` when the classifier is false, missing, or errors.
- **AC-3**: An `unclear` result persists a product owned clarify assistant message (publish live versus keep as draft, naming inherited platforms when known), creates no run tool calls, and never calls `prepare_review` for that turn.
- **AC-4**: `live` keeps the trusted automatic publish path after `prepare_review`. `draft` still prepares review without automatic publish. Chat model tools cannot authorize live publishing.
- **AC-5**: Each run stores `liveIntentKind` (`live` | `draft` | `unclear` | null for Always draft turns without classification) and keeps `explicitLiveIntent` true only when kind is `live`.
- **AC-6**: Additive NDJSON stream routes emit ordered events for turn start, safe step start and complete, thinking deltas, assistant text, tool status, and terminal completion or failure. Sync JSON create and message routes remain for recovery.
- **AC-7**: Safe step labels are product controlled strings only (`checking_intent`, `preparing_draft`, `validating`, `publishing`, and siblings named in this spec). They never include tool arguments or secrets.
- **AC-8**: When `THESEAN_THINKING_ENABLED=true` and the model supports it, chat model completions capture thinking text, stream `thinking_delta` events, and persist sanitized thinking on the run. When disabled or unsupported, steps still stream and the disclosure shows a safe unavailable message.
- **AC-9**: Thinking text is redacted like other public projections (no tokens, secrets, raw tool args). Full thinking is never written to info level logs.
- **AC-10**: The web composer consumes the stream by default. Collapsed Thinking shows the current or final safe step label. Expanding shows persisted or live thinking. Tool activity remains a separate disclosure under the same assistant message. Clarify turns show assistant text only with no review launcher.

## Decision

**Chosen option**: Product owned ternary intent with clarify turns, plus streamed safe steps and optional Thesean extended thinking in an expandable Thinking UI.

**Implementation skills**: `hono` (`.agents/skills/hono/`) · `postgres-drizzle` (`.agents/skills/postgres-drizzle/`) · `drizzle-orm-patterns` (`.agents/skills/drizzle-orm-patterns/`)

## Rationale

See [rationale.md](./rationale.md).

## Feature design

**Data model sketch**:
- `orchestration_runs.live_intent_kind` text nullable, check in (`live`, `draft`, `unclear`) when present.
- `orchestration_runs.thinking_text` text nullable (sanitized final thinking for history).
- `explicit_live_intent` remains boolean, derived as kind equals `live`.

**State transitions**:
- Intent: classify → `live` | `draft` | `unclear` (Approve for me / Full access only).
- Unclear turn: user message + clarify assistant, no running tool loop.
- Thinking: empty → streaming deltas → persisted final text on completed run.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/orchestration/conversations/stream` | POST | message, requestId, mediaAssetIds | NDJSON progress + terminal TurnResponse | session | pre stream JSON errors; after start `turn_failed` |
| `/orchestration/conversations/:id/messages/stream` | POST | message, requestId, mediaAssetIds | NDJSON progress + terminal TurnResponse | owner session | same |
| existing create/message JSON | POST | same | TurnResponse including `liveIntentKind`, `thinkingText` on run | session | existing |

**Stream event kinds** (one JSON object per line, monotonic `sequence`):
- `turn_started`
- `step_started` / `step_completed` with `step`: `checking_intent` | `preparing_draft` | `validating` | `publishing` | `clarifying_intent`
- `thinking_delta` with `delta` string; `thinking_completed`
- `assistant_delta`, `tool_started`, `tool_completed`, `review_groups`
- `turn_completed` | `turn_failed` with canonical public response

**Value sourcing**:

| Action | Value produced | Source |
|---|---|---|
| Resolve intent kind | live/draft/unclear | local veto + Thesean forced tool + mode gate |
| Clarify copy | assistant text | product template + inherited target platforms |
| Step label | UI string | trusted orchestration emission only |
| Thinking text | disclosure body | Thesean thinking blocks, then `redactText` |
| Auto publish | review outcome | existing trusted review service when kind is live |

**Key invariants**:
- Chat model output never sets `liveIntentKind` or triggers publish without product snapshot.
- Unclear turns never call `prepare_review`.
- Thinking never appears in assistant markdown content.

**Security model**:
- Same session ownership as 0003.
- Thinking is user visible to the owning session only.
- Stream events remain free of MCP JWTs, OAuth tokens, and raw tool inputs.

**Configuration required**:
- `THESEAN_THINKING_ENABLED`: enable extended thinking capture and stream (default false).
- `THESEAN_THINKING_BUDGET_TOKENS`: optional positive integer budget (default 2048).

**Amends**:
- 0003 **AC-12**: thinking deltas and persisted thinking are allowed when sanitized under this spec; raw provider events and tool arguments remain forbidden.
- 0004 tool activity AC: Thinking disclosure is an additional control; tool activity rules unchanged.
- 0006 **AC-4**: non live is no longer always draft; `unclear` asks first under Approve for me and Full access.

**Critical test scenarios**:
- Happy path: Full access + clear “Publish this on Threads now” → live → prepare + publish, verifies **AC-1**, **AC-4**.
- Unclear: Full access + “Just shot it there” with prior Threads context → clarify, no prepare_review, verifies **AC-2**, **AC-3**.
- Draft: “Draft this for Threads” → draft path prepare only, verifies **AC-2**, **AC-4**.
- Stream: step and thinking events then terminal JSON, verifies **AC-6**, **AC-7**, **AC-8**.
- Flag off: steps without thinking body, verifies **AC-8**.

## Build plan

1. Migrate `live_intent_kind` and `thinking_text` on `orchestration_runs`, satisfies **AC-5**, **AC-8**.
2. Implement ternary intent resolver and unclear clarify turn in orchestration, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**.
3. Enable Thesean thinking capture with flag, redaction, and persistence, satisfies **AC-8**, **AC-9**.
4. Add NDJSON stream routes and step or thinking emitters, satisfies **AC-6**, **AC-7**.
5. Wire web stream client and Thinking disclosure UI, satisfies **AC-10**.
6. Tests for intent, stream contract, and UI disclosure, satisfies **AC-1** through **AC-10**.

## Consequences

**Positive**:
- Stops silent duplicate drafts on slangy go aheads.
- Gives live progress and optional reasoning without weakening publish authority.

**Negative / tradeoffs**:
- Thinking increases token cost and needs a Thesean capability smoke.
- Spec 0003 no longer forbids all reasoning exposure.

**Neutral**:
- Sync JSON routes remain; stream is additive.

## Follow-up

- [ ] Smoke Thesean extended thinking on the configured model before enabling the flag in production.
- [ ] `/sync` AGENTS.md for stream routes and thinking env vars after merge.
