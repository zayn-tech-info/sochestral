# V2 implementation progress

Started 10 September 2026. Status: in progress. This is a completion record, not a release claim.

**Execution order from 20 September 2026:** follow [`Sochestral-V2-Launch-Plan.md`](./Sochestral-V2-Launch-Plan.md) one step at a time. Current step in that file is L3 (chat to plan viewer). This progress log remains the dated evidence record.

## Authority and baseline

The current request authorizes implementation and local verification. Use the repository copies of the reference and guide (v1.3), including scheduling only and one brand per user. Proposals and deferred commercial policies remain distinct from requirements. Phase 8 is conditional expansion.

Product base: `a0d26e5`, fast forwarded from `a8c9981` before edits. The six intervening commits only add environment scripts and instructions. Delivery base: `8a6317a`. Both branches: `codex/sochestral-v2`. Existing untracked `docs/v2/` references preserved. No production migration, live publication, payment, push, or deployment performed.

## Phase 0

Implemented:

- Planner provider failure, missing tool call and malformed arguments now raise sanitized `MODEL_UNAVAILABLE` with a diagnostic reason. They no longer silently return ordinary chat. Valid delegated output is covered with a fake provider; real language quality is not established by this test.
- Removed obsolete localhost debug collectors from clerk and orchestration service. Error details retain stage and reason without raw provider errors or prompts.
- Actual legacy campaign tick characterization tests reproduce malformed receipt success, failed sibling abandonment, uncertain timeout retry, no available slot failure, and the stored 30 delivery cap. These tests document defects and must become V2 invariant assertions when this path is retired.
- Product test database was empty. Applied existing migrations only to explicitly selected local `sochestral_test` at 127.0.0.1:5433. Orchestration integration files now run serially because they reset the same test database.
- Delivery worker fixture now applies migration 0005. Before correction, four tests failed on a missing publish log column. All existing worker tests pass after fixture correction.
- Delivery characterizations reproduce key replay orphan rows, cancellation overwriting published status, missing edit validation, and duplicate publication from overlapping ticks.
- Calendar test mock now returns the requested reschedule instant. Previously it returned the wall clock date created before a fake August clock, moving the card outside the displayed week. Targeted 13 tests pass. Browser verification remains outstanding.
- Added a provider free baseline CI workflow and made product deployment depend on it. This is a targeted gate, not the final comprehensive release gate.

Current verification evidence:

- Clerk and actual campaign loop: 17 passing tests.
- Calendar: 13 passing tests.
- Delivery worker including overlap characterization: 11 passing tests. The overlap assertion intentionally records a defect, not reliability.
- Delivery MCP: 61 passing, 1 existing failure, canceled content edit contract disagrees with implementation.
- Product orchestration after local migration and serial execution: 346 passing, 21 failing. Failures include expired hardcoded August schedule fixtures, legacy prompt/tool call expectations, short onboarding description validation, and compose provider configuration. These remain to resolve or replace as the corresponding V2 paths land.
- First concurrent full web run: 167 passing, 6 failing. Five are timeouts under contention; calendar is the confirmed fixture issue above. Serial full run pending.

## Remaining work

The ordered steps are L1–L18 in [`Sochestral-V2-Launch-Plan.md`](./Sochestral-V2-Launch-Plan.md). L1 and L2 are done. Do not start L5 while L3–L4 are open. Summary of what those steps cover:

Phase 0: finish cross repository contract and fault harness coverage, isolated full test baselines, browser calendar check and delivery CI gate.

Phase 1: remaining generation paths on shared context and usage accounting (timezone confirm already landed).

Phase 2 and A11: durable content revisions, confirmed schedule operations, receipts, media lifetime, legacy campaign transition.

Phase 3 and A12/A14: finish and test interview/delegation; content approval and schedule confirmation; remaining responsive UI; retire immediate publishing and full access.

Phase 4: correction memory and source inbox.

Phase 5: explicit provider routing, evaluation and budget enforcement.

Phase 6: fixed precision shared ledger, configurable Paddle sandbox catalog and verified fulfillment. Deferred policies remain disabled/unset.

Phase 7: controlled transition, browser widths and theme acceptance, authorized provider/media/reconnect pilot, complete release checks.

## Configuration so far

No new production environment variables. Local integration tests require distinct `DATABASE_URL` and `TEST_DATABASE_URL`, with the latter pointing to a migrated database containing `test` in its name. Never use the production URL for test migrations. Node 22 is available through the delivery repository wrapper. Product PostgreSQL runs in the existing `sochestral-postgres` Docker container on host port 5433.

## Delivery foundation update

