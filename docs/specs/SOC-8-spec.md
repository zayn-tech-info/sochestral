# SOC-8. Feature 13 Thinking flag close out

**Date**: 2026-08-08
**Status**: Proposed
**Linear**: [SOC-8](https://linear.app/sochestral/issue/SOC-8/close-feature-13-thinking-ui-thesean-thinking-flag-smoke)
**Related**: [0007 Intent clarify and Thinking UI](./0007-intent-clarify-thinking-ui/index.md) (feature design already built)

## Summary

Feature 13 code already ships intent clarify, NDJSON progress steps, and the Thinking disclosure. SOC-8 closes the remaining gap: prove Thesean extended thinking on the cloud product path, turn on `THESEAN_THINKING_ENABLED` when that smoke passes (or record an intentional delay if it cannot), finish the missing automated tests, and mark formal verify Done. This is a close out enhancement of 0007, not a new product surface.

## Context

The Tracer Bullet chat path is proven on `https://app.sochestral.shop`. Intent clarify that blocks silent drafts is part of that path and is not the remaining risk. Spec 0007 already decided product owned ternary intent, safe step labels, additive NDJSON streaming, and optional Thesean thinking behind a flag that defaults false.

What remains is operational and verification work. Production may still keep thinking off. Automated coverage for thinking on, flag off behavior, stream contract, and the web disclosure is thin. `docs/specs/0007-intent-clarify-thinking-ui/verify.md` is Partial and tracks SOC-8.

Without closing this, Feature 13 cannot move to Done, Slice 1 close out stays open, and the Thinking UI either stays dark without a recorded reason or turns on without proof.

## Requirements

**User stories**:
- As an operator, I want cloud thinking enabled only after Thesean smoke so that users see real reasoning when the provider supports it, and we can roll back with one flag.
- As a business owner, I want the Thinking disclosure to show safe steps always, and sanitized model reasoning when the flag is on, so that progress stays clear even when thinking is unavailable.
- As a maintainer, I want automated tests for the thinking and stream contracts so that flag changes do not silently break disclosure or redact rules.

**Acceptance criteria**:
- **AC-1**: Cloud product env for `sochestral-api` has an explicit recorded value for `THESEAN_THINKING_ENABLED` (true after successful smoke, or false with an intentional delay note). Guessing is not enough.
- **AC-2**: When the flag is true and the Sonnet route in use supports extended thinking, one clear draft turn on the product URL streams `thinking_delta` events (or persists sanitized `thinkingText` on the run), and the web Thinking disclosure can expand to show that text.
- **AC-3**: When the flag is false, or the model rejects thinking, safe step events still stream; the disclosure shows steps and the product owned unavailable copy when no thinking body exists; chat never fails the turn solely because thinking is off.
- **AC-4**: Intent clarify behavior from 0007 stays unchanged: unclear Approve for me / Full access turns still ask and never call `prepare_review`; the intent classifier continues to force thinking off.
- **AC-5**: Automated tests cover at least: config true and budget override; model provider thinking payload and HTTP 400 thinking fallback; orchestration stream emission of `step_*` and `thinking_*` with flag on and flag off; API NDJSON content type and event lines for a streamed turn; web `apiStreamTurn` parsing of thinking deltas; Thinking disclosure unavailable copy when thinking text is empty.
- **AC-6**: `docs/specs/0007-intent-clarify-thinking-ui/verify.md` is updated from Partial to Done (or to Delayed with the intentional delay reason and owner) when AC-1 through AC-5 are satisfied for the chosen outcome.
- **AC-7**: No new env vars, schemas, routes, or UI patterns beyond 0007. Close out uses the existing flag, budget, stream events, and disclosure.

## Options considered

### Option 1: Enable after smoke, then close tests and verify

Keep the 0007 flag. Smoke Thesean extended thinking on the configured Sonnet route against the product URL. Set `THESEAN_THINKING_ENABLED=true` on Fly `sochestral-api` only after that smoke. Close the listed test gaps and finish `verify.md`.

**Pros**:
- Matches 0007 and the master plan close out order
- One flag rollback if Thesean misbehaves
- Leaves users with real Thinking value when ready

**Cons**:
- Needs a human with Fly and Thesean access for the live enable step
- Token cost rises once enabled

### Option 2: Document intentional delay and close only tests plus verify as Delayed

Leave the flag false in cloud. Write the delay reason into `verify.md`. Still add the automated tests so enable later is safe.

**Pros**:
- No live risk or cost until Thesean is ready
- Still hardens the suite

**Cons**:
- Feature 13 stays incomplete for users
- Does not satisfy the primary SOC-8 smoke intent unless smoke truly cannot pass

### Option 3: Redesign Thinking or remove the flag

Change stream shape, always on thinking, or a different disclosure model.

**Pros**:
- None for this close out

**Cons**:
- Reopens locked 0007 decisions
- Out of scope for SOC-8

## Decision

**Chosen option**: Option 1: Enable after smoke, then close tests and verify.

Primary path: confirm Thesean supports extended thinking on the Sonnet route, smoke one ambiguous Approve for me / Full access turn and one clear draft turn on the product URL, enable `THESEAN_THINKING_ENABLED` on cloud API when smoke passes, close test gaps, mark `verify.md` Done.

Fallback (only if smoke fails for a provider or account reason that code cannot fix): keep Option 2. Record intentional delay in `verify.md` with the failure evidence, leave the flag false, still land the automated tests. Do not invent a third architecture.

**Implementation skills**: `hono` (`.agents/skills/hono/`) · `test` (`.agents/skills/test/`)

## Rationale

0007 already chose optional Thesean thinking behind a default false flag so production could stay dark until smoke. The build is in place. The gap is proof, enablement, tests, and verify status. Fixing that in place is the lowest risk path. Redesign would reopen locked Slice 1 decisions without product need. Intentional delay is kept only as an evidence based escape hatch, not the default.

## Feature design

**Data model sketch**:
- No schema change. Reuse `orchestration_runs.thinking_text` and `live_intent_kind` from 0007 / migration `0007`.

**State transitions**:
- Flag off: steps stream; thinking body empty; disclosure unavailable copy in history.
- Flag on and supported: thinking deltas stream; sanitized text persists on completed run; disclosure expands to that text.
- Flag on and rejected by provider: existing model retry with thinking off; turn still completes; disclosure behaves like unavailable.

**API surface** (existing, no new routes):

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/orchestration/conversations/stream` | POST | message, requestId, mediaAssetIds | NDJSON including `step_*`, optional `thinking_*`, terminal turn | session | pre stream JSON; after start `turn_failed` |
| `/orchestration/conversations/:id/messages/stream` | POST | same | same | owner session | same |
| existing JSON create/message | POST | same | TurnResponse with `thinkingText` when present | session | existing |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Decide whether to send Thesean thinking | boolean | `THESEAN_THINKING_ENABLED` via orchestration config (`=== "true"`) |
| Thinking budget | positive int | `THESEAN_THINKING_BUDGET_TOKENS` (default 2048) |
| Stream step label | UI string | trusted orchestration `STEP_LABELS` / web `STREAM_STEP_LABELS` |
| Thinking delta / persisted text | disclosure body | Thesean thinking blocks, then existing `redactText` |
| Unavailable copy | disclosure body when empty | product owned string in web Thinking disclosure |
| Cloud flag outcome | verify.md result | Fly secret value plus smoke evidence, or recorded delay |
| Intent kind on clarify turn | live/draft/unclear | unchanged 0007 resolver; classifier forces thinking off |

**Key invariants**:
- Chat model tools still cannot authorize live publish.
- Unclear turns never call `prepare_review`.
- Thinking never appears in assistant markdown content.
- Stream events stay free of MCP JWTs, OAuth tokens, and raw tool inputs.
- Close out does not add routes, tables, or a second feature flag.

**Security model**:
- Same session ownership as 0003 / 0007.
- Thinking visible only to the owning session.
- Redaction rules from 0007 remain required for any persisted or streamed thinking.

**Configuration required** (existing):
- `THESEAN_THINKING_ENABLED`: enable extended thinking capture and stream (default false).
- `THESEAN_THINKING_BUDGET_TOKENS`: optional positive integer budget (default 2048).

**Critical test scenarios**:
- Happy path flag on: draft turn with thinking enabled emits `thinking_delta` and persists sanitized text, verifies **AC-2**, **AC-5**.
- Flag off: steps without thinking body; disclosure unavailable copy, verifies **AC-3**, **AC-5**.
- Provider rejects thinking: model retries without thinking; turn succeeds, verifies **AC-3**, **AC-5**.
- Unclear intent still clarifies with no `prepare_review`, verifies **AC-4**.
- API stream returns `application/x-ndjson` with ordered events, verifies **AC-5**.
- Cloud record: verify.md shows enabled after smoke or Delayed with reason, verifies **AC-1**, **AC-6**.

## Migration plan

**Strategy**: feature flagged; no data migration
**Phases**:
1. Land automated tests and any tiny glue fixes against the existing 0007 contracts (flag still false in cloud if not yet smoked).
2. Human operator confirms Thesean account support, runs product URL smoke (ambiguous clarify turn + clear draft turn), then sets Fly `sochestral-api` secret `THESEAN_THINKING_ENABLED=true` only on success.
3. Update `docs/specs/0007-intent-clarify-thinking-ui/verify.md` to Done, or to Delayed with evidence if smoke cannot pass.
**Rollback**: set `THESEAN_THINKING_ENABLED=false` on Fly `sochestral-api` and redeploy or refresh secrets; steps and clarify path keep working.
**Risks**: Thesean route may reject thinking (mitigated by existing 400 retry); higher token cost when enabled; cloud secret change needs operator access the build agent may lack.

## Build plan

Ordered for Tracer Bullet: thin proof through tests and docs first, then the live flag cut over, then verify close.

1. Add orchestration and model tests for thinking enabled, budget override, stream `step_*` / `thinking_*`, flag off path, and HTTP 400 thinking fallback, satisfies **AC-3**, **AC-5**.
2. Add API route test that a streamed turn responds with NDJSON event lines and includes step events (thinking events when the service emits them), satisfies **AC-5**.
3. Add web tests for `apiStreamTurn` thinking delta parsing and Thinking disclosure unavailable copy / expanded thinking body, satisfies **AC-2**, **AC-3**, **AC-5**.
4. Confirm intent clarify regression still covered (unclear → no `prepare_review`); extend only if a gap appears, satisfies **AC-4**.
5. Produce an operator checklist in the PR / issue comment for cloud smoke and Fly secret enable (or delay record). Do not invent secrets in repo files, satisfies **AC-1**, **AC-2**.
6. After smoke outcome is known, update `docs/specs/0007-intent-clarify-thinking-ui/verify.md` status and table rows; leave Feature 13 scope Done only when verify is Done and tests are green (Checker / later workflow owns final Linear Done), satisfies **AC-6**, **AC-7**.

## Consequences

**Positive**:
- Feature 13 can honestly close with Thinking proven or an explicit delay.
- Flag remains the rollback switch.
- Test gaps that would make enablement scary get closed first.

**Negative / tradeoffs**:
- Live enable needs a human with Fly and Thesean access.
- Enabling raises Thesean token cost on chat turns.

**Neutral**:
- Intent clarify and sync JSON recovery routes stay as they are.
- Spec 0007 remains the feature design of record; this file is the close out build contract for SOC-8.

## Follow-up

- [ ] Operator: confirm Thesean extended thinking on the Sonnet route, smoke product URL, set or keep Fly flag, paste outcome on SOC-8.
- [ ] After Done verify: `/sync` so AGENTS.md and scope Progress snapshot match the closed Thinking note.
- [ ] Checker run owns `/check verify` and Linear Done; build agent stops at In Review.

## References

**Project sources**:
- `docs/specs/0007-intent-clarify-thinking-ui/index.md`
- `docs/specs/0007-intent-clarify-thinking-ui/verify.md`
- `docs/scope/scope.md` Feature 13
- `sochestral-master-plan.md` §2 and §3 close out order
- Linear SOC-8

**Practices**:
- Feature flag default false until smoke (0007 rationale)
- Tracer Bullet: prove one real path before widening
)