A11 implementation has progressed beyond initial characterization. Migrations 0006 and 0007 add tenant scoped request receipts and durable worker claims. Replays, conflicts, exact lookup, transactional destination inserts, pagination, mutation guards, media validation and adapter checkpoints are implemented. Container polling can resume; uncertain publication cannot automatically repeat. See Execution-Contract.md for precise behavior and remaining limits.

Verified locally: SocialMCP full workspace build passes; adapters 114 tests pass; worker 15 tests pass including two connections to one SQLite file; MCP 66 tests passed before two additional in flight mutation cases (rerun pending). Product calendar 38 tests pass, including pagination and unknown status. Product orchestration typecheck passes. Calendar browser drag with API fixtures passes. The browser found a real layout defect: 72 pixel cards hid captions; minimum/default card heights and small text have been corrected. Screenshot: web/test-results/calendar-desktop.png (local, ignored).

Playwright is now a web development dependency, with `npm run test:browser`. Browser fixtures use a separate local API origin and do not contact social providers. Both deployment workflows have foundation test dependencies. Broader V2 workflow, responsive redesign, full test cleanup, provider verification and phases 1 through 7 remain in progress.

## Confirmed timezone checkpoint

Added nullable profile timezone and confirmation timestamp, validated profile PATCH, and an explicit Confirm timezone action in Personal information. Browser detection is a suggestion and sends no mutation. Existing profiles remain unconfirmed. Invalid zones and changes without confirmation are rejected. The profile survives unrelated edits and is tenant scoped.

Migration 0019_confirmed_timezone adds only these two columns. Applied to local sochestral_test only. Drizzle generated unrelated existing tables because migrations 0016 through 0018 had no corresponding snapshot; those duplicate SQL statements were removed after comparison with the existing migrations. The new snapshot captures the current schema for subsequent generation.

Added resolveScheduleTime and used it in legacy campaign slot selection. It preserves regional offsets and date boundaries, rejects DST gaps, and requires an earlier/later selection for overlaps. This does not complete V2 schedule confirmation: binding approved revisions, accounts, timezone and UTC instants remains pending.

Verification on this checkpoint:

- Full web suite: 174 passing across 32 files.
- Profile database: 16 passing; profile API: 9 passing.
- Time conversion and campaign tests: 14 passing, including the 5 legacy defect characterizations.
- Browser calendar drag: passing, caption screenshot inspected. The fixture now uses UTC consistently and drops inside the visible scroll area; it checks the saved destination date.
- Database, auth, orchestration and API typechecks passed. The API had an existing typed-array response incompatibility; media download now copies the selected bytes into an ArrayBuffer accepted by the response API.
- Media storage and actual download response: 11 passing, including exact response byte comparison.
- Delivery MCP final rerun confirmed 68 passing.
- Removed remaining obsolete debug collectors from the OpenAI-compatible model provider.

CI now provisions an isolated PostgreSQL service and includes profile integration and timezone conversion tests. No new environment variables are required. The profile timezone is user data, not an environment setting. The complete V2 goal remains unfinished: shared context/provenance and usage accounting are next, followed by durable content, plan review, schedule confirmation, memory/sources, routing, billing and pilot verification. Nothing deployed.

## Shared context and provider accounting checkpoint

Migrations 0020_generation_context and 0021_usage_attempts are implemented and applied only to local sochestral_test.

One assembler now serves chat, plan clerk, and legacy background drafting/revisions. It verifies conversation ownership, selects active brand preferences, current voice/design material, campaign facts and six recent drafts, and persists a bounded immutable snapshot with source versions. Run/job uses point to the snapshot. Identical inputs reuse it; changed facts create a new version. Concurrent assemblers retry serialization conflicts. Proposed facts and stale voice material are excluded. Tests cover reuse, changes, ownership, selection bounds and concurrent callers (5 passing). The chat integration test checks the actual provider system input against its stored snapshot; the worker characterization checks the same preference reaches the writer.

Provider attempt accounting now records before network I/O in both Thesean provider clients. Scope is propagated through chat/plan clerk, legacy campaign writer/grader/revision and voice/design compilation workers. Each attempt records user, parent, role, provider, exact model, outcome, duration and supplied token categories. Missing usage is null. Fixed precision internal cost and customer charge status remain separate and unresolved/unassessed until rate cards and commercial policy are applied. Failed requests and retries remain visible. A failure to finalize accounting cannot cause the provider wrapper to repeat a successful network request. Provider accounting integration tests passed (3 cases covering retries, missing usage, pre-request persistence and concurrent users).

This is not complete operation accounting yet: raw compose/rewrite, setup, research, image generation and tool paths still need uniform instrumentation and context use. Rate cards, reconciliation, user usage display and billing are not implemented. Snapshot links to new versioned plan/content artifacts are part of the pending durable workflow.

The broader orchestration suite recorded 355 passes and 23 failures before follow-up fixes. Two were the replaced profile-prompt assertion and a LinkedIn multi-image test fixture; one exposed compose's incorrect coupling to the one-call autonomous schedule cap. Compose now supports a bounded 12-destination request independently of campaign size. The 80 targeted provider/planner/worker/calendar/compose tests subsequently passed. Remaining legacy service, onboarding and expired-date fixtures still require replacement or correction alongside the V2 workflow. This is not a green full release gate.

CI includes shared-context and usage integration tests using isolated PostgreSQL. No new environment variables, no production migration and no deployment in this checkpoint.

## Versioned plan and review checkpoint

Migration 0022_versioned_plans adds owned plans, immutable structured versions, anchored comments, submitted revision batches and separate workflow approvals. Applied only to local sochestral_test. The document validator requires all six sections, globally unique stable section/block/item identities and structured calendar/source data. It rejects malformed documents and preserves 100 proposed items without truncation. Revisions retain unchanged identities, reject stale overwrites, record parent/context/changed anchors/handled comments, invalidate direction approval and keep feedback arriving after batch submission pending. Deleted or ambiguous anchors remain visible as needs reattachment.

Authenticated /plans routes provide creation, current or exact-version reads, comments, batch submission, validated revisions and explicit version-bound direction approval. Browser mutations require the allowed Origin and plan-action header. Reads use a repeatable-read snapshot so a concurrent revision cannot mix a document from one version with approval state from another. History stays tenant scoped; missing versions return 404 and malformed version selectors return 422.

The web sidebar now exposes Plans. The viewer renders structured paragraphs, callouts, source references and a desktop calendar table/mobile cards. Users can select text or a block, save comments immediately, submit the pending batch, approve direction and navigate earlier immutable versions. Earlier versions hide comment controls and disable approval; returning to the latest document requires no regeneration. A comment selected before refresh retains its original version and text, so stale feedback cannot silently move to a new document. Historical revisions show the recorded feedback they handled.

Verification: database plan workflow 7 tests pass; plan API 5 pass; viewer component 4 pass. The browser fixture exercises selection, comment persistence, explicit approval and read-only history at 360, 390, 768, 1024 and 1440 pixels. Browser/typecheck final results are recorded below after completion. These tests do not exercise a live model or social provider.

Important remaining workflow work: no revision worker consumes submitted batches yet; chat/interview does not create these new plans yet. Comment reattachment, durable content revisions and destination variants, content approval and exact schedule-operation confirmation remain to implement. Existing legacy campaign and immediate/full-access paths are not yet retired. The complete V2 release is still unfinished, and existing broader suite failures remain tracked above. No new environment variables, production migration or deployment in this checkpoint.

Final checkpoint verification: all five browser widths passed, including navigating history and returning to the latest version without additional comments or approvals. All four backend packages and standalone web typechecks passed. git diff --check passed. Local logs: /tmp/v2-plan-history-{api,db,web,browser,types,web-types}.log. Browser screenshots remain local ignored artifacts in web/test-results/.

## Durable comment revision worker checkpoint

Migration 0023_keen_gauntlet adds claim token, lease expiry, completion timestamp and sanitized error code to revision batches. The generated SQL contains only these four additions and was applied only to local sochestral_test.

The API process now starts a plan worker. It claims submitted batches under the same parent-plan lock as manual edits, excludes plans with active revisions, and allows other plans to progress. Model input includes the immutable current document, only the selected feedback, and the persisted shared brand context. The provider request runs inside usage accounting. A forced structured result is validated before one transaction creates the new version, handles the selected comments and completes the batch. Concurrent manual changes invalidate the running batch; late output cannot overwrite them. No model response grants content approval or scheduling authority.

Expired or failed attempts become needs_attention, and their feedback remains pending. They are not automatically claimed again. A user may review and explicitly submit feedback again. Successful requests that lose their worker are not blindly repeated. Missing model configuration leaves submitted work queued. Raw provider errors and claim tokens are not returned by plan reads.

The viewer displays persisted queued/running/needs-attention states and polls reads while work is active. Returning after a page refresh resumes observation rather than generation. Text entered against an earlier version still keeps its original version binding.

Verification: five Postgres-backed worker tests pass (saved context and late feedback, overlap, concurrent manual edit, malformed output without retry, expired lease and rejected late result). Five plan API tests and five viewer tests pass, including observing a completed revision without another mutation. All backend typechecks passed; web typecheck result follows below. CI now includes the worker suite. Provider calls were mocked; no paid model or social-provider calls were made.

Configuration: no new environment variables. This worker currently uses existing THESEAN_API_KEY, THESEAN_MODEL, THESEAN_TIMEOUT_MS and ORCHESTRATION_OUTPUT_TOKEN_LIMIT through loadOrchestrationConfig, which also requires the existing SOCIALMCP_MCP_URL. General role-routing configuration remains part of the pending phase 5 work. No production migration or deployment.

Remaining: interview-to-plan creation, comment reattachment, full content and schedule-operation workflow, accounting completion, sources/memory, routing/billing and full release verification. Durable submitted-batch membership/history should also be strengthened before adding editable/reattachable comment anchors; current comments are immutable and linked to their current batch. Broader legacy failures and product immediate/full-access retirement remain unresolved.

Final worker checkpoint: standalone web typecheck and git diff --check also passed. Logs: /tmp/v2-revision-tests.log, /tmp/v2-revision-api.log, /tmp/v2-revision-web-final.log, /tmp/v2-revision-types.log and /tmp/v2-revision-web-types.log. No live background process was launched against production.

## Comment reattachment and batch history checkpoint

Migration 0024_nappy_firedrake adds a unique self-reference for reattached comments and immutable comment-ID membership on revision batches. It backfills membership from existing batch links; it cannot reconstruct any links already overwritten before this migration. Only local sochestral_test was migrated.

Reattachment validates the owner, current version and exact new anchor, then appends a linked comment with the original body. The original version, quote, context and range remain unchanged; its status becomes reattached. Concurrent duplicate requests return the same new comment. A conflicting second location is rejected. Current pending/submitted comments cannot be arbitrarily moved. Batch membership remains recorded when feedback is explicitly submitted again after failure, and workers read that recorded membership.

The viewer offers Reattach comment for detached feedback, requires selecting a new location, and saves only after an explicit action. Original feedback is read-only during this action. Cancel preserves any separate unsaved comment text. Both old and new comments remain visible with their version labels and lineage.

Verification so far: nine database plan tests, six API plan tests and six viewer tests pass. Backend typechecks pass. Browser and revision-worker regression results follow below. No new environment variables or production deployment.

The next major integration is L2 interview product gates (delegation, research provenance, original request constraints) and then the durable content tracer. The viewer/worker still does not replace every old chat path. Durable content generation, approval and confirmed scheduling, memory/sources, full accounting/routing/billing and final release verification also remain unfinished.

Final reattachment verification: all five browser widths pass, including explicit location selection and preservation of the original anchor; all five revision-worker regression tests pass. Standalone web typecheck and git diff --check pass. Logs: /tmp/v2-reattach-{db,api,web,worker,browser,types,web-types}.log. Nothing deployed and no provider calls made.

## Interview typecheck and isolated tests (L1)

20 September 2026 on `cursor/v2-next-9bc5`. Local `sochestral_test` only. No production migration.

Added database and orchestration interview tests. Chat planning turns now pass resolved platforms so a run can be created. After a versioned plan exists, acceptance, schedule, or live wording returns the review link instead of SocialMCP or the legacy campaign worker. Vitest `maxWorkers` is 1 for database, orchestration, and API so suites that `delete from users` do not overlap.

Verification:

- `pnpm -r typecheck` passed (database, auth, orchestration, API).
- `npx tsc --noEmit` in `web/` passed after installing missing `@playwright/test` locally (not committed).
- Database V2 files: 34 passing (`profile`, `generation-context`, `plans`, `plan-interview`).
- Orchestration V2 files: 12 passing (`usage`, `plan-revision`, `plan-interview`).
- Plan API: 6 passing. Plan viewer: 6 passing.

Fake provider only. No live Thesean, DeepSeek, or SocialMCP calls. CI `verify-v2` includes the new test files. Next: L2 interview product gates.

## L2 — Interview product gates (20 September 2026)

20 September 2026 on `cursor/v2-next-9bc5`. Local `sochestral_test` only. No production migration.

Interview JSON `request` holds stated horizon, item count, platforms, cadence, attachments, and the original message. Unspecified size stays null (no 14-day fallback). After `research_unavailable`, generation waits for `useExistingContext`. Writer sources must match supplied research 1:1. Usage persistence failures stay visible. Classifier and writer attempts go through `measureModelAttempt`; omitted tokens stay null. After a plan exists, “go ahead” returns the review link.

Verification (pinned `TEST_DATABASE_URL=postgresql://sochestral:sochestral@127.0.0.1:5433/sochestral_test`, `NODE_ENV=test`, `CORS_ORIGIN` unset):

- Database V2 files: 34 passing (`profile`, `generation-context`, `plans`, `plan-interview`).
- Orchestration interview + autonomy + publishing: 125 passing.
- Orchestration CI files: 17 passing (`usage`, `plan-revision`, `plan-interview`).
- API profile + plan routes: 15 passing.
- `pnpm --filter @sochestral/database typecheck` and `pnpm --filter @sochestral/orchestration typecheck` passed.

Fake provider only. No live Thesean, DeepSeek, or SocialMCP. Next: L3 chat to plan viewer.
