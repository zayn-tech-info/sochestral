# Sochestral V2 implementation handoff — foundations, plan review, and interrupted interview integration

**Prepared:** 11 September 2026.  
**Status:** Implementation paused at the user's request to produce this handoff. The original goal is not complete.  
**Audience:** The next AI/engineer continuing in the existing worktrees.  
**Important:** This is a handoff, not a release certification. No production deployment, push, payment, or live social publication was performed in this work.

## Contents

- [1. Read this first](#1-read-this-first)
- [2. Authority, scope, and documents](#2-authority-scope-and-documents)
- [3. Environment and operational facts](#3-environment-and-operational-facts)
- [4. Delivery-service implementation](#4-implemented-delivery-service-work-socialmcp)
- [5. Product foundations](#5-implemented-product-foundations)
- [6. Tested plan/review workflow](#6-implemented-versioned-planreview-workflow-tested-checkpoint)
- [7. Interrupted interview work — start here](#7-interrupted-chatinterview-integration--written-not-tested)
- [8. Migrations](#8-migrations-and-schema-inventory)
- [9. Test evidence and known failures](#9-test-evidence-and-what-it-does-not-establish)
- [10. Environment variables/setup](#10-environment-variables-and-remaining-setup)
- [11. Completion caveats](#11-what-is-not-done-despite-existing-namesui)
- [12. Full remaining-work map](#12-full-remaining-work-map)
- [13. Suggested continuation sequence](#13-suggested-continuation-sequence)
- [14. Other context and boundaries](#14-other-conversation-context-and-boundaries)
- [15. Evidence appendices](#15-evidence-appendices)

Appendices include both complete worktree inventories with hashes, available test-log summaries, browser/CI configuration, and the full product reference, implementation guide, assessment, execution contract and progress log.

## 1. Read this first

The user asked for implementation of the supplied Sochestral product reference and implementation guide on the existing codebase, with trustworthy behavior, testing, and a final environment/setup summary. The work spans **two repositories**, not one:

| Responsibility | Repository | Branch | Current base commit |
| --- | --- | --- | --- |
| Hosted Sochestral product: web, API, brand context, orchestration, review, future credits | `/home/zayntechinfo/work/projects/sochestral` | `codex/sochestral-v2` | `a0d26e5` |
| SocialMCP execution: connected accounts/tokens, scheduling receipts, due-time publication | `/home/zayntechinfo/work/projects/all-social-mcp` | `codex/sochestral-v2` | `8a6317a` |

The product checkout was fast-forwarded from `a8c9981` to `a0d26e5` before implementation; the intervening commits concerned environment setup/instructions. All V2 implementation changes described here remain **uncommitted** in these worktrees. Preserve existing changes; do not reset or replace either checkout. Existing untracked `docs/v2/` reference documents were present and preserved. The inventories below distinguish tracked modifications from untracked files; untracked does not mean disposable.

### Immediate resume point

1. Read this handoff, especially §7 (interrupted work) and §12 (remaining requirements).
2. Inspect the current diff and files; this document is a dated snapshot, not a substitute for current-state evidence.
3. Finish and test the **new chat/interview integration**, which was edited immediately before the user paused implementation. No interview integration tests were written yet.
4. The last attempted backend typecheck reported a TypeScript narrowing error in `packages/orchestration/src/service.ts`. That comparison was then removed, but the typecheck was **not rerun**. Further source/schema changes also followed that run. Do not assume the current checkout typechecks.
5. Product migration `0025_chubby_psynapse.sql` was generated, inspected, and applied to the explicitly selected **local test database**. Its log says `Migrations applied`; it also contains a harmless PostgreSQL identifier-truncation notice. No production migration was applied.
6. The prior, tested checkpoint is the plan comments/history/reattachment + revision-worker work through migration 0024: 9 database plan tests, 6 plan API tests, 5 revision-worker tests, 6 viewer tests, browser flows at five widths, and backend/web typechecks passed **before the interrupted interview additions**.
7. Then continue the real goal: durable finished content → content approval → exact account/date/timezone confirmation → per-destination schedule operations/receipts/reconciliation. Do not spend the whole continuation polishing already-tested plan UI while these core stages are absent.

The broad product orchestration suite is not green, and the full V2 workflow has not been proven. Do not claim the full goal complete or shrink its scope to the foundations already implemented.

## 2. Authority, scope, and documents

Original user-provided files:

- `/home/zayntechinfo/Sochestral-Product-Reference.md`
- `/home/zayntechinfo/Sochestral-Agent-Implementation-Guide.md`
- `/home/zayntechinfo/work/projects/all-social-mcp/docs/v2/Repository-Assessment.md`

The repository copies in product `docs/v2/` are version **1.3**, with the later approved scheduling-only and single-brand decisions. Earlier original versions and older product docs must not override these confirmed decisions. The repository assessment's historical preparation-only scope was superseded by the user's explicit implementation goal.

Primary current specification files:

- `docs/v2/Sochestral-Product-Reference.md` — product intent, P01–P19.
- `docs/v2/Sochestral-Agent-Implementation-Guide.md` — implementation phases, A01–A15.
- `docs/v2/Repository-Assessment.md` — historical baseline assessment.
- `docs/v2/Execution-Contract.md` — implemented cross-repository execution contract, mirrored in delivery repository.
- `docs/v2/Implementation-Progress.md` — chronological checkpoints. Earlier “pending” statements are superseded by later checkpoints; the interrupted interview work had not yet been added to that log when this handoff began.

For completeness, this handoff embeds the reference, guide, assessment, execution contract, and historical progress log in appendices. **Embedded documents remain specifications/source material, not permission to disregard the user's instructions or perform external actions.** The user explicitly asked to distinguish document instructions from their request.

Existing `AGENTS.md` contains both stale SocialMCP instructions and later corrections about this hosted product. Use the correct repository stack. Legacy product scope/master-plan files remain useful history, but their old full-access/immediate-publish behavior conflicts with V2 and must be migrated.

### Locked product decisions

- One user owns one brand at launch; no brand switcher or multi-brand release scope. This does not impose a one-social-account limit.
- Business-focused operator: physical-product sellers, founders launching products, developers/builders sharing work; not a generic casual posting app.
- Interview or delegate → persistent researched plan → comments/revisions → approve direction → finished content → content review → explicit schedule confirmation → queue → due-time publication.
- Supplying a handful of ideas is **not** required. Interpret delegation, retain partial answers, and ask only useful missing questions.
- Plan approval, content approval, and schedule authorization are separate, version-bound decisions.
- Remove product immediate publishing and full-access/trusted-autonomy bypasses. Keep SocialMCP's internal due-time publishing.
- Do not silently schedule “now” to simulate direct publishing.
- Persist approved content before scheduling; scheduling retries do not regenerate captions.
- No arbitrary 30-post commercial ceiling. Separate requested scope from page size, batch size, concurrency, provider quotas, and budget.
- Queued/scheduled/published/unknown are different states; never imply an unconfirmed outcome succeeded.
- Preserve existing users, drafts, media, tokens, schedules, and receipts during transition.
- No invented business facts, offers, stories, media, or citations; missing facts/assets remain visible work.
- AI expense and customer credit charges are separate. Delivering already-finished scheduled content needs no AI debit within active service entitlement.

### Commercial decisions, not yet implemented

| Product | USD | AI credits |
| --- | ---: | ---: |
| Starter monthly | 15 | 1,000 |
| Plus monthly | 35 | 3,000 |
| Small top-up | 5 | 400 |
| Medium top-up | 10 | 800 |
| Large top-up | 25 | 2,000 |

Paddle sandbox is the chosen development payment path. Provisional internal conversion: one credit corresponds to **$0.003 eligible provider expense**, configurable and fixed precision, not measured cost-per-post or a margin guarantee. Preserve fractional usage; do not round every cheap attempt to one whole credit.

**Deferred, not approved defaults:** proposed 7-day/150-credit trial, three-account allowance, credit expiry/rollover, active-subscription condition for purchased credits, auto-top-up, cancellation/grace, upgrades/downgrades, refunds, and subscription-lapse treatment of future schedules. Keep policy seams and disable unavailable actions rather than invent terms. These decisions do not block independent metering, queue, design, or sandbox development. Standard/Advanced model choices need evaluation and honest cost limits. Phase 8 expansion is conditional, not a launch checklist to implement indiscriminately.

## 3. Environment and operational facts

### Production topology (context, not live re-verification)

- Product web: `https://app.sochestral.shop`, Fly app `sochestral`.
- Product API: `https://api.sochestral.shop`, Fly app `sochestral-api`, Hono.
- Production database: Neon PostgreSQL, via API Fly `DATABASE_URL` secret.
- SocialMCP and Thesean are external cloud dependencies, not product packages.
- R2 private media is an existing product capability. Tokens for social accounts remain encrypted in the delivery database.
- Existing cloud instructions say publishing authority was enabled historically. That is **legacy state**, not permission to retain bypasses in V2 or proof current cloud behavior matches these uncommitted changes.

### Local tooling

- Host Node is newer than supported; use Node 22 wrapper from the delivery repository.
- Product root: pnpm 9.15 workspace with `packages/*`.
- Product `web/`: standalone npm project with its own lockfile, not a pnpm workspace member.
- Delivery: pnpm 11.7, Node >=22 <23. Packages expose built `dist`; build before dependent tests when source exports change.
- Product local PostgreSQL: Docker container `sochestral-postgres`, host port 5433, databases `sochestral` and `sochestral_test`.
- Local API default 8787; normal local web default 3000.
- Browser fixtures start Next on 127.0.0.1:3100 with API origin 127.0.0.1:8789 intercepted by Playwright routes.
- At handoff inspection, `sochestral-postgres` was running. Other containers (n8n, unrelated Postgres, qdrant, ollama) were present; they are not part of these changes.
- Process inspection found no active Vitest, Playwright, TypeScript, Drizzle generation, or migration process beyond the inspection command itself. Previously returned tool session IDs are historical; do not treat them as live jobs without revalidation.

### Critical local-test cautions

Injected shell variables may point `DATABASE_URL` at production Neon and set `NODE_ENV=production`, production CORS, or port 8080. `.env` loading does not override them. Never run an unqualified migration. Explicitly pin the local URL. Do not print secrets while diagnosing configuration.

DB integration suites delete users globally. Run DB packages/suites serially; parallel suites against the same DB invalidate each other's fixtures. Orchestration Vitest is configured with file parallelism disabled. Use `exec vitest run` when selecting a test because some earlier pnpm script argument forms did not forward `-t` as intended.

The local Postgres container has stopped between prior continuations. If a DB test appears stalled, inspect its existing process/session and DB state. Do not start a duplicate test merely because a polling timeout elapsed.

### Commands for the next AI

From product root `/home/zayntechinfo/work/projects/sochestral`:

```bash
# Install product packages (when needed).
bash ../all-social-mcp/scripts/with-node22.sh pnpm install --frozen-lockfile --prod=false

# Explicitly local test migration only.
DATABASE_URL=postgresql://sochestral:sochestral@127.0.0.1:5433/sochestral_test \
  bash ../all-social-mcp/scripts/with-node22.sh pnpm run db:migrate

# Backend typechecks; first resume verification for interrupted work.
bash ../all-social-mcp/scripts/with-node22.sh pnpm -r typecheck

# Example isolated DB suite. Run other DB suites only after this completes.
env -u CORS_ORIGIN NODE_ENV=test \
  DATABASE_URL=postgresql://sochestral:sochestral@127.0.0.1:5433/sochestral \
  TEST_DATABASE_URL=postgresql://sochestral:sochestral@127.0.0.1:5433/sochestral_test \
  bash ../all-social-mcp/scripts/with-node22.sh pnpm --filter @sochestral/database exec vitest run src/plans.test.ts
```

Use the same explicit environment for API and orchestration integration suites. Relevant commands:

```bash
# Replace package/file after applying the explicit env above.
pnpm --filter @sochestral/api exec vitest run src/plan-routes.test.ts
pnpm --filter @sochestral/orchestration exec vitest run src/plan-revision.test.ts
pnpm --filter @sochestral/orchestration exec vitest run src/usage.test.ts
pnpm --filter @sochestral/database exec vitest run src/generation-context.test.ts
```

From product `web/`:

```bash
bash ../../all-social-mcp/scripts/with-node22.sh npm ci --include=dev
bash ../../all-social-mcp/scripts/with-node22.sh npx tsc --noEmit
bash ../../all-social-mcp/scripts/with-node22.sh npm test -- --run src/components/app/plan-viewer.test.tsx
bash ../../all-social-mcp/scripts/with-node22.sh npm run test:browser -- e2e/plans.spec.ts
bash ../../all-social-mcp/scripts/with-node22.sh npm run test:browser -- e2e/calendar.spec.ts
```

Use `npx playwright install --with-deps chromium` if the browser is missing. Chromium was installed and used in this session. Root relative wrapper path is `../all-social-mcp/...`; web's is `../../all-social-mcp/...`. Mixing them caused harmless exit-127 command failures earlier.

From delivery root:

```bash
pnpm run build
bash ./scripts/with-node22.sh pnpm --filter @socialmcp/worker test
bash ./scripts/with-node22.sh pnpm --filter @socialmcp/adapters test
bash ./scripts/with-node22.sh pnpm --filter @socialmcp/mcp-server test
```

Do not run the delivery smoke-publish scripts against real accounts without the separately authorized controlled test required by the guide.

## 4. Implemented delivery-service work (SocialMCP)

Primary files: `apps/mcp-server/src/tools/{service,schemas,register}.ts`, `apps/worker/src/{process-due,index}.ts`, adapters' platform interface and Threads/Instagram/LinkedIn adapters, database schema and migrations 0006/0007.

### Request receipts and replay

- Added `scheduleRequests` persisted receipts with tenant/key/canonical fingerprint.
- Schedule creation writes parent post, variants, destination schedules and request receipt in one SQLite immediate transaction. Failure rolls everything back.
- Same user/key/payload returns the original receipt; changed payload returns `IDEMPOTENCY_CONFLICT`.
- Canonicalization ignores object field ordering and platform ordering but retains content, media, account destination and instant differences.
- Replay is looked up before future-date/account checks so an already-created request can be recovered after its date passes.
- Exact `get_schedule_request` lookup is tenant-scoped.
- Legacy hashes/rows are retained. Ambiguous matching legacy requests return `LEGACY_SCHEDULE_REQUIRES_REVIEW` rather than creating another schedule.
- Receipt includes every destination's schedule ID, variant ID, platform, connected-account ID, publish instant and status.
- Receipt is proof of initial creation, not a live status feed; query current delivery status separately.

### Pagination and mutation guards

- Scheduled-post listing filters by tenant/date/status/platform in SQL and returns ID cursor pagination; default 100, maximum 500 per page.
- Cancel/reschedule/content-edit writes are conditional on state and observed update timestamp.
- Cancellation cannot overwrite publishing, published or uncertain outcomes.
- Content editing requires a scheduled row and reruns adapter/platform/media validation. Canceled-content editing is rejected.
- Rescheduling permits supported scheduled/canceled states with explicit future instant/confirmation.
- Worker claims and edits share the locking/transaction design so an edit cannot overwrite a claimed delivery.

### Due-time worker

- Bounded fetch: 25 due rows/tick; random claim token; five-minute lease; persisted attempt count.
- Conditional claim protects against overlapping ticks and multiple DB connections. Local interval overlap is also prevented.
- An attempt log is saved before provider I/O.
- Adapter callbacks persist parent container IDs, a pre-publication checkpoint and the returned remote receipt.
- Expired preparation can be safely reclaimed; known parent containers resume polling; confirmed saved publication receipt settles as published.
- Ambiguous remote publication remains `outcome_unknown`, not an automatic repeat publish.
- `originalPublishAt` retains original schedule while retry timing uses `publishAt`.
- Container polling retries use bounded 5/30-minute retry timing, maximum 3 attempts; authentication failures require reconnect.
- Threads/Instagram resume parent media containers; LinkedIn has before/after publication checkpoints.
- Due-time publication does not invoke a model or debit AI credits.

### Delivery limitations requiring follow-up

- No exactly-once guarantee from remote platforms is claimed.
- Crash after remote acceptance but before durable receipt may require manual investigation.
- Partial child-container creation is not fully checkpointed/reconciled.
- Ambiguous LinkedIn outcomes and unreconcilable provider evidence remain manual review.
- Audit explicit `outcome_unknown` reconciliation when a usable published checkpoint exists; earlier review identified this as unfinished rather than assuming all recovery branches handle it.
- Add/verify actual adapter resume tests, replay-after-past-time/legacy-key tests, strict UTC datetime validation, cancellation races, and the complete fault harness in A11.
- No current live-account/provider verification was performed. Platform capability claims still need current official/provider checks before release.
- Do not restart an older worker against unresolved new claims during rollback.

### Delivery migrations and tests

- `0006_opposite_sandman.sql`: request receipts.
- `0007_flimsy_eternals.sql`: claim token, lease, delivery phase.
- Generator proposed unrelated analytics reconstruction; it was deliberately removed and metadata reconciled to preserve existing analytics state.
- Worker test fixture was corrected to apply pre-existing migration 0005; four failures had come from a missing publish-log column.
- Latest recorded delivery checkpoint: adapters **114**, worker **15**, MCP **68** passing; full workspace build passed.
- Tests use isolated SQLite, including a two-connection on-disk fixture; adapter network responses are mocked. These are not live delivery proofs.

## 5. Implemented product foundations

### Planner failure behavior and debugging cleanup

- Plan clerk now raises sanitized `MODEL_UNAVAILABLE` for provider failure, absent tool result, or malformed output instead of silently classifying it as ordinary chat.
- Retains diagnostic stage/reason without dumping raw provider messages, secrets or prompts.
- Removed localhost debug collectors from clerk, service and OpenAI-compatible provider code.
- Fake-provider delegated-output tests verify parsing/failure handling, not real linguistic quality.

### Legacy campaign characterization (deliberately not a fix)

`packages/orchestration/src/campaign-loop.test.ts` records five real legacy defects:

1. Malformed schedule receipt can be interpreted as success.
2. A failed sibling can be abandoned while campaign progress advances.
3. An ambiguous timeout can lead to a duplicate scheduling attempt.
4. A no-available-slot condition becomes campaign failure.
5. The legacy persisted 30-delivery cap remains.

These tests passing means the defects were reproduced. Replace them with V2 invariants when the legacy path is safely retired; do not cite them as reliability proof.

### Calendar, media capability and UI fixes

- Product calendar follows all delivery pages; validates cursor shape/repetition to avoid incomplete or infinite pagination.
- Displays Publishing / Checking status and treats unknown/in-flight state as nonmutable.
- Canceled content cannot be edited; validation matches delivery behavior.
- LinkedIn Personal image limit corrected from 20 to 1 in both product and web. A shared capability contract is still missing.
- Related test fixture that needed multiple images now uses a supported Threads destination instead of LinkedIn.
- Compose assist destination request bound decoupled from the one-call autonomy scheduling cap: `MAX_COMPOSE_ASSIST_TARGETS` is 12. This is an operational per-request bound, not a 12-item campaign entitlement.
- Calendar reschedule test now returns the requested instant rather than the real wall-clock timestamp outside its frozen week.
- Real browser found card captions hidden by 52/72px sizing; min/default card heights became 136/152px and relevant caption/small text sizing was corrected.
- Calendar browser fixture freezes January 2030, uses UTC and a visible last-day drop at 12:20, asserts persisted date and caption. Earlier offscreen/timezone fixture choices were corrected.
- `schedule-detail-modal.test.tsx` uses `vi.mocked(...)` rather than a stale direct `.mock` access.
- API media download now copies selected bytes into an `ArrayBuffer` accepted by the response API; a byte-exact route assertion was added. This fixed a typed-array incompatibility, not a new media product feature.

### Confirmed timezone

- Migration 0019 adds nullable `businessProfiles.timezone` and `timezoneConfirmedAt`.
- Profile patch validates/canonicalizes IANA zone and requires `confirmTimezone: true` for a change.
- Device/browser timezone is a suggestion only; it does not silently mutate saved user data.
- Personal settings includes explicit confirmation. Existing profiles remain unconfirmed.
- `resolveScheduleTime` converts local wall time + IANA zone to UTC; rejects invalid dates/DST gaps; requires `earlier`/`later` for overlaps; preserves date boundaries and non-hour offsets.
- Legacy campaign slot selection uses this helper instead of a UTC fallback.
- This is not the final schedule-confirmation binding of account + content revision + timezone + UTC instant.
- Migration 0019 initially picked up unrelated tables because older migration snapshots were absent. Duplicate SQL was removed after comparison; the snapshot captures current schema for subsequent generation.

### Shared generation context

Files: `packages/database/src/generation-context.ts` and test; migrations 0020; service/campaign usage.

- Assembles one user-owned brand snapshot, optional owned conversation, active profile entries, current voice bible, ready design brief, legacy conversation plan and six recent drafts.
- Uses repeatable-read transaction with limited serialization retry and stable hash/reuse.
- Stores immutable context plus per-role/per-parent uses.
- Bounds context: 24 selected preferences, 6 recent drafts, clipped fields; source hashes and omitted preference count remain visible.
- Preference priority includes do-not, tone, brand facts, audience, cadence, competitor, skill. Proposed facts and stale compiled voice are excluded.
- Note explicitly treats JSON data as grounding, not tool/scheduling/billing authority.
- Wired into chat, pre-run plan clerk, legacy campaign drafting/revision, new plan revision, and interrupted interview/planning code.
- Existing tests prove reuse, changes, tenant isolation, bounded selection, concurrent assembly, and an actual chat provider prompt containing stored context. Five context tests passed at its checkpoint.
- Still missing uniform use by raw compose/rewrite/setup/image/research and all future content paths. Some grader/voice/design paths have accounting but not this exact shared assembler.
- Snapshot still references legacy campaign plan structure; complete new-plan/content lineage integration remains.

### Provider usage accounting

Files: `packages/orchestration/src/usage.ts`, model/OpenAI wrappers and tests; migration 0021.

- AsyncLocalStorage passes user, parent operation and role.
- Persist `usageAttempts` before provider I/O, then outcome/duration/supplied usage afterward.
- Records exact provider/model, attempt number, nullable input/output/cache-read/cache-write/reasoning tokens, duration and completion time.
- Missing provider usage stays null, not zero.
- Internal USD amount is fixed-precision numeric(20,9), unresolved until rate cards; customer charge remains separately unassessed.
- A bookkeeping failure after provider completion produces `USAGE_PERSISTENCE_FAILED` rather than causing the wrapper to repeat successful network I/O.
- Instrumented Thesean clients, chat/clerk, campaign writer/grader/revision, voice/design compile, plan revision; interrupted interview also wraps plan research/writer.
- Calls without a usage context bypass persistence; audit all remaining callers.
- Anthropic recursive fallback can reset attempt numbering even though each row has a unique ID; correlated retry grouping remains to improve.
- Three integration tests passed using the actual OpenAI-compatible client with mocked fetch: pre-I/O record, retries as separate rows, missing usage unknown, and concurrent user scoping.
- No implemented rate cards, cost calculation/reconciliation UI, customer debit rules, shared credit ledger or billing.
- Raw compose/rewrite, setup, image generation, generic research/tools remain incomplete. New interview research currently discards provider token details even if returned; see interrupted-work issues.

## 6. Implemented versioned plan/review workflow (tested checkpoint)

### Database and schema

- Added Zod 4.4.3 database dependency; lockfile updated.
- Migration 0022 adds `plans`, `planVersions`, `planComments`, `planRevisionBatches`, `workflowApprovals`.
- Six required plan sections: goal, audience_voice, direction, calendar, sources, missing_inputs.
- Application-rendered paragraph/callout/calendar/source structures; no executable HTML/CSS from models.
- Stable globally unique section/block/item/source IDs; section identity preserved across revisions.
- Calendar item fields: angle, audience, format, destinations, proposedTime, assetNeeds; supported destinations Threads/Instagram/LinkedIn Personal.
- Source fields: ID, URL, title, retrieval datetime, summary, linked claim.
- Validators bound each block/item/document; calendar supports 1000 rows/block and total JSON limit 1MB. These are safety bounds, not commercial limits. A 100-item persistence test passes. Large-generation partitioning is still absent.
- `planAnchorText` defines exact text used for selections, quote/context/range checks.
- `createPlan` validates owner/conversation/context and inserts v1 transactionally.
- `getPlan` returns current or requested immutable version, comments, active approvals and batch status under a repeatable-read snapshot; claim tokens are omitted from public batches.
- `listPlans` currently limits to 100 without pagination.
- `addPlanComment` stores immediately against exact current version and valid anchor; body max 4000.
- `submitPlanComments` stores a selected pending set (1–200 unique IDs), current version and durable membership; later comments stay pending.
- `revisePlan` locks owner/plan, rejects stale expected version, validates context/shape/stable IDs, creates next immutable version with parent, changed anchors and handled comment IDs, invalidates active plan-direction approval.
- Removed or no-longer-matching anchors become `needs_reattachment`; they are not silently resolved. Only submitted/valid handled IDs can be addressed. Other batches become stale after a competing revision.
- Approval is idempotent and scoped to `plan_direction` + exact plan/version; it grants no content/schedule authority.

### History and comment reattachment

- Current/exact-version reads are tenant scoped; malformed version selector 422, missing version 404.
- UI navigates previous/next/latest without generation. Earlier documents hide comment controls and disable approval.
- History shows parent version, changed-anchor count and feedback handled by that revision.
- Migration 0024 adds unique `reattachedFromId` self-reference and batch `commentIds` JSON.
- Reattachment appends a new linked comment with original body and explicitly selected current anchor. Original version/quote/context/range remain unchanged; original status becomes `reattached`.
- Duplicate concurrent reattachment returns the same new comment. A conflicting second destination is rejected. Only `needs_reattachment` comments may be moved.
- Batch membership survives resubmission after failure. Migration backfills only existing links; it cannot reconstruct previously overwritten historical links.
- UI makes feedback read-only during reattachment, requires selecting a location and saving, supports cancel, and preserves separate unsaved comment text.

### API surface

All `/plans` routes authenticate the user session. Mutations require allowed Origin, JSON content type, and `X-Sochestral-Request: plan-action`. Responses use private/no-store.

- `GET /plans`
- `POST /plans`
- `GET /plans/:id` and `?version=N`
- `POST /plans/:id/comments`
- `POST /plans/:id/comments/:commentId/reattach`
- `POST /plans/:id/comment-batches`
- `POST /plans/:id/versions`
- `POST /plans/:id/approve` with `{ version, confirm: true }`

Manual validated revisions are allowed. Worker claim token is not accepted from the browser. Error codes are sanitized (plan not found/stale version/invalid document/anchor/comment/batch/context).

### Revision worker

- Migration 0023 adds claim token, lease expiry, completedAt, errorCode to revision batches.
- `claimPlanRevision` locks parent plan, skips locked rows and excludes plans already running a revision; only one model job per plan.
- API boot calls `startPlanWorker`; polls every 3 seconds; uses existing Thesean config.
- Lease is at least 600,000ms or six configured model timeouts.
- `processOnePlanRevision` recovers expired claims, claims selected feedback, assembles/persists context, calls the forced `save_plan_revision` tool with complete prior document and only the submitted comments, validates result, and applies under exact version/token/lease.
- Truncated/missing/multiple/wrong tool responses are rejected. Stale manual edits prevent late model output from overwriting the new version.
- Interrupted/failed work becomes needs_attention; feedback returns pending; no automatic duplicate model request. User may review and explicitly resubmit.
- Viewer polls persisted reads only while revision is queued/running, stops for history/busy action, and retains stale anchor binding across refresh.
- No configured model means queued work remains intact. Worker still recovers expired claims.

### Viewer and browser work

Files: `web/src/lib/plans-api.ts`, `components/app/plan-viewer.tsx`, routes `/app/plans` and `/app/plans/[planId]`, sidebar Plans link.

- Responsive document with headings, paragraph/callout content, source links, desktop calendar table and mobile cards.
- Two-column document/comments at large width, single-column mobile.
- Text-selection or whole-block comment; stale selections preserve original version and text after refresh.
- Saved comment, revision submission, direction approval and historical read-only states.
- Fixed duplicate h1 and nested main found by real browser (AppShell title removed for viewer/list; own heading remains).
- Browser tests cover widths 360/390/768/1024/1440, real text selection and save, exact approval, history return without extra mutations, reattachment and original-anchor preservation, page overflow.
- Screenshots in ignored `web/test-results/plan-{width}.png`; some inspected visually. Tests use light theme and mocked API. These do not prove dark/custom accent, all long-plan scrolling or the full A12 layout.

### Remaining plan-specific gaps

- Complete and validate interrupted chat-to-plan creation below.
- Durable content generation and stage-appropriate Create content action are absent.
- Full chat/document side panel and phone Chat/Plan switch/bottom-sheet comments are absent.
- Section navigation, long-plan filtered/aggregate views, complete accessibility/theme/reduced-motion states remain.
- Source retrieval metadata is stored but viewer does not yet expose all provenance ergonomically.
- Revision worker does not robustly enforce factual/source preservation beyond schema/ID checks; review source mutation policies.
- Revision worker uses existing configured output budget (often 1500), which may be insufficient for complete large documents; no partitioning/budget preflight exists. Do not solve this by truncating items.
- Plan list pagination and scalable comment/history retrieval remain.
- Structured handled IDs do not prove semantically correct handling; ambiguous/conflicting feedback quality needs evaluation.

## 7. Interrupted chat/interview integration — written, NOT tested

This is the exact active work when the user asked to stop and hand over. Treat the following as **implementation intent plus current source**, not verified behavior.

### Files edited/created last

- `packages/database/src/schema.ts`: new `planInterviews` table.
- `packages/database/src/plan-interview.ts`: state validator, get/save helpers.
- `packages/database/src/index.ts`: helper/type exports.
- `packages/database/drizzle/0025_chubby_psynapse.sql`, snapshot and journal.
- `packages/orchestration/src/plan-interview.ts`: new interview/research/plan-generation path.
- `packages/orchestration/src/service.ts`: early planning routing and response integration.
- `packages/orchestration/src/deepseek-search.ts`: provider-citation extraction and optional structured sources.

No `plan-interview.test.ts` was created in either package before the interruption. Existing DeepSeek/service tests have not been updated or rerun for this work. CI does not explicitly include new interview tests because they do not exist yet.

### Intended persisted interview state

`planInterviews` uses conversation primary key, owner, revision, state JSON, optional generated plan/context IDs and updated timestamp. State has:

- status: asking, clarification_needed, delegated, ready, research_unavailable, planned, canceled;
- retained answers: goal, newsAssets, direction;
- up to 3 field-bound questions;
- useExistingContext boolean;
- structured sources array (latest edit added default empty array; no extra SQL migration needed for JSON shape).

`savePlanInterview` validates state, locks owned conversation, checks context ownership and expected revision, optionally creates the versioned plan within the same transaction, then stores planned status/plan ID. Nested transaction/savepoint behavior still needs integration testing.

### Intended orchestration behavior

- `runPlanInterview` uses shared context and usage scope, forced `record_plan_interview` structured decision.
- Null answers preserve prior answers; nonempty new values replace the corresponding field.
- Duplicate questions and asking-mode questions for already-known answer fields are rejected; clarification mode can ask about conflicting known fields.
- Asking/clarification requires questions; ready/delegated/canceled disallows questions.
- Ready normally requires goal and direction; explicitly choosing existing context may proceed without both.
- Saves the validated decision before research/generation so later failure retains structured answers.
- Canceled returns a pause message; asking returns model-written questions.
- Delegated research uses existing DeepSeek search client. Missing/unattributable sources records research_unavailable and offers existing-context drafting; it does not claim research succeeded.
- Sources are intended to persist before the writer, and to be reused when answers have not changed. Changed answers or explicit existing-context selection clear them.
- Writer uses forced `create_plan_document` with title + full schema, max of configured tokens and 8192, shared brand context, answers and sources. Sources must match supplied provenance. No auto approval/schedule.
- Atomically saves plan + interview link and returns a Markdown link to `/app/plans/:id`.
- If a plan ID already exists, returns its review link instead of regenerating.

### Service routing changes

- New local `planningTurn` creates/appends an orchestration run in `always_draft`, calls interview, completes/fails run and returns existing response format.
- Local planning/autonomous-planning intent and active interview state route before legacy clerk/autonomy/campaign logic.
- Clerk intent `plan` routes into interview; clerk acceptance or single-schedule intent associated with an existing new plan returns review guidance rather than booking a legacy campaign.
- Removed one now-unreachable `clerk.intent === "plan"` comparison after TypeScript narrowing reported it.
- **Legacy SYSTEM_MESSAGE, mandatory-ideas code, save_content_plan tool, full-access modes, direct publish and campaign entry paths still exist.** This patch is not their retirement. Audit every alternative entry, including one-post, accepted plan, privileged settings, old conversations, background workers and APIs.

### Research source extraction changes

- `DeepSeekSearchResult` now optionally includes structured sources.
- Parses `url_citation` annotations from response output blocks, validates HTTP(S) URL/title and text range, assigns retrieval timestamp, keeps linked text as summary/claim, deduplicates URL, max 30 sources.
- Bare prose URLs are not treated as verified provenance.
- Existing summary behavior remains; sources omitted if no valid annotations.
- **The actual configured Thesean/DeepSeek-compatible provider annotation format has not been verified live or against official documentation.** Do not assume returned field shapes or text ranges match this parser. Some citations point at citation markers rather than a full supporting claim; validate usefulness/faithfulness.
- Interview research uses `measureModelAttempt`, but provider token usage is not propagated by this client. It remains unknown even if payload supplies it. Complete this without fabricating zero expense.

### First tests to add and run

1. Backend typecheck now, then resolve any errors without assuming old log represents latest source.
2. DB tests for owner/context scoping, concurrent expected-revision update, partial-state retention and atomic plan/interview creation.
3. Actual `DefaultOrchestrationService` integration: initial plan request → missing questions → partial reply retained → plan saved with context/link → no MCP scheduling/publish call.
4. Request-ID replay does not invoke the model again or create another plan.
5. Delegation paraphrases within an active interview; inspect actual model input, and separately evaluate real-model language quality before making a broad claim.
6. Research unavailable → explicit existing-context choice → plan without invented citations; verify code-level gates, not prompt alone.
7. Attributed research → persisted source metadata → writer output preserved; reject fabricated/missing/duplicated source references.
8. Invalid classifier/tool/truncated response returns visible failed run without falling into legacy scheduling and without discarding saved answers.
9. Complete plan then “go ahead” cannot schedule or invoke the old campaign worker.
10. Browser chat link actually opens the saved plan; refresh/retry shows persisted state. Test user attachments/known facts, partial answers and long requested scope.

### Specific unresolved risks visible from source (not yet reproduced)

- Only three answer fields are retained. Original requested campaign horizon/item count/platform/cadence may be lost across partial turns because writer receives latest message rather than full original intent. Persist all load-bearing request constraints and attachment/source identity.
- `useExistingContext` and “research failed, may I continue?” permission currently depend heavily on model classification. Ready with complete answers can skip a prior failed-research choice; code must enforce the intended transition.
- Existing plan ID always returns a link, so starting a second plan in the same conversation is not designed yet.
- Active interview may capture unrelated subsequent chat until canceled. Clarify pause/resume/change-topic behavior without regressing normal chat.
- Local/legacy classifier routing still has holes; do not claim all delegation or schedule intents are covered.
- Source comparison uses length plus membership, not a strict bijection; duplicate emitted sources could substitute for another source of equal total count. Fix and test.
- Source schema/per-field sizes and scheme restrictions differ between interview state and final plan schema. Validate external data before trusting/persisting it.
- DeepSeek search failure is caught as unavailable; ensure a usage-finalization/storage failure is not masked as ordinary no-research when bookkeeping must be reconciled.
- Source metadata is not proof the underlying claim is correct or fresh. Do not fabricate provenance or silently treat generated summary as verified fact.
- Current interview generation is synchronous in the chat request, not a durable leased generation job; restart during model generation needs explicit recovery design.
- Model token limits/complete-document output for 20/50/100 items are not validated; reject/partition before paid work rather than truncate.
- Returned run object is synthesized with completed/failed status from the original running row; refetch terminal run to include authoritative timestamps/usage/error fields.
- Emitted step-start labels may lack matching completed labels on exceptions; verify UI cleanup.
- Potential loss/duplication windows between plan save and run completion need tests; plan/interview link should allow recovery without another generation.
- No new interview evaluation set, current full-suite run, or browser flow exists yet.

## 8. Migrations and schema inventory

| Repository | Migration | Meaning | Applied where in this work |
| --- | --- | --- | --- |
| Product | 0019_confirmed_timezone | Explicit saved timezone + confirmation | Local test DB |
| Product | 0020_generation_context | Immutable context snapshots/uses | Local test DB |
| Product | 0021_usage_attempts | Provider attempts and unresolved expense fields | Local test DB |
| Product | 0022_versioned_plans | Plans, immutable versions, comments, batches, scoped approvals | Local test DB |
| Product | 0023_keen_gauntlet | Revision claims/leases/error/completion | Local test DB |
| Product | 0024_nappy_firedrake | Reattachment links and durable batch membership/backfill | Local test DB |
| Product | 0025_chubby_psynapse | Conversation interview state and generated-plan link | Local test DB; newest code untested |
| Delivery | 0006_opposite_sandman | Tenant schedule-request receipts | Isolated SQLite tests |
| Delivery | 0007_flimsy_eternals | Due-worker claim/lease/phase | Isolated SQLite tests |

Corresponding Drizzle snapshots and `_journal.json` are modified/untracked. Keep SQL, snapshots and journal consistent. Generated random migration names were retained for 0023–0025. No production schema was changed. Do not infer the local development `sochestral` database has all new migrations merely because `sochestral_test` does.

## 9. Test evidence and what it does NOT establish

Numbers below are dated checkpoints, not one cumulative green suite on the current final checkout.

| Area | Latest recorded result | Limit |
| --- | --- | --- |
| Delivery adapters | 114 passed | Mock provider responses |
| Delivery worker | 15 passed | Real isolated SQLite, mocked adapters |
| Delivery MCP | 68 passed | Local contract tests |
| Delivery full build | Passed | Before later product-only work |
| Full web suite at timezone checkpoint | 174 / 32 files passed | Before plan/interview additions |
| Profile DB / API | 16 / 9 passed | Local PostgreSQL |
| Shared context | 5 passed | Plus targeted actual chat prompt assertion |
| Usage attempts | 3 passed | Actual wrapper, mocked fetch + local PostgreSQL |
| Calendar product | 38 passed | Pagination, state, mutation behavior |
| Time conversion + campaign | 14 passed | Includes 5 intentional defect characterizations |
| Media storage/download | 11 passed | Includes byte-exact response test |
| Plan DB after reattachment | 9 passed | Before newest interview changes |
| Plan API after reattachment | 6 passed | Before newest interview changes |
| Plan revision worker | 5 passed | Model mocked |
| Plan viewer component | 6 passed | Includes polling, stale anchor, history, reattachment |
| Plan browser | 5 widths passed | Fixture API, light theme |
| Calendar browser | Passed | Real DOM/drag, fixture API, UTC |
| Backend + web types at reattachment | Passed | Superseded by unverified interview edits |
| New interview typecheck attempt | Failed once | Narrowing fix written; not rerun |
| New interview tests | Not written/run | Immediate next work |

### Known broader failures

- Initial full orchestration baseline: 346 pass / 21 fail after local migrations.
- Later context-era full run: 355 pass / 23 fail before follow-up fixes.
- A targeted 80-test provider/planner/worker/calendar/compose set then passed after replacing the old profile assertion, LinkedIn multi-image fixture and compose cap coupling.
- Remaining legacy failures include expired August hardcoded timestamps, obsolete prompt/tool call expectations, autonomy/full-access behavior, onboarding short-description/step validation, and other stale service assumptions.
- First parallel web run had 167 pass / 6 fail; five were contention timeouts and calendar fixture was a confirmed defect. Later serial full run passed 174 at its checkpoint.
- Some historical logs mentioned in progress are no longer present in `/tmp`; recorded results are historical evidence, not reproducible current output. Existing log inventory below identifies what remains.
- Latest `git diff --check` passed before interview additions; no final release lint/build/check audit has occurred.

### CI

- Product `.github/workflows/verify-v2.yml` provisions Postgres16 on 5433, installs Node22/pnpm9.15 + standalone web dependencies, migrates only explicit test DB, runs selected profile/context/plans/API/usage/revision suites, baseline script, installs Chromium and runs browser tests.
- Product deployment workflow depends on foundation verification.
- Delivery has corresponding foundation verify workflow and deployment gate.
- `scripts/test-v2-baseline.sh` runs selected clerk/campaign/calendar/time tests and selected web components; it is not the full release suite.
- Some baseline tests intentionally characterize defects. A green targeted gate is not V2 acceptance.
- New interview tests, full scheduling fault harness, themes/accessibility, billing and controlled pilot are not in the gate yet.

## 10. Environment variables and remaining setup

**No new production environment-variable names were introduced by these V2 checkpoints.** New schemas require coordinated migrations before the new worker/API boots. The latest interview path reuses existing provider settings but has not been tested.

### Existing product settings to retain/check

- `DATABASE_URL`: production Neon on Fly API; explicitly local URL for local processes.
- `TEST_DATABASE_URL`: distinct migrated local test DB; must contain `test` for test guard.
- `JWT_SECRET`: product-to-SocialMCP HS256 identity agreement.
- `PORT`, `NEXT_PUBLIC_API_URL`, `PUBLIC_API_URL`, `CORS_ORIGIN`: correct local/cloud origins.
- `MEDIA_VIEW_SECRET`: dedicated production media HMAC secret, not reused JWT secret.
- `R2_ENDPOINT`, `R2_REGION`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`: private media store. API boot constructs media service; absent configuration can fail startup/media routes.
- `THESEAN_API_KEY`, `THESEAN_MODEL`, `THESEAN_INTENT_MODEL`, `THESEAN_VISION_MODEL`, `THESEAN_SETUP_MODEL`, `THESEAN_VOICE_MODEL`, `THESEAN_TIMEOUT_MS`.
- `ORCHESTRATION_CONTEXT_TOKEN_LIMIT`, `ORCHESTRATION_OUTPUT_TOKEN_LIMIT`, `ORCHESTRATION_MAX_TOOL_STEPS`, `ORCHESTRATION_DAILY_RUN_LIMIT`, `ORCHESTRATION_EXTERNAL_TIMEOUT_MS`.
- `SOCIALMCP_MCP_URL`: product execution endpoint. Existing loadOrchestrationConfig also requires it for the plan worker even though plan revision itself does not call SocialMCP; decouple in role-routing work.
- `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`: existing optional research settings from code. Verify actual endpoint/citation/tool support before claiming delegated research works.
- `OPENAI_API_KEY`, `IMAGE_MODEL`, existing image budget/job settings: existing image generation, not migrated to shared credits yet.
- `SETUP_AGENT_ENABLED`, `THESEAN_VISION_ENABLED`: existing controls; no new smoke claim.
- `THESEAN_THINKING_*`: soft-deprecated; do not revive the abandoned private-thinking UI.
- Legacy `PUBLISHING_AUTHORITY_ENABLED`, consent/full-access controls and `CAMPAIGN_QUEUE_CAP=30` remain in code/example env. They are migration debt to retire under A14, not recommended V2 defaults.

### Existing delivery settings

Threads and Instagram use separate Meta apps. Preserve correct credential separation:

- Threads: `THREADS_CLIENT_ID`, `THREADS_CLIENT_SECRET`, `THREADS_REDIRECT_URI`, with existing documented META fallbacks where supported.
- Instagram: `META_CLIENT_ID`, `META_CLIENT_SECRET`, `INSTAGRAM_REDIRECT_URI`, `INSTAGRAM_GRAPH_API_VERSION`.
- LinkedIn Personal: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI`.
- Shared: `TOKEN_ENCRYPTION_KEY`, `JWT_SECRET`; local HTTPS `SSL_KEY_PATH`, `SSL_CERT_PATH` if used.
- Webhook verify settings: `THREADS_WEBHOOK_VERIFY_TOKEN`, `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`.
- Optional local MCP identity `SOCIALMCP_USER_ID`; product requests use tenant JWT `sub`.
- Product OAuth return setting `PRODUCT_OAUTH_RETURN_URL` as applicable in delivery environment.

Never copy encrypted account tokens into `.env`; they belong in the delivery database. No credentials were intentionally included in this handoff; the local development DB examples are the repository's standard local values.

### Local services and eventual billing setup

Repository cloud-agent scripts can install deps, start local Postgres/MinIO, seed local env/bucket, migrate and run API/web. Inspect before use; they may change local services. MinIO is a local substitute, not production R2. Existing local provision/password scripts support login.

Paddle keys, sandbox catalog/price IDs, webhook endpoint/secrets, rate-card config, ledger/entitlement policy and deployment instructions are **not implemented**. Do not present invented variable names as existing setup. Define/configure these in phase 6 and then produce the final user-facing environment guide. Similarly, explicit multi-provider role routing may introduce new configuration later; none is finalized here.

## 11. What is not done, despite existing names/UI

- A new Plan page is not a completed interview-to-delivery product.
- A saved direction approval is not finished content approval or scheduling permission.
- A passed legacy characterization is not a fixed legacy defect.
- A receipt table in SocialMCP is not a product schedule-operation/reconciliation implementation.
- An unknown token/cost field is not measured free usage.
- A queued batch is not a completed revision; a scheduled row is not a published post.
- Source annotations/parsing code is not live verified research or factual correctness.
- A mocked model decision is not an evaluation of delegation paraphrases.
- Five responsive plan fixtures do not satisfy every A12 screen/theme/accessibility requirement.
- Foundation CI does not prove a production-ready release.
- Existing Fly/cloud URLs do not contain these uncommitted changes.

## 12. Full remaining-work map

### Phase 0: truth, failures and contract

- Finish source/behavior audit of remaining baseline defects and current tests.
- Replace outdated fixtures/assumptions where V2 supersedes them, while retaining meaningful negative tests.
- Complete all A11 fault cases, including tenant key collision, replay/conflict, partial insert rollback, timeout after commit, overlapping workers, crash after remote acceptance, cancel during claim/publication, invalid edit and media timeout.
- Establish current verified adapter capabilities and shared contract consumed by UI.
- Re-run full package/build/lint checks after the new paths land; track actual remaining failures.

### Phase 1: context and usage

- Wire every generation/rewrite/setup/media/research/background path to scoped context and correlation.
- Finish source/provenance linkage to new plans and generated content rather than legacy-only structures.
- Account for all model/tool/research/image/worker attempts, including failures, retries, cache/reasoning and unknown usage.
- Preserve one business preference identically across planning, writer, rewriter and worker models; add integration proof.
- Rate cards, fixed-precision expense calculation, reconciliation, usage display and separation from charge policy.
- Audit swallowed accounting failures, retry IDs and unscoped calls; never translate missing usage to zero.

### Phase 2: durable content and scheduling (major absent core)

- Create durable content items, immutable revisions, platform/account variants, media/source/plan lineage and generation jobs.
- Generate from exact direction-approved plan version; finished captions/assets must survive crashes and scheduling restarts without regeneration.
- Store missing asset/factual placeholder blockers; allow explicitly selected ready siblings to proceed.
- Add separate content approvals tied to revision and actor; invalidate unscheduled edited content approval.
- Build exact account/date/timezone/content confirmation. Persist UTC + display timezone and selected revisions.
- Create one logical schedule operation per destination with stable key, state, attempts, request fingerprint, external ID and receipt.
- Implement bounded workers, concurrency/backoff/jitter, reconnect/invalid-media handling, exact lookup/replay reconciliation for possible remote success.
- Distinguish scheduling intent/progress from due-time publication state; never create a second competing schedule authority.
- Preserve failed siblings, no-slot state and aggregate counts; propose alternate slots without changing confirmed dates automatically.
- Cancel pending local operations separately from remote schedules; expose uncertain cancellation/publication races.
- Handle media lifetime through scheduled due date, not merely preview-token lifetime.
- Scheduled content edits become proposed revisions, with supported remote update or verified replacement workflow; show live scheduled vs new draft.
- Build 20/50/100 destination harness with per-item receipts; operational batching must not truncate requested scope.
- Migrate/drain existing campaigns behind controlled routing; preserve external IDs, block dual workers, pause/review work lacking evidence.

### Phase 3: interview, plan, content review and UX

- Finish §7 interrupted integration and tests; preserve full original request constraints through partial turns.
- Evaluate delegated/partial/clarification behavior, do not rely on exact phrase lists.
- Validate research attribution, failure offer and persisted source reuse.
- Connect chat ↔ saved plan ↔ direction approval ↔ durable content generation and previews.
- Complete plan change summaries/section navigation, conflict feedback and long-document usability.
- Reuse existing review/edit primitives safely; add clear stage actions and no implicit scheduling approval.
- Finish all A12/P17 surfaces described below.

### Mandatory A14 scheduling-only retirement

- Remove full-access controls/settings/entitlements/prompts/tooling and immediate-publish product routes/calls.
- Audit direct API/tool bypasses, single posts, campaigns, accepted plans, privileged users and background jobs.
- Route “publish now” through review/schedule confirmation; no hidden instant schedule.
- Preserve SocialMCP due-time publication and confirmed existing schedules.
- Inspect legacy campaign approval evidence; pause/transition unreviewed work rather than inherit old permission.
- Test stale approvals, removed modes, no privilege bypass, and due-time delivery independently.

### Required A12/P17 UI work still remaining

- Compact aligned shell, collapsible labeled navigation; consolidate Workspace/Content/Calendar/Brand and settings/accounts/appearance/billing.
- Keep central composer; persistent plan/preview alongside chat on desktop; full-width document mode.
- Mobile Chat/Plan switch, full-screen plan, comment bottom sheet, keyboard/safe-area-aware composer and actions.
- Post editor: desktop content/assets/dates + live preview, single save with honest partial-error handling; mobile stacked editor/Preview tab.
- Calendar: timezone, identifiable handles/platforms, full seven-day navigation, agenda/list alternative, attention filter. Calendar and list are views of one scheduling area.
- Unified accounts list/connect/reconnect instead of duplicated cards/table.
- Brand memory UI for facts/voice/preferences/current priorities; raw compiled prompt is not the main interface.
- Onboarding supports short description/optional enrichment and help-needed choices instead of old skills questionnaire.
- Login service failures at form level, field errors only for invalid input; no infrastructure/secrets in user copy.
- Persist user appearance: light/dark/system, preset/custom accent; exact existing pink default `#f211b6` was identified. Derive hover/focus/tint shades and keep semantic colors separate. Workspace accent never changes generated brand artwork.
- Verify 360/390/768/1024/1440 across relevant screens, light/dark/custom accent, keyboard/focus restoration, reduced motion, unsent text/scroll preservation, no hover/drag-only essential action.
- Verify loading/empty/partial/unknown/reconnect/low-balance states and no obscured controls/overflow.

### Phase 4: useful memory and source inbox

- Extend existing profile entries with brand/campaign/item scope, provenance/status/timestamps/expiry.
- Explicit lasting instruction saves directly as editable preference; inferred patterns remain proposed.
- Distinguish one-time corrections from permanent rules; deletion/exclusion refreshes compiled context.
- Source inbox: text, links, images, voice-note transcription with editable transcripts, source→claim links and removal/exclusion.
- Scoped content/angle history to reduce repetition; semantic retrieval only if evidence warrants it.
- Expired offers/events cannot reappear; missing assets and unverified claims remain blockers.

### Phase 5: explicit model routing/evaluation/budget

- Replace `name.includes('gpt-')` client inference with explicit provider/endpoint/API-shape/capability/model/role config.
- Validate structured tools, streaming/timeouts and provider fallback semantics.
- Evaluate candidate everyday Thesean Sonnet/Terra, Luna extraction, direct OpenAI Astra strategy rather than assuming availability/discounts/default quality.
- Shared approved brief/facts/corrections across handoffs; model choice cannot change authority.
- Representative evaluation set: founders/sellers/builders, local voice, delegation, conflict, missing facts, long campaigns, failures.
- Human review plus factuality/voice/usefulness/repetition/tool reliability/latency and total cost-to-approved-content.
- Standard/Advanced independent of workflow if justified; no silent downgrade/cost escalation.
- Estimates and max-spend authorization with reservations for active calls; actual enforceable ceilings.

### Phase 6: subscriptions and shared AI credits

- Server-controlled configurable Paddle sandbox catalog for locked prices/allowances/top-ups.
- Verify webhook signatures, amount/currency/product/purchase mapping; deduplicate event and underlying fulfillment.
- Append-only fixed-precision ledger/reservations/settlements/releases/refunds; atomic balance mutation + idempotency.
- Reserve before paid work; settle once; release unused; reconcile unknowns; no double debit for system retries.
- Concurrent work cannot overspend; successful work/remaining reservations reconcile.
- Distinguish entitlement and balance; zero AI credits cannot stop already-generated due delivery during active service.
- Preserve legacy image usage/history; define any beta conversion without inventing purchased balances.
- Resolve deferred policies only when needed for a live promise, with founder input; do not invent terms.
- Cost/credit UI, estimates, catalog/usage docs and unit economics before paid launch.

### Phase 7: migration, pilot and release

- Controlled legacy/new routing/drain/rollback with no orphaned or duplicate campaigns.
- Authorized controlled accounts/content: plan → content → schedule → due publication, reconnect, timezone, media lifetime, uncertainty and receipts.
- Current official platform requirements and capabilities verified, no advertising stubbed connectors/formats.
- Representative users complete first approved plan, first batch and return use; measure product-reference metrics.
- Closed beta provisioning can differ from public self-service, but acquisition/login recovery/onboarding needs must be real for the chosen release.
- Complete tests/build/lint/browser/accessibility and requirement-by-requirement audit.
- Coordinated migration/deploy only through authorized release process; these local changes do not authorize external publication/payment.
- Final user summary with actual implemented features, limitations, migration order, all new env/config and any phase-two setup.

### Phase 8: conditional expansion

Reusable templates, optional weekly check-ins, selected integrations, performance-informed planning, more brands/accounts, teams, formats. Only after demand/API access/retention evidence. Large video generation/autonomous engagement are deferred. Do not accidentally turn conditional expansion into mandatory launch work.

## 13. Suggested continuation sequence

1. Stabilize and test the interrupted interview branch without unrelated rewrites.
2. Make the first full tracer path through **every** required stage: retained interview → real persisted plan → direction approval → generated content revision → content approval → explicit schedule confirmation → delivery receipt → observed status.
3. Widen that path to destination variants, partial failures, 20/50/100 items, interruption/reconciliation and media lifetime.
4. Complete scheduling-only transition and blocked direct-route tests before calling the product safe.
5. Complete context/accounting coverage and sources/memory; implement shared ledger/routing/billing in parallel only where invariants are settled.
6. Complete the required UI surfaces/themes/accessibility and integration/pilot gates.
7. Reconcile durable documentation and run a full requirement audit against the embedded authoritative docs. Update goal status only when the whole objective is actually achieved.

Use project skills where appropriate. Already read/used during this work: develop (including flow/build logical guide), architect, drizzle-orm-patterns, postgres-drizzle, debug and Hono. A prior read-only delivery scout mapped source; no agent is currently implementing a separate piece. Do not spawn agents unless the user's or applicable instructions authorize delegation. Current user request is documentation/handoff, not further coding.

## 14. Other conversation context and boundaries

A later screenshot showed an unrelated VPS directory `/opt/naivolt/backend-rs` failing Git fetch because it was not a repository. The assistant explained the `&&` chain stopped before build/restart and suggested read-only directory discovery. No VPS command was executed by this agent and no fix there is part of this Sochestral work. Do not infer a deployment occurred from that screenshot.

The last user request explicitly paused implementation to get a full Markdown handoff. No goal-complete or blocked status was set. No new environment setup, push, deployment or external communication is implied by producing this file.

## 15. Evidence appendices

The following inventories and embedded records preserve the exact handoff snapshot. They are appended automatically from the inspected local files. Historical progress claims remain historical; §7 and the current diff identify newer unverified work.

## Appendix A. Exact worktree inventories

Snapshot captured 2026-09-11T20:24:37.001136+00:00. SHA-256 values identify the inspected file contents, not a commit. The handoff itself is excluded. No secret environment files are included.

### Product: `/home/zayntechinfo/work/projects/sochestral`

```text
a0d26e58580f99e60cca474c8d0df9873c33c869 Merge pull request #17 from zayn-tech-info/cursor/setup-dev-environment-429b
codex/sochestral-v2
```

| Git state | Absolute file | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/.github/workflows/deploy-fly.yml` | 3765 | `43c32d3bc78b8b62dc20440f926a0b53c255856fa74c53f30f3f196aba85268e` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/api/src/app.ts` | 7108 | `6878964a45143d1255b2d652aae2f1a130c608c4c0f30bcf49eeda4787b38066` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/api/src/brand-brief.ts` | 3858 | `a6f5c472f6d573954d533f722fca0f765ec75a8c76cf2409f5d85ef20ab4cb88` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/api/src/index.ts` | 961 | `8d223d9998e331a5e1b7d52f9e54be5b5ccdbdb4034c3b7ba84a47a7bfd69152` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/api/src/media-routes.ts` | 4876 | `2679842b419f6f17e5cb680bbf4c097bb4a7c4baab28576da6180c9ee9c6027f` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/api/src/media-storage.test.ts` | 10991 | `3fda7454a15475b54ca0a5a573a183c48d0174adb430bdea22be10ce99ba3050` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/api/src/profile-routes.test.ts` | 9041 | `ccfae5ebcfe68ca173f9357b4781dbcb14d29f9f9b6d4a26f5a86b1ff997f421` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/api/src/profile-routes.ts` | 10407 | `aa65c1bd5847b3b4eb05f5cc620b2cc7b33bddddc121ef76d62479a9a60ab2de` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/api/src/voice-compile.ts` | 3878 | `8356de8ab2eada34a53388a80b6d231dc086bf0e2a6d4e96e84fc4aa7b1801e8` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/database/drizzle/meta/_journal.json` | 3839 | `452c8d82f90cd2db75a701e4f33ddf155d95fbdf32a7707f378f32c91c47b3b4` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/database/package.json` | 725 | `a24c71a2eec6abb0e4a2500fbc52fc25e35b57328b7b686de308a17baee03f4b` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/database/src/index.ts` | 7536 | `83675f722ae1608bd027f0d52dc79eecd642a3eb370bd522b0096de3a3ffa0a9` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/database/src/profile.test.ts` | 10026 | `302c866b84c7579306575d4211e66157e473796ac75aee7400bbb40f3d13d2a5` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/database/src/profile.ts` | 25217 | `a8609fdf4a73dbc825753d88d66c669ac3b7449d741fc912f1206a25b94ca56a` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/database/src/schema.ts` | 44923 | `86bac852e58b9156f421383d3cc630e87470a9e0c94a26047f090ddcb9514fed` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/autonomy-brief.test.ts` | 9403 | `12c7c133333701e4b0d73040912555a7f193469d21b5358a92836fb367a296ba` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/calendar.test.ts` | 41074 | `23a22e9b18c86a40d0c0784a07caff645e671a1d841e337829d88c2c5e322c23` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/calendar.ts` | 42837 | `dc4ed18ad78cfb62f9193e9ae0ed95fd02032bff0e3273a08472e5bd19f5c537` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/campaign-day.ts` | 11792 | `192cf2eab15f279c75cfe1eab911a045645046669bdd82237f92c8ff0df6c985` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/clerk-lock.test.ts` | 5640 | `4a712ade11445b1b0b106d70d28e47bc6d3b8c890dade21056830e7389e80b85` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/clerk-lock.ts` | 8977 | `076c268cde31dbf25d89f5cc47ce0b836030e99b8adcf41f5ba7bab412ae39e4` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/deepseek-search.ts` | 4973 | `3cc1eddda6d74737cb7628689c75c3cc37408d493c4a2addcea56479fd6d832a` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/index.ts` | 5927 | `a595634105b3c74d016078218823e8d51da2355184ebf3623d17a73fd3f2a640` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/model.test.ts` | 11109 | `be34008d5933990727bda17b802cb7f0696226560c2b44fd8af6afdda052eb65` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/model.ts` | 11975 | `5c791d497dfc7d54dbc563a2fe2db1f1ed511428b9e5053e5dea53a4051fdb96` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/openai-model.ts` | 8649 | `24f3ca3f99cdff335ebafbbe3b2287fc6b263e6ad568e4cecefc9fbf07af64db` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/platform-media-limits.ts` | 480 | `07d08b730b5fda2eec0c0a3cb936a6957f1a22e2c606ab9d5b1be8e830262acf` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/schedule-compose.ts` | 10516 | `8a0e1462c0d352cd8e09670d6c339c28ffe4e431a160ca7d74928fe18c883be2` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/service.test.ts` | 84180 | `25cae9d82a6575e8a658364edf30b8d4443785c5040bed7d7a9f99bcefa076fb` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/service.ts` | 129006 | `5427f5f6ddde10c2938b5b127daadc2988a6312faf399795570c4738ad21f09f` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/vitest.config.ts` | 224 | `2adf896bb4d17c8ac34bb3e0b1b4b300f42c6592c7ea0e6ad4682b0f275e84cd` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/pnpm-lock.yaml` | 107411 | `cd07bdf87e8aeb3dfe9313555526f9bc721b158b9f5320da9a326b15ec664b71` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/web/.gitignore` | 528 | `d4c43757a3f830f5a8b5ea873ef1a49556e2c90873ab304baf5de788c0686eef` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/web/package-lock.json` | 408503 | `062f60db77b3b5f4d7d2d4b2b9cca885f6e95d7f8ed2ce25a723b46c17ed99fb` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/web/package.json` | 1089 | `9716d3cad17de244c18b0bb8bd6e109d38f9bebeb8e9820f814d74bf65b27db2` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/web/src/app/globals.css` | 258016 | `7c85c29c97c406130515d3a7e437bac9555d7717c64e622a835d20dcf8cfefcf` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/web/src/components/app/personal-settings.test.tsx` | 4561 | `09823822f6b6a7da1b957dffcc9d5b08deceb0449af60818e92b09c6eb00f0ab` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/web/src/components/app/personal-settings.tsx` | 16436 | `857b6efe1607e2ae09762b830003150a6647cbf108aeeac1f838a9d4d0e5b189` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/web/src/components/app/schedule-calendar.test.tsx` | 17770 | `91c22d35f79c04913cfa2965d7803b9952bbe2b52a6d33d27040933c228c21e1` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/web/src/components/app/schedule-calendar.tsx` | 43646 | `6f456c5ae4d1747b1e48c3620ca112f4d5fcd5e08b95bde4035b749d33c944f6` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/web/src/components/app/schedule-detail-modal.test.tsx` | 25581 | `8ea5d163081c9459df7dfebe28b904b939b80cca7ac446a84b6f5f29cba40e41` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/web/src/components/app/scheduled-posts-list.tsx` | 12051 | `f08a1da7bf56db8422116a03bf7b891dac0543815840bc70028f982fbb76ae68` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/web/src/components/workspace/side-nav.tsx` | 15245 | `8c825699f602f6e420c2fd27b8ebdf482ced51d0ad10609f84dce005f9665e90` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/web/src/lib/platform-media-limits.test.ts` | 1030 | `424b0185f1947bfeab0d988baf4e5bb40431d49ce684b8e9125f354a0d7df78e` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/web/src/lib/platform-media-limits.ts` | 993 | `5474e2297a52bbf4ecb3e9e86b65712bf871d018fcb5435b9f9c6eb796424d18` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/web/src/lib/product-api.ts` | 22644 | `181921a9d592fe7dea20470e1979f1a4cfd6ec101efabed818388900ae7bca74` |
| ` M` | `/home/zayntechinfo/work/projects/sochestral/web/vitest.config.ts` | 430 | `ec76ddba0ba085c1f400e45a31f7816cdef0a0201c84e8fd22922a147a39d92b` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/.github/workflows/verify-v2.yml` | 1796 | `76c9285260e81d0fa6e939da4ad911cb0952785e4cadecff94adcc2a8467c8b5` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/docs/v2/Execution-Contract.md` | 6516 | `8fab238cb211e7f6b70af76cce862b7c99f3d0dc499fb1b5f73e62ec9156c00a` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/docs/v2/Implementation-Progress.md` | 20323 | `0b15452398444a0a9d4b564ca00cdf10af46dc45bd3f401019756619a332037d` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/docs/v2/Repository-Assessment.md` | 10725 | `874ae79d775bce31a37e0c5d1940b5c713934053b0ee6d5947a8707341346e5c` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/docs/v2/Sochestral-Agent-Implementation-Guide.md` | 42954 | `9327100296f2d771bba09d3a19b52b0f5903f7ae3a6a62cfd929f0fdb058755b` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/docs/v2/Sochestral-Product-Reference.md` | 34074 | `c356598c436b8dabd088d9131313c3bf360760b071b58002371917303985b594` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/api/src/plan-routes.test.ts` | 6668 | `faabc528567f886c096ff7cb64389fcdeda5d12a0ef04674a64fa6f025d7e518` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/api/src/plan-routes.ts` | 6445 | `a34cea8c62b20ed38ec409e82f007352182afd76e131e42442c68c6e88391060` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/api/src/plan-worker.ts` | 1153 | `797bdd56edff351e7bf59bdb6cda108f8b8d05422fef98525ceda792a97dccea` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/drizzle/0019_confirmed_timezone.sql` | 178 | `86ffcf060ad7d5a1fe8b5a69360799d99546bbf7edaf412536c9b7974ef783d2` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/drizzle/0020_generation_context.sql` | 1482 | `4830180b8010783025f3625570d10c5f9faf5db7a1f99830e9369d667c156484` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/drizzle/0021_usage_attempts.sql` | 1083 | `1f42fe99a70823e627a479ce5b6ca92e1345cc8b4a94e3d4a99f342b73b66db2` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/drizzle/0022_versioned_plans.sql` | 4194 | `ec75190038cec5e0c66d7488a38d283f3148ce28bd4a2126cbf61828e4f36d12` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/drizzle/0023_keen_gauntlet.sql` | 384 | `73b09d30f07219577588a00443930734514bf276412a62760c2fb09d077c1c36` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/drizzle/0024_nappy_firedrake.sql` | 812 | `22b31c457068806bb4aa9da3f02e001d24977f68eb2c1e2626b09cbe039271ef` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/drizzle/0025_chubby_psynapse.sql` | 1184 | `378083852a333587f60cdc3db9682b1cdc574530be118bf142f1ab45266a9efd` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/drizzle/meta/0019_snapshot.json` | 102432 | `c972fae088bfbf8c895604579d060bba27a1219962d2ad93b2638f1fb7cd02b2` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/drizzle/meta/0020_snapshot.json` | 107513 | `e63c496f92128cf5abf2979b6d1a4a4d99a6a3aea1b3225bd683ad1f08cdd859` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/drizzle/meta/0021_snapshot.json` | 112220 | `3bc4ede1469e7496a571badb9a918b9cc0999aca67489e1864af2ab2f3694997` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/drizzle/meta/0022_snapshot.json` | 126637 | `62e9b768f783b4d7e6c94e2deabff303e7cc828a376c63be7df4b679945f962e` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/drizzle/meta/0023_snapshot.json` | 127299 | `7b03b80f490da7eab6e81e97ad276f1f5e37af3201d4ba03400263fbd6e9097a` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/drizzle/meta/0024_snapshot.json` | 128316 | `ab92ce46eb2034eb17edb33968e1f32c3c3efe0cf8fbf5cebefa2a00154dc2e3` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/drizzle/meta/0025_snapshot.json` | 131380 | `d68c39a216a6e9dc052e50bc8dbee3e528f5cc26082bdf2e5761fbe33c0f18c7` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/src/generation-context.test.ts` | 4693 | `8c7febeaedd6861ec90c1f7b2644200fe2dffc9af4bac7fddbab07031ff968c7` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/src/generation-context.ts` | 5813 | `ac8023b11ca00ab734befe6741836328c2064c56d002eecd51cb4d63a4d81720` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/src/plan-document.ts` | 3355 | `8a9ec2c3abc781a028c6429821f71f8ed3662f651bb2ae1eeec3c8da3e4ede43` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/src/plan-interview.ts` | 3277 | `153aed894ce2c6f7ae75ef2627f53a4f3fc057e17669090a4e975317d9c9a2f6` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/src/plans.test.ts` | 8329 | `a299ec725d05a4674763da85a11a49dea0aacca68639734d94f105613ca70391` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/database/src/plans.ts` | 18824 | `7b3007f1da76bdf58503eed45afabd0aba0b1c822374e16f0eb0dd8742d8eff1` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/campaign-loop.test.ts` | 4119 | `231650034627f2d186201a9e6d3fced9b417e302cc6249e4866d94ed4217a763` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/plan-interview.ts` | 9963 | `a44ed994d4d880ff9d99384a0bca6ff056257528a7307ac0dd0c781d4f50112b` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/plan-revision.test.ts` | 5731 | `bc001ef2a4aea26d6c126ffdeccf739fcab7b589cecba240fd5c0655f9360340` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/plan-revision.ts` | 3461 | `e156d5a8e912c49e64b8dcd893a5f66dbef1d590dee4f93f0161ffbe84b1cbd1` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/schedule-time.test.ts` | 1427 | `e63a47ba18fb6ec1b2532c7c455e4704e76444b06d5d522edcc97a179e2ddaa8` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/schedule-time.ts` | 1737 | `e3ec7393cd871799bd9750cb8926142868fe1dbe721ba1776e752c6e5afeb038` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/usage.test.ts` | 3611 | `0ba9c6026fde08f743eee85f079d3f43e2b785298b53cd24f3994468ccecf8d2` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/packages/orchestration/src/usage.ts` | 2539 | `248932992058c0e3a239fae04f95b6b8d8c0ce1846b8ca3697ee98387d0e7692` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/scripts/test-v2-baseline.sh` | 505 | `5227ff89679603e5e8b9063a98fd3d09c6ceae5f426af9c11e212c47a5e54d2b` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/web/e2e/calendar.spec.ts` | 2786 | `bf25c30e08e3b2d4fcdfdfec1651784ebf14825ee2604b5e87f8616d70262035` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/web/e2e/plans.spec.ts` | 5501 | `ad4b4147038e74afe3bd60715593e424f37e8e6cd675078a6f8cc7a5b9630177` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/web/playwright.config.ts` | 493 | `5d720f869321379e5b863012e8ac750e2ca18740e7778cb39dbfa41db18eea64` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/web/src/app/app/plans/[planId]/page.tsx` | 231 | `ff2c3c8d366fa6d1fbbaae4179e4eca6f87f23316da558da2f92f4e8c6f2b08c` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/web/src/app/app/plans/page.tsx` | 120 | `1e25598e67c82e6130b08c27cc396f49b880634677aebe11ff0e107b2e8192de` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/web/src/components/app/plan-viewer.test.tsx` | 7283 | `1900bc91a33fb43989f28d698c7d6db5802476558c973c14434c5ed7ecfa9f8b` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/web/src/components/app/plan-viewer.tsx` | 14815 | `ae6361c29500d8f811972c733b817457c22c120022a83f7419c46753cad93680` |
| `??` | `/home/zayntechinfo/work/projects/sochestral/web/src/lib/plans-api.ts` | 2556 | `a382ba79c5c7d99627af5c84c21fb087bdd9917bcf7de9b83663132b3ec10608` |

### Delivery: `/home/zayntechinfo/work/projects/all-social-mcp`

```text
8a6317ad1e8735954f5aae10ceb370a9e3eff390 chore: update fly.toml to rename data source for mounts
codex/sochestral-v2
```

| Git state | Absolute file | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| ` M` | `/home/zayntechinfo/work/projects/all-social-mcp/.github/workflows/deploy-fly.yml` | 1255 | `3550af021be241ff748bed9d766cf2c98e25bb9b322d4d25487edb200f685cde` |
| ` M` | `/home/zayntechinfo/work/projects/all-social-mcp/apps/mcp-server/src/tools/register.ts` | 10664 | `878ebb80639fb4313831986a6bda937961d447ce47f5a276bd209d28baf1eb01` |
| ` M` | `/home/zayntechinfo/work/projects/all-social-mcp/apps/mcp-server/src/tools/schemas.ts` | 10345 | `566b9873f24cd9432c85df6874342a26481b6553fbe0fda65682e5cfaa2fbab1` |
| ` M` | `/home/zayntechinfo/work/projects/all-social-mcp/apps/mcp-server/src/tools/service.test.ts` | 60075 | `c87b25390e288a3d6581bf7c29f1acb55b466b1256cd8d20c75ada22e3913ccf` |
| ` M` | `/home/zayntechinfo/work/projects/all-social-mcp/apps/mcp-server/src/tools/service.ts` | 76388 | `eb90054904a95602111067c04661cb74ea6f2873057a66c5dfa0a7eaca3b798b` |
| ` M` | `/home/zayntechinfo/work/projects/all-social-mcp/apps/worker/src/index.ts` | 2023 | `ce7b0a74de9ae562efb87ea1a3bbf74fce84f1c87afe55d987234e3835dd04be` |
| ` M` | `/home/zayntechinfo/work/projects/all-social-mcp/apps/worker/src/process-due.test.ts` | 24080 | `07d91ae62323150b85e0f39e51c4f8a2e831f71838e1a852c96b36ed9c71dfd4` |
| ` M` | `/home/zayntechinfo/work/projects/all-social-mcp/apps/worker/src/process-due.ts` | 14770 | `fffd9b8c48c90e8983a58289d2d6dc5a6191f2860d9e7cb493da9b9f5dd48bc6` |
| ` M` | `/home/zayntechinfo/work/projects/all-social-mcp/packages/adapters/src/base/platform-adapter.interface.ts` | 1491 | `f36f9b37c9017abb9be7f6944fbbeab4cfb887897209afbdd3dfccc6374674bc` |
| ` M` | `/home/zayntechinfo/work/projects/all-social-mcp/packages/adapters/src/linkedin/linkedin.adapter.ts` | 14505 | `deb1a41e96f43e5c3b24de69706364172f9621fc1d59681b65c9f2651c14320c` |
| ` M` | `/home/zayntechinfo/work/projects/all-social-mcp/packages/adapters/src/meta/instagram.adapter.ts` | 23726 | `f05c783ebbb408b4551409f9e22ad0a0069ba4658ac80c843ce57056317682d3` |
| ` M` | `/home/zayntechinfo/work/projects/all-social-mcp/packages/adapters/src/meta/threads.adapter.ts` | 36788 | `6081780889f9537273fc769dc031cade1976e892b97d6d368f7a579e5fe9d005` |
| ` M` | `/home/zayntechinfo/work/projects/all-social-mcp/packages/database/drizzle/meta/_journal.json` | 1222 | `ec77526b421819c53c75de0436b3c5ff0bb8eb97013d070f82d460e31df2413b` |
| ` M` | `/home/zayntechinfo/work/projects/all-social-mcp/packages/database/src/schema.ts` | 12881 | `86934e1bbe9e65c0b4792b1d2fbda3f9ee5797955f4f82894e717f6b8158bd0e` |
| `??` | `/home/zayntechinfo/work/projects/all-social-mcp/.github/workflows/verify-v2.yml` | 600 | `bfb0b18ba74984e396fa9c0b9ca59813482a6c892f5b143bfa0f7549a32fe733` |
| `??` | `/home/zayntechinfo/work/projects/all-social-mcp/docs/v2/Execution-Contract.md` | 6516 | `8fab238cb211e7f6b70af76cce862b7c99f3d0dc499fb1b5f73e62ec9156c00a` |
| `??` | `/home/zayntechinfo/work/projects/all-social-mcp/docs/v2/Repository-Assessment.md` | 10725 | `874ae79d775bce31a37e0c5d1940b5c713934053b0ee6d5947a8707341346e5c` |
| `??` | `/home/zayntechinfo/work/projects/all-social-mcp/docs/v2/Sochestral-Agent-Implementation-Guide.md` | 42954 | `9327100296f2d771bba09d3a19b52b0f5903f7ae3a6a62cfd929f0fdb058755b` |
| `??` | `/home/zayntechinfo/work/projects/all-social-mcp/docs/v2/Sochestral-Product-Reference.md` | 34074 | `c356598c436b8dabd088d9131313c3bf360760b071b58002371917303985b594` |
| `??` | `/home/zayntechinfo/work/projects/all-social-mcp/packages/database/drizzle/0006_opposite_sandman.sql` | 541 | `49e3e60ae642ef8bfacf43243d28f23e35775bc0bf72f11241e3bd263ba62b88` |
| `??` | `/home/zayntechinfo/work/projects/all-social-mcp/packages/database/drizzle/0007_flimsy_eternals.sql` | 217 | `1d846bee1e04b0421382f6f8d82fbf6072c9fdce81791b3b0e749b4e6d56100c` |
| `??` | `/home/zayntechinfo/work/projects/all-social-mcp/packages/database/drizzle/meta/0006_snapshot.json` | 38028 | `939b59663d2f65eb12e61ae10454e79a7a6953c9772050dac740d02787fc1b60` |
| `??` | `/home/zayntechinfo/work/projects/all-social-mcp/packages/database/drizzle/meta/0007_snapshot.json` | 38605 | `6b5cbc19b96c420603c1aa2676334cf225eb4a8e779981cf89a5f534bc257d55` |

## Appendix B. Available local verification logs

These are historical runs. An older green log is not evidence for newer edits. `/tmp` is ephemeral, so summary lines are preserved here; full logs remain at the paths while available. Empty typecheck logs only count as success where the earlier session exit code was checked.

### `/tmp/v2-context-targeted.log`

Bytes: 1439. SHA-256: `95be3e1cc0d767fcdd94ba3e090497fe76da7b0fb41c76758a82a0942de18633`.

```text
 Test Files  6 passed (6)
      Tests  80 passed (80)
```

### `/tmp/v2-interview-generate.log`

Bytes: 1833. SHA-256: `be0a3784a6e64bcd9374f9a57591c318a667bda12134ff96a42582c90ce973c2`.

```text
[No test-result/migration/typecheck summary lines; inspect the original log for its purpose.]
```

### `/tmp/v2-interview-migrate.log`

Bytes: 1000. SHA-256: `d22866dc6ce2a321324a073289100f1703032b305170cbbad7fe1e8519bc0e1c`.

```text
Migrations applied
```

### `/tmp/v2-interview-types.log`

Bytes: 638. SHA-256: `ab84f9475c16eaede1426f802095ce163d8ec7d246ca2f371496dc659b6df043`.

```text
packages/database typecheck: Done
packages/auth typecheck: Done
packages/orchestration typecheck: src/service.ts(3017,11): error TS2367: This comparison appears to be unintentional because the types '"draft" | "live" | "chat"' and '"plan"' have no overlap.
packages/orchestration typecheck: Failed
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sochestral/orchestration@0.0.1 typecheck: `tsc --noEmit`
```

### `/tmp/v2-plan-api-test.log`

Bytes: 427. SHA-256: `1d66d976a21d265691ee14115356db2ae48a02f0140be9bfe2bf2ddc1a3ba698`.

```text
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### `/tmp/v2-plan-api-types.log`

Bytes: 329. SHA-256: `c324324d30d8a151c02b698e181c6dac75b5f05d9ecf024ba6978e9a74b94ad6`.

```text
packages/database typecheck: Done
packages/auth typecheck: Done
packages/orchestration typecheck: Done
packages/api typecheck: Done
```

### `/tmp/v2-plan-browser.log`

Bytes: 2621. SHA-256: `7bb458252eec6916a39d1bbac1ca9f6a4275ab861f493205889d08ee71db793d`.

```text
  5 passed (30.9s)
```

### `/tmp/v2-plan-db-tests.log`

Bytes: 430. SHA-256: `3dc51fd74bdf138d982242db90a09a9bd65912ddc258b0abda3a48d7f5b40a26`.

```text
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

### `/tmp/v2-plan-dependency.log`

Bytes: 1225. SHA-256: `e76af2f8b50a60d0be2c719e5c9caaa351ca59d38fef4b97d8d3ba676cd835c1`.

```text
[No test-result/migration/typecheck summary lines; inspect the original log for its purpose.]
```

### `/tmp/v2-plan-generate.log`

Bytes: 1791. SHA-256: `42304c79ec3c8001c3b1de337a7a3cc399f55f0cb7a013083e1832194fe93cb6`.

```text
[No test-result/migration/typecheck summary lines; inspect the original log for its purpose.]
```

### `/tmp/v2-plan-history-api.log`

Bytes: 790. SHA-256: `33470e0ee096a45937d64aca8b78a10c0af09cfaa36f21390cca65a81958bc21`.

```text
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### `/tmp/v2-plan-history-browser.log`

Bytes: 2634. SHA-256: `7c4bc46e95aba820a4a3577465daa394fbd82cbcb62e49680964c30598241202`.

```text
  5 passed (50.8s)
```

### `/tmp/v2-plan-history-db.log`

Bytes: 300. SHA-256: `575066f5db459756faa3148fc4d05485a54165e0f765e9f09876759e6e332a14`.

```text
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

### `/tmp/v2-plan-history-types.log`

Bytes: 329. SHA-256: `c324324d30d8a151c02b698e181c6dac75b5f05d9ecf024ba6978e9a74b94ad6`.

```text
packages/database typecheck: Done
packages/auth typecheck: Done
packages/orchestration typecheck: Done
packages/api typecheck: Done
```

### `/tmp/v2-plan-history-web-types.log`

Bytes: 0. SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

```text
[No test-result/migration/typecheck summary lines; inspect the original log for its purpose.]
```

### `/tmp/v2-plan-history-web.log`

Bytes: 411. SHA-256: `3072040665ed7cf60dc2ffdfc87e4d2822e557dbc2fdbc654c345ff5bab80ba4`.

```text
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### `/tmp/v2-plan-migrate.log`

Bytes: 681. SHA-256: `78315609b91a09f361f9729b934d632fe1c28ec36e21bccf2fbe1954eff6e53e`.

```text
Migrations applied
```

### `/tmp/v2-plan-types.log`

Bytes: 118. SHA-256: `847fb8c23371bc1a421720ac2b1665034d4cc95b71bf96c36c3478ac2a12f120`.

```text
[No test-result/migration/typecheck summary lines; inspect the original log for its purpose.]
```

### `/tmp/v2-plan-web-tests.log`

Bytes: 404. SHA-256: `08e385c414f2d609b9f9682a939f5e67b08d6856ef4ac18f5b7952657ea22455`.

```text
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

### `/tmp/v2-plan-web-types-final.log`

Bytes: 0. SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

```text
[No test-result/migration/typecheck summary lines; inspect the original log for its purpose.]
```

### `/tmp/v2-plan-web-types.log`

Bytes: 284. SHA-256: `943aa7a368dff1836aa771acf2199cc8719baeea5d0e2a62ac0f6e44d6afb364`.

```text
src/components/app/schedule-detail-modal.test.tsx(378,31): error TS2339: Property 'mock' does not exist on type '(scheduleId: string, input: { targets: MirrorCalendarTarget[]; caption?: string | undefined; media?: string[] | undefined; }) => Promise<{ created: ScheduleDetail[]; }>'.
```

### `/tmp/v2-reattach-api.log`

Bytes: 300. SHA-256: `5160af832f44f60396b7ca530d6aa0b690f5d18716a717b4b43bc4ff1db479d2`.

```text
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### `/tmp/v2-reattach-browser.log`

Bytes: 2633. SHA-256: `3511ed94dd308e36acd0877c0af398ea7a8ca5d887710fbef63dcd7fbbab7b93`.

```text
  5 passed (32.5s)
```

### `/tmp/v2-reattach-db.log`

Bytes: 300. SHA-256: `41a77bf07b261760a3f826e9901748988e5f0710e733b5dbb4b4bbef22a7c82b`.

```text
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

### `/tmp/v2-reattach-generate.log`

Bytes: 1791. SHA-256: `e36e11eb543514e6440dd02d6363bf6f70f52e0e41a8374a9716da969a3ad6d1`.

```text
[No test-result/migration/typecheck summary lines; inspect the original log for its purpose.]
```

### `/tmp/v2-reattach-migrate.log`

Bytes: 681. SHA-256: `78315609b91a09f361f9729b934d632fe1c28ec36e21bccf2fbe1954eff6e53e`.

```text
Migrations applied
```

### `/tmp/v2-reattach-types.log`

Bytes: 329. SHA-256: `c324324d30d8a151c02b698e181c6dac75b5f05d9ecf024ba6978e9a74b94ad6`.

```text
packages/database typecheck: Done
packages/auth typecheck: Done
packages/orchestration typecheck: Done
packages/api typecheck: Done
```

### `/tmp/v2-reattach-web-types.log`

Bytes: 0. SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

```text
[No test-result/migration/typecheck summary lines; inspect the original log for its purpose.]
```

### `/tmp/v2-reattach-web.log`

Bytes: 506. SHA-256: `e11507ee6c3b202d3a97ff98c714839beed37474d1a92f47b7ea7c5ea3f59775`.

```text
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### `/tmp/v2-reattach-worker.log`

Bytes: 412. SHA-256: `6a62d595c77e19928348e5852083fea5f2d92c00bf4ba760e7f67e44feacddf4`.

```text
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### `/tmp/v2-revision-api.log`

Bytes: 300. SHA-256: `a49d008a8addd02f04033fc0efbdeb3cd5598922f08f6c6f0133f0e0b6b6ef7e`.

```text
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### `/tmp/v2-revision-migrate.log`

Bytes: 681. SHA-256: `78315609b91a09f361f9729b934d632fe1c28ec36e21bccf2fbe1954eff6e53e`.

```text
Migrations applied
```

### `/tmp/v2-revision-migration.log`

Bytes: 1788. SHA-256: `710fdd90ce6d5b4eb346416ac6d826c33f7887af901d7face177c5f38f06c51a`.

```text
[No test-result/migration/typecheck summary lines; inspect the original log for its purpose.]
```

### `/tmp/v2-revision-tests.log`

Bytes: 827. SHA-256: `d61a3c713bb8502b41ce0fa6b09e02141f6de166b03b12c62648b1e0e296708e`.

```text
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### `/tmp/v2-revision-types.log`

Bytes: 329. SHA-256: `c324324d30d8a151c02b698e181c6dac75b5f05d9ecf024ba6978e9a74b94ad6`.

```text
packages/database typecheck: Done
packages/auth typecheck: Done
packages/orchestration typecheck: Done
packages/api typecheck: Done
```

### `/tmp/v2-revision-web-final.log`

Bytes: 506. SHA-256: `9bd301227391a927ac1d30615b4c74545de4182ca39c1b9a66f586738e50a72d`.

```text
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### `/tmp/v2-revision-web-types.log`

Bytes: 0. SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

```text
[No test-result/migration/typecheck summary lines; inspect the original log for its purpose.]
```

### `/tmp/v2-revision-web.log`

Bytes: 411. SHA-256: `95900b9d6e8606b4432da3a3de7caed7b0f51bf9874578c3591c1fdb9fc3fecb`.

```text
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### `/tmp/v2-shared-context-service.log`

Bytes: 334. SHA-256: `38ccbf4101fdf9308fb821b1afa1d6437434bfc32d9bfee6d08d2604b4a3b1f1`.

```text
 Test Files  1 passed (1)
      Tests  1 passed | 45 skipped (46)
```


## Appendix C. Browser artifacts and verification configuration

Browser artifacts are ignored local files, not release evidence or production screenshots.

- `/home/zayntechinfo/work/projects/sochestral/web/test-results/plan-1024.png` (133371 bytes).
- `/home/zayntechinfo/work/projects/sochestral/web/test-results/plan-1440.png` (150393 bytes).
- `/home/zayntechinfo/work/projects/sochestral/web/test-results/plan-360.png` (41109 bytes).
- `/home/zayntechinfo/work/projects/sochestral/web/test-results/plan-390.png` (41132 bytes).
- `/home/zayntechinfo/work/projects/sochestral/web/test-results/plan-768.png` (47364 bytes).

### Snapshot: `/home/zayntechinfo/work/projects/sochestral/web/playwright.config.ts`

```typescript
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", timezoneId: "UTC", viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" },
  webServer: {
    command: "NEXT_PUBLIC_API_URL=http://127.0.0.1:8789 npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/login",
    timeout: 120000,
    reuseExistingServer: false,
  },
});
```

### Snapshot: `/home/zayntechinfo/work/projects/sochestral/.github/workflows/verify-v2.yml`

```yaml
name: Verify V2 foundations
on:
  pull_request:
  push:
    branches: [main]
  workflow_call:
permissions:
  contents: read
jobs:
  baseline:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: sochestral
          POSTGRES_PASSWORD: sochestral
          POSTGRES_DB: sochestral_test
        ports:
          - 5433:5432
        options: >-
          --health-cmd "pg_isready -U sochestral -d sochestral_test"
          --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      NODE_ENV: test
      DATABASE_URL: postgresql://sochestral:sochestral@127.0.0.1:5433/sochestral
      TEST_DATABASE_URL: postgresql://sochestral:sochestral@127.0.0.1:5433/sochestral_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.0
      - run: pnpm install --frozen-lockfile --prod=false
      - run: npm ci --include=dev
        working-directory: web
      - run: pnpm run db:migrate
        env:
          DATABASE_URL: postgresql://sochestral:sochestral@127.0.0.1:5433/sochestral_test
      - run: pnpm --filter @sochestral/database test src/profile.test.ts src/generation-context.test.ts src/plans.test.ts --no-file-parallelism
      - run: pnpm --filter @sochestral/api test src/profile-routes.test.ts src/plan-routes.test.ts --no-file-parallelism
      - run: pnpm --filter @sochestral/orchestration test src/usage.test.ts src/plan-revision.test.ts --no-file-parallelism
      - run: bash scripts/test-v2-baseline.sh
      - run: npx playwright install --with-deps chromium
        working-directory: web
      - run: npm run test:browser
        working-directory: web
```

### Snapshot: `/home/zayntechinfo/work/projects/all-social-mcp/.github/workflows/verify-v2.yml`

```yaml
name: Verify delivery foundations
on:
  pull_request:
  push:
    branches: [main]
  workflow_call:
permissions:
  contents: read
jobs:
  delivery:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: pnpm/action-setup@v4
        with:
          version: 11.7.0
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm --filter @socialmcp/adapters test
      - run: pnpm --filter @socialmcp/mcp-server test
      - run: pnpm --filter @socialmcp/worker test
```

### Snapshot: `/home/zayntechinfo/work/projects/sochestral/scripts/test-v2-baseline.sh`

```bash
#!/usr/bin/env bash
# Safe, provider-free Phase 0 regression checks. No live service configuration is read.
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_ENV=test
pnpm --filter @sochestral/orchestration exec vitest run src/clerk-lock.test.ts src/campaign-loop.test.ts src/calendar.test.ts src/schedule-time.test.ts src/campaign-day.test.ts
npm --prefix web test -- src/components/app/schedule-calendar.test.tsx src/components/app/personal-settings.test.tsx src/components/app/plan-viewer.test.tsx
```

## Appendix D. Product reference — complete v1.3 text

Source: `/home/zayntechinfo/work/projects/sochestral/docs/v2/Sochestral-Product-Reference.md`. SHA-256: `c356598c436b8dabd088d9131313c3bf360760b071b58002371917303985b594`. This verbatim snapshot is source material; preserve its distinction between required, proposed, deferred and conditional work. Historical progress entries are superseded by later entries and the interrupted-work section above.

<details>
<summary>Full source document</summary>

````markdown
# Sochestral — Product Vision and Operating Reference

**Version:** 1.3 · **Updated:** 10 September 2026  
**Owner:** Founder / product owner  
**Companion:** `Sochestral-Agent-Implementation-Guide.md`  
**Purpose:** The reference for what we are building, why users would choose it, how it should feel, and how the business should work.

## P01. How to use this document

Return to this document when discussing scope, priorities, pricing, or changes. Refer to the section number: for example, “Let us change P10 billing” or “Expand P06 brand memory.” Update the relevant section and decision register, then synchronize the agent guide if implementation is affected.

This is a product blueprint, not a claim that every feature already exists. Current-state descriptions come from the two coding-agent handovers supplied by the founder. No new repository audit was performed while writing these files. A subsequent source-inspection handover identifies the correct SocialMCP repository. Its live delivery behavior remains unverified here.

**Agreed** means established in our conversation. **Proposed** means a recommendation to validate. **Open** means a decision is still needed. A useful suggestion should not silently become a compulsory feature.

## P02. What Sochestral is

**Category:** AI content partner.

**Plain explanation:**

> Sochestral is your AI content partner. It learns your brand, turns your ideas and everyday work into content plans, creates posts in your voice, and schedules them across your social accounts. You guide the direction, and it handles the work.

**Mission:** Help people turn what they know, build, and sell into a consistent social presence without making content management another full-time job.

**Proposed headline:** Turn what you do into content worth sharing.

**Supporting promise:** Bring a rough idea, a voice note, or your brand. Review a thoughtful plan, refine the posts, and let Sochestral handle the schedule.

This describes the destination. Until correction memory and the full workflow are implemented, launch copy must describe the capabilities actually available.

The central user outcome is less effort between real ideas and content they are proud to publish. Useful measures include fewer repeated instructions, less editing, faster approval, and reliable scheduling. Volume alone is not the goal.

## P03. Who it serves and how to start

| Audience | Their problem | What Sochestral should do |
| --- | --- | --- |
| Business owners | Running the business leaves little time to decide what to post | Turn products, services, questions, offers, and activity into useful content |
| Founders | They have updates and lessons but struggle to communicate consistently | Turn product changes, insights, evidence, and milestones into a coherent narrative |
| Creators | Ideas accumulate without an organized publishing rhythm | Develop themes and series, repurpose source material, and manage a content calendar |

People may belong to more than one group. Onboarding should adapt the planning questions rather than force a permanent identity.

**Proposed first customer group:** People who personally manage their own content alongside another demanding role. Recruit across the three audiences and observe the shared workflow before investing in separate product editions.

Global use is a long-term ambition. Build for timezone clarity, voice flexibility, and language preferences, but validate supported languages and platform access. Do not claim universal publishing or cultural fluency without evidence.

Launch scope is one brand per user. Multiple brands may be considered after launch and are not part of the current build. Agencies and multi-person teams can become an expansion audience; multi-brand ownership and team permissions need deliberate future design.

## P04. Why users would choose it

AI captions, repurposing, calendars, and scheduling already exist in competing products. Buffer describes AI drafting and repurposing, while Predis describes branded creation, scheduling, and approval features. This makes “we have an AI writer and calendar” a weak standalone distinction. Sources: [Buffer](https://buffer.com/ai-assistant), [Predis](https://predis.ai/features/).

**Our proposed differentiator is the complete experience:**

1. Content begins with the user's actual business and knowledge.
2. The plan is visible and easy to discuss before everything is generated.
3. Corrections improve future work instead of being forgotten.
4. The agent carries approved work through to a clear scheduling outcome.

A user should be able to answer: “Why is this topic in my plan?”, “What did it learn from my correction?”, and “Did my post actually get scheduled?”

We should validate that customers value this combination. It is a positioning hypothesis, not proof that competitors lack every element.

## P05. The complete user experience

### 1. Establish the brand

Collect enough context to generate something useful: what they do, audience, goals, website or source material, preferred channels, writing examples, and timezone. Ask optional details progressively instead of turning onboarding into a lengthy form.

Show a short editable summary of what Sochestral understood. Distinguish verified facts from assumptions. A humorous creator and a formal business should not receive the same default voice.

### 2. Begin a campaign or request

The user can ask for a post, a week of content, a launch campaign, or help organizing ideas. Use context already supplied and ask a few interview questions only when they improve the result.

Questions might cover current priorities, new developments, available assets, and desired direction. Usually two or three are enough to start. Avoid repeatedly asking what the business does.

### 3. Respect delegation

If the user indicates “you decide,” “nothing new,” or equivalent intent, proceed using known context and research. If they answer one question, retain the answer and fill the remaining planning gaps appropriately.

Delegation authorizes useful planning initiative. It does not authorize invented business facts or immediate publication. If live research is unavailable, say so briefly and offer a plan grounded in existing material.

### 4. Open the plan document

Show a polished persistent document with:

- Goal and intended audience.
- Voice and content direction.
- Themes and series.
- Proposed calendar with angles, formats, and channels.
- Sources, assumptions, and missing material.

Use consistent brand colors, strong headings, subtle labels, comfortable text, and readable tables. For large plans, provide a summary and navigation by week/theme. The document should feel carefully designed without requiring the user to understand Markdown.

### 5. Comment and revise

Users highlight text and add a comment. “Review comments” submits their feedback to the agent. The agent updates the same document, preserves previous versions, and summarizes changes.

Comments survive refresh and revision. If a section disappears, its comment remains visible for reassignment or closure. Unclear feedback becomes a focused question rather than an arbitrary edit.

### 6. Approve direction and create content

“Approve plan” accepts the strategy. “Create content” produces finished posts, platform variants, and the necessary media work. Users see real captions and visuals before content approval.

An angle such as “customer success story” is not permission to fabricate a testimonial. The agent should request evidence or propose a factual alternative.

### 7. Review finished posts

Let users edit directly, comment, regenerate selected parts, or exclude items. Show incomplete assets and unsupported claims clearly. Do not force a full campaign regeneration for one unsatisfactory caption.

### 8. Review scheduling details

“Schedule” opens the proposed dates, times, timezone, destinations, and selected posts. Users make adjustments and click “Confirm schedule.” This action starts actual scheduling.

### 9. Follow progress and publication

Display queued, scheduling, scheduled, and needs-attention items accurately. An uncertain remote outcome should show “Checking status,” not an invented failure or success.

Example: “27 scheduled · 11 queued · 2 need attention.” Users can inspect and resolve the two items without repeating the other 38.

When due, completed scheduled posts publish through the delivery service. Show confirmation where available. The user should not need to keep the page open.

**Short requests:** A single-post request can use a compact version of this flow. Do not force a multi-section campaign document for a tiny edit. Retain content review and schedule confirmation appropriate to the action.

## P06. The feature set that earns repeat use

| Feature | User benefit | Priority |
| --- | --- | --- |
| Interview with delegation | Help even when users have no topics ready | Core |
| Plan document with comments | Understand and steer the strategy | Core |
| Brand memory and corrections | Stop repeating the same instructions | Core |
| Reliable batch scheduling | Hand over a campaign with confidence | Core |
| Source inbox | Capture material before it gets lost | Next |
| Reusable visual templates | Finish branded posts with less design effort | Next |
| Optional weekly check-in | Know what to do next without starting from zero | Later |
| Performance-informed planning | Use observed results to improve future experiments | Later |

### Brand memory

Remember business facts, voice examples, preferences, active goals, approved sources, content history, and explicit corrections. Keep campaign-specific instructions scoped to that campaign. Track expiry for offers and events.

Explicit instructions can become memory immediately. Inferred patterns should be proposed: “Should I use this shorter opening style in future?” A one-time edit should not silently rewrite the brand's voice.

Users must be able to inspect, correct, and remove memory. Useful memory is controlled context, not a promise of automatic model training.

### Source inbox

Users add rough sentences, links, screenshots, photos, voice notes, articles, or transcripts. Sochestral identifies possible content angles and links them to the original material.

Example: a founder uploads a screenshot of a product improvement. The agent proposes an announcement, a practical explanation, and a lesson from building it. These are proposals, not three invented experiences.

Begin with direct inputs; add integrations when repeated usage identifies a valuable source. Screenshots containing customer information require appropriate handling and review before reuse.

### Visual completion

Mark asset needs per post. Reuse approved photos, screenshots, and templates; offer generation as an explicit paid action. Preserve real product identity and factual claims.

Prioritize editable branded images and carousels. Video scripts and shot lists can provide value before a full video-generation product is justified.

### Optional weekly initiative

An opt-in check-in can flag unused ideas, an unfinished series, or an approaching calendar gap. It should propose work, respect cadence preferences, and follow existing approval/spending permissions.

### Learning from results

Use available authorized metrics to suggest the next experiment. Report missing data. Treat reach, engagement, clicks, and business outcomes as different signals; do not equate likes with sales or one strong post with a guaranteed strategy.

## P07. Chat, modes, and control

**Agreed design principle:** Borrow the clarity of coding-agent workflows: planning is inspectable, execution is visible, and users can revise an artifact before proceeding.

**Proposed interface:**

| Control | Meaning |
| --- | --- |
| Plan mode | Interview, research, develop direction, revise plan |
| Agent mode | Carry out approved creation and scheduling work |
| Standard quality | Lower-cost everyday model routing |
| Advanced quality | More capable routing for demanding work, with higher estimated credits |

Modes describe workflow; quality describes resource choice. Switching a mode does not itself consume credits or authorize publication. Natural-language intent and contextual action buttons should keep the interface usable for people unfamiliar with agents.

Show actual progress such as “Reading brand context,” “Reviewing sources,” or “Applying comments.” Internal reasoning is not a product requirement. Status messages must correspond to real work.

**Trust boundary — agreed:** Sochestral is a content planner and scheduler. Remove immediate publishing and the full-access/trusted-autonomy concept and implementation. Every content execution path requires review and explicit schedule confirmation, regardless of user role, mode, or delegation. Users can inspect finished content, destinations, dates, and progress before delivery. Publication occurs only through due-time scheduled delivery. Planning initiative remains useful but never bypasses review or scheduling approval.

## P08. Scheduling and the promise of scale

The founder's direction is clear: willing customers should be able to buy more AI work without an arbitrary 30-post ceiling.

That does not mean sending 100 requests simultaneously. The system can accept a larger campaign and process manageable batches while respecting platform rules, account status, service capacity, and spending authorization.

Distinguish:

- How many days the plan covers.
- How many content ideas exist.
- How many platform/account deliveries those ideas produce.
- How many operations run concurrently.
- How much AI work the user has funded.

One idea adapted to three accounts can create three separate delivery operations. Costs and progress must not hide this distinction.

Approved content is stored before scheduling. Restarting a queue must not rewrite it. A timeout may mean the remote request succeeded; the system must check before retrying. Ready items should survive a sibling's failure.

Publication should not require new AI generation. If optional future “refresh before publishing” features are introduced, they need separate product rules and renewed content approval where appropriate; they are outside the core promise.

## P09. Model strategy

Use a small, explicit set of roles and measure outcomes before adding complexity.

| Work | Starting candidate | What we must evaluate |
| --- | --- | --- |
| Everyday interview, planning, captions, revisions | Thesean Ship-like Sonnet 5 versus GPT-5.6 Terra | Voice, useful angles, tools, cost to approval |
| Extraction, tagging, source summaries | Thesean Ship-like GPT-5.6 Luna | Accuracy and reliable structured output |
| Complex strategy, extensive synthesis, difficult revisions | GPT-6 Astra | Whether better decisions justify total cost |
| Transcription | Dedicated transcription model; selection open | Accuracy, languages, cost |
| Visual generation | Dedicated image model; selection measured separately | Brand/product fidelity, editable workflow, cost |
| Scheduling, permissions, payments | Application code | Correctness, recovery, auditability |

These are evaluated candidates, not guaranteed winners. Thesean advertises matching reference behavior at lower cost; actual suitability must be measured in Sochestral. Availability and discount for Astra through Thesean are not confirmed.

Astra is most interesting when a task has many sources, audiences, constraints, and revisions. It can establish strategy while another model creates individual posts from the approved brief. Every handoff must retain brand context and decisions.

Assess models using representative customer examples and human review. Measure total work required to produce acceptable content, including corrections, retries, tools, and latency. A low token rate alone does not establish the cheapest successful workflow.

Keep model prices out of permanent product promises. Maintain a dated rate card internally and verify providers when implementing. References from the planning discussion: [Thesean models](https://docs.thesean.ai/api-reference/models), [OpenAI models](https://developers.openai.com/api/docs/models), [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra).

## P10. Billing and payment model

**Working launch decision:** Paddle payments, Starter at $15/month with 1,000 AI credits, and Plus at $35/month with 3,000 AI credits. Proposed working top-ups are $5/400, $10/800, and $25/2,000 credits. Validate costs before paid launch; expiry and remaining commercial policies are deferred.

### What the subscription covers

Connected-account access within its entitlement, content workspace, manual editing, calendar management, storage allowance, and ordinary scheduling/publication. These are ongoing services with ongoing operating costs.

### What credits cover

| Action | Proposed treatment |
| --- | --- |
| AI interview, plan generation, research, revisions | Credits |
| AI drafting and repurposing | Credits |
| Brand/source analysis | Credits |
| Transcription and image generation | Credits at appropriate rates |
| Viewing, commenting, manual editing | Included |
| Scheduling completed posts | Included within active subscription |
| Internal retries caused by our failure | No duplicate customer charge |

Use one balance across workflow modes. Users should not manage unrelated wallets for captions, plans, and research.

When credits run out, pause new AI work and offer a top-up or reduced task. Preserve drafts and manual editing. Already completed scheduled posts should publish while service entitlement remains active.

### Working launch offer

| Plan | Monthly USD price | Included AI credits |
| --- | ---: | ---: |
| Starter | $15 | 1,000 |
| Plus | $35 | 3,000 |

Both plans include the core planning, commenting, brand-memory and scheduling experience. Standard and Advanced model choices are available on both, with different usage consumption. Plus mainly provides more usage and better credit value. Do not introduce arbitrary scheduling caps or lock essential review features behind Plus.

Working top-ups: $5 buys 400 credits; $10 buys 800; $25 buys 2,000. The internal starting conversion is one credit per $0.003 of eligible provider expense: roughly $3 of included provider expense on Starter and $9 on Plus. This is a provisional economic configuration, not a promised number of posts. Remaining revenue must cover payment fees, infrastructure, storage, support, and profit. Track fractions internally rather than imposing a whole-credit minimum on every tiny call.

The founder deferred trial, rollover, expiry, cancellation, account limits, and other detailed policies. Previously suggested figures for those policies are not approved. Keep configuration flexible and disable unfinished actions; proceed with the core build and sandbox billing.

### Establish prices from evidence

Measure an interview and two-week plan; researched campaigns; 10/30/100-post generation; revision rounds; media; and delivery operations. Include provider costs, retries, hosting/storage, fees, and support allowance.

For an illustrative internal calculation, if the allocated variable cost of an AI task is C and the target contribution margin is m, the corresponding revenue before other adjustments is C / (1 − m). This is a planning calculation, not a selected margin or a complete pricing model. Check willingness to pay and ongoing subscription economics separately.

Show useful estimates: the expected credit range, selected quality, included operations, and a maximum authorized spend. If more work is needed, preserve progress and ask before increasing the budget. Do not silently downgrade quality or change the model tier.

Reserve credits for accepted background work, settle billable completed work, and release unused reservations. Canceling work does not necessarily make already completed authorized generation free. Explain the policy clearly.

### Decisions needed before taking payment

- Paddle onboarding/payout approval and checkout currency configuration; Paddle is selected.
- Included credits, top-up sizes, and whether they expire or roll over.
- Trial allowance and abuse controls.
- Account/brand/storage entitlements.
- Subscription cancellation, payment-failure grace period, and future schedule handling.
- Refund/dispute policy and treatment of partially completed jobs.
- Optional auto-top-up with explicit spending caps.

## P11. What exists and what changes

According to the supplied handovers, auth, database, streaming, draft review, brand entries, voice/design compilation, and role-based model configuration provide a useful foundation. Live calendar/connector/delivery behavior depends on SocialMCP and was not exercised by the reporting agent.

The main transition is:

| Existing reported approach | V2 direction |
| --- | --- |
| Plans in chat and a flat snapshot | Persistent structured document with comments/versions |
| User must bring topics for multi-day work | Interview, then intent-based delegation |
| Campaign generation schedules directly | Generate, review, then confirm schedule |
| Campaign advances through days with a 30-post cap | Durable content items and recoverable destination operations |
| Brand context differs between chat and workers | Shared relevant context |
| No correction memory | Explicit preferences plus proposed learned patterns |
| Image-only monthly credits | General usage measurement and shared AI ledger |
| Formal/business-strict wording defaults | User-matching voice with accurate business claims |

The historical scheduling root cause remains unknown. Debug instrumentation suggests an investigation around the planning gate, while the handover also identifies potential booking-loop problems. Tests and source inspection must separate those issues.

We are improving a product, not approving a wholesale rewrite. Existing schedules and useful work must survive.

## P12. Roadmap and release boundaries

| Stage | User outcome | What must be true before moving on |
| --- | --- | --- |
| Baseline and diagnosis | Known behavior, reproducible problems | Correct repository/contract; targeted failures understood |
| Context and accounting | Consistent brand understanding; visible operating costs | Chat and workers use relevant context and report usage |
| Scheduling foundation | Accurate progress and recoverable batches | Durable approved content; duplicate-safe reconciliation |
| Plan/review experience | Inspect and steer strategy and posts | Versions, comments, approval gates, date confirmation |
| Personalization | Less repeated instruction | Explicit memory and scoped corrections work |
| Models and billing | Clear paid usage with quality choices | Measured costs, budget enforcement, payment policy |
| Pilot and transition | People use the complete experience | Authorized live verification and no abandoned legacy work |
| Expansion | Greater ongoing usefulness | Weekly use justifies templates, check-ins, analytics, integrations |

A closed beta may use invited accounts. Public launch needs a workable signup or invitation path and account recovery, rather than disabled buttons promising functionality.

**Keep out of the first core release unless evidence changes the priority:** full video production, many unverified platform connectors, autonomous replies/DMs, elaborate agency permissions, and a large marketplace of models. Record requests; avoid distracting from the core workflow.

## P13. How to demonstrate and sell it

**Proposed demonstration:** A user supplies a short voice note and a few brand examples. Sochestral asks two useful questions, produces a focused plan, incorporates a highlighted comment, generates posts in the user's voice, and confirms a schedule.

The demonstration should show real input, a real correction, and an actual scheduling outcome. That makes the promise tangible.

Use audience-specific examples of the same product:

- Founder: “Turn this week's product work into clear updates.”
- Business owner: “Turn customer questions and your services into next week's content.”
- Creator: “Turn your scattered ideas into a series you can keep publishing.”

A proposed landing-page sequence is: plain promise; short workflow demonstration; examples by audience; memory and review explanation; scheduling reliability; transparent pricing; a trial call to action. Avoid promising virality, guaranteed sales, or total replacement of human judgment.

## P14. Metrics that tell us whether it works

| Question | Measure |
| --- | --- |
| Does onboarding lead to value? | Share of new users reaching an approved plan and finished post |
| Does it save effort? | Time to approval and substantive edits required |
| Does memory help? | Repeated correction frequency and preference adherence |
| Is delivery dependable? | Confirmed scheduling/publication rates, duplicates, unknown outcomes |
| Do people return? | Weekly active planners and subsequent campaigns |
| Is it economically sustainable? | Cost per approved item/campaign and contribution after service costs |
| Will users pay? | Trial-to-paid conversion, paid retention, top-up behavior |

Set numerical targets after observing the first cohort. Distinguish support-assisted success from users completing the workflow themselves. Reach and engagement can support later insights, but they should not disguise a product that takes too much editing or fails to deliver.

## P15. Decision register

| ID | Decision | Current position |
| --- | --- | --- |
| D01 | Audience | Agreed: business owners, founders, creators |
| D02 | Interview and delegation | Agreed: ask a few questions; proceed based on intent |
| D03 | Document workflow | Agreed: polished plan, highlights/comments, revisions |
| D04 | New core publishing workflow | Agreed: review and schedule before due-time publication |
| D05 | Legacy trusted autonomy/immediate publish | Agreed: remove immediate publishing and full-access/trusted-autonomy modes; all content execution requires review and schedule confirmation |
| D06 | Commercial 30-post ceiling | Agreed: remove arbitrary ceiling; retain operational controls |
| D07 | Billing structure | Paddle; working Starter $15/1,000 and Plus $35/3,000; optional top-ups |
| D08 | Commercial follow-up | Working prices selected; measure economics; expiry/lapse/trial rules deferred |
| D09 | Model role map | Proposed candidates; evaluate before fixing defaults |
| D10 | Brand voice | Agreed direction: user-matching rather than universally formal |
| D11 | Multiple brands at launch | Agreed: one brand per user; multiple brands deferred for consideration after launch |
| D12 | Source inbox/templates/check-ins/analytics | Proposed staged additions |
| D13 | SocialMCP source and live guarantees | Repository identified; source findings supplied; fixes and live behavior need verification |

## P16. Rules for changing the plan

When a change is proposed, record the section, user problem, expected benefit, affected workflow, cost/complexity, approval implications, and success measure. Label it proposed until adopted. Update the agent guide's phase and acceptance checks after adoption.

Preserve the central promise: the user contributes real context and editorial direction; Sochestral makes the planning, creation, revision, and scheduling easier to complete. Evaluate new features against that promise and evidence from users.

**Next concrete step:** Give the updated companion guide to the coding agent and begin Phase 0 across Sochestral and `all-social-mcp`. Implement the design as part of the release. Use working prices in configurable sandbox billing; leave deferred policies unresolved until needed for live paid launch.


## P17. Design specification — included in the product release

The supplied screenshots establish a pink accent, rounded surfaces, a central chat composer, calendar, account connections, memory, onboarding, and a post editor. Keep this identity and refine the experience. These are implemented release requirements, not merely design mockups.

### Appearance

One user-selectable accent, pink by default, with presets and custom choice. Automatically derive readable shades for buttons, selected navigation, highlights, and focus. Support light, dark, or device appearance and remember the preference across devices. Neutral backgrounds and restrained shadows keep content prominent. Status colors remain recognizable and separate from the accent. Changing interface color must not change colors used in the user's generated brand assets.

### Screen alignment and behavior

| Screen | Intended experience |
| --- | --- |
| Header/navigation | Compact useful header; clear labels; collapsible navigation; Calendar and List belong together |
| Workspace | Familiar starting composer, then chat with an expandable plan/preview panel |
| Plan | Readable document with sections, tables, versions, highlighted comments, revision summary, and clear next action |
| Post editor | Editing controls alongside preview on desktop; one clear save action and accurate outcome feedback |
| Calendar | Full week reachable; meaningful caption/account previews; visible timezone; filters and agenda alternative |
| Accounts | One list with recognizable handles and connect/reconnect actions; avoid duplicated card/table listings |
| Memory | Human-readable, editable facts and preferences rather than a raw compiled prompt |
| Onboarding | Same visual theme; short description accepted; ask what help the user wants rather than requiring content skills |
| Errors | Explain the problem and next action; service outages must not falsely mark login credentials invalid |

Readable starting sizes are 16px body, 14px controls, and 28–32px page titles, with consistent spacing. Accent should guide attention, not decorate every border. Exact tokens should be taken from the current code and refined, rather than estimated from screenshots.

### Responsive experience

Desktop: navigation, chat, and document can sit side by side. Tablets/smaller laptops: collapsed navigation and switchable or resized panels. Phones: one surface at a time, easy Chat/Plan switch, full-screen documents, bottom-sheet comments, agenda-first calendar, and stacked editing with a Preview tab.

Preserve reading position and unsent text. The keyboard and bottom action bar must not cover inputs. No essential task depends on hover or drag. Give touch users section-level commenting as an alternative to precise highlighting.

Validate the full workflow at phone, tablet, and desktop widths, in light/dark/custom accent states. Include loading, empty, partial completion, insufficient balance, reconnect, missing media, and uncertain scheduling. Screenshots alone do not establish working responsiveness.

## P18. What the SocialMCP handover changes

The correct repository is [zayn-tech-info/all-social-mcp](https://github.com/zayn-tech-info/all-social-mcp), inspected in the supplied report at `8a6317a`. The source report identifies scheduling tools, adapters, persistence, and a publication worker; it does not provide fresh live verification.

The main required improvements are user-scoped replay-safe scheduling, atomic worker claiming, recovery after uncertain platform acceptance, coordinated edits/cancellation, and truthful status. Without these, a large batch can create duplicate or misleading outcomes. Locking alone cannot guarantee exactly-once remote publication after a crash; uncertain cases need reconciliation and sometimes manual review.

Sochestral owns content generation, review, time conversion, billing, and the submission queue. SocialMCP owns connected accounts and due-time publication. Generation already being separate from delivery supports our no-AI-credit-required-at-publication principle.

The composer must match actual adapter capabilities. In particular, the supplied report says LinkedIn supports one image or one video, not a carousel; this conflicts with the earlier product-side allowance. Verify current capabilities and use them to control the UI. Do not promise support for platform stubs.

## P19. Deferred policies and build boundaries

The founder chose one brand per user for launch. Multiple brands are deferred until after launch. The founder chose to defer the detailed trial allowance/duration, number of connected accounts, rollover and expiry rules, auto-top-up, cancellation/grace period, subscription requirements for spending top-ups, upgrade/downgrade mechanics, and refunds. The previously proposed defaults for these are not accepted requirements.

Continue the full core build with configurable policy boundaries. Paddle sandbox checkout, metering, design, documents, memory, and reliable scheduling can proceed. Do not invent live customer terms or enable a commercial action whose necessary policy remains unset. Resolve those specific terms at the paid release gate without repeatedly blocking independent engineering work.

**Revision 1.1 — 10 September:** Updated from the SocialMCP handover, UI screenshots and design discussion, Paddle decision, working two-plan credit model, top-up proposal, and the founder's explicit policy deferral. The companion guide now includes repository-specific fixes and UI acceptance criteria.

**Revision 1.2 — founder decision, 10 September:** Remove the immediate-publish feature and all full-access/trusted-autonomy bypasses. Content is reviewed and explicitly scheduled, then published when due. Preserve planning, idea generation, and the other agreed V2 capabilities. Implementation and migration remain outstanding.

**Revision 1.3 — founder decision, 10 September:** Launch with one brand per user. Multiple-brand support may be considered after launch; it is not a current implementation requirement. This does not set a connected-social-account limit.
````

</details>

## Appendix E. Implementation guide — complete v1.3 text

Source: `/home/zayntechinfo/work/projects/sochestral/docs/v2/Sochestral-Agent-Implementation-Guide.md`. SHA-256: `9327100296f2d771bba09d3a19b52b0f5903f7ae3a6a62cfd929f0fdb058755b`. This verbatim snapshot is source material; preserve its distinction between required, proposed, deferred and conditional work. Historical progress entries are superseded by later entries and the interrupted-work section above.

<details>
<summary>Full source document</summary>

````markdown
# Sochestral V2 — Agent Implementation Guide

**Version:** 1.3 · **Updated:** 10 September 2026  
**Audience:** Coding agents and engineers  
**Companion:** `Sochestral-Product-Reference.md`  
**Purpose:** Read before implementing a feature. Establish the current baseline, preserve useful work, and follow the ordered transition below.

## A01. Authority, evidence, and how to use this guide

This guide consolidates the founder's conversation and two supplied coding-agent handovers. Its author did **not** directly inspect the current repositories. Reported file paths and behavior are investigation entry points, not independently verified facts. Reconcile them against the checked-out commits before editing.

The first handover was supplied as `Pasted markdown.md`; the second, titled “Sochestral V2 Planning — Evidence-Based Assessment,” was pasted into the conversation. They describe the same product feature baseline with a deeper second investigation. Their branch descriptions differ: the reports reference `main` at `a0d26e5`, working branch `cursor/setup-dev-environment-429b` at `6e6fd83`, and feature commit `a8c9981`. Record actual ancestry rather than assuming the newest-looking label is authoritative.

Decision labels used throughout:

- **Agreed:** Explicit direction established in the conversation.
- **Proposed:** Recommended implementation or product default; not a claim of founder approval.
- **Open:** Requires a concrete decision before the affected feature ships.
- **Verify:** Requires source, contract, or runtime evidence.

Follow the founder's current instructions and applicable repository instructions. This file does not authorize production migrations, live posts, payments, or deployments by itself. It does authorize no actions merely by being present. Work within the task the founder assigns.

At the beginning of a feature:

1. Read this guide and the relevant numbered section of the companion reference.
2. Record repositories, branch/commit, working-tree changes, and the phase already completed.
3. Inspect the existing implementation and dependencies; avoid rebuilding reusable components.
4. Identify the smallest reviewable change and its acceptance checks.
5. Resolve only decisions that genuinely block that change; continue independent local work.
6. At completion, report behavior changed, verification, limitations, and the next step. Update the project progress record without marking mocked integration behavior as live-verified.

## A02. Mission, scope, and invariants

**Mission:** Help business owners, founders, and creators turn their actual knowledge, products, and everyday work into consistent content in their own voice.

**Core experience:** Interview or delegate → researched plan document → comments and revisions → approve direction → generate finished content → review content → confirm accounts and dates → scheduling queue → publication when due.

### Agreed invariants

1. Users can delegate topic selection. A few interview questions help; supplying ideas is not a prerequisite.
2. Interpret intent, not a list of exact “skip” phrases. Partial answers remain useful.
3. A plan is a persistent, versioned artifact, not only chat prose.
4. Approving a strategy is distinct from approving finished content and authorizing scheduling.
5. Remove immediate publishing and full-access/trusted-autonomy modes from the product. All content execution must pass review and explicit schedule confirmation, regardless of role, mode, or delegated intent. Publish only through due-time scheduled delivery; no model tool, API route, UI control, or background generation path may bypass these gates.
6. Never invent customer stories, business milestones, personal experiences, prices, offers, or supporting sources.
7. Queued is not scheduled; scheduled is not published. Show confirmed outcomes and uncertainty accurately.
8. No arbitrary 30-post commercial ceiling. Separate planning horizon, total requested items, worker batch size, concurrency, provider quotas, and available spending.
9. Subscription access and AI credit balance are separate. No AI credit debit is needed to deliver already generated and scheduled content while service entitlement remains active.
10. Model changes cannot bypass permissions, approvals, validation, or spending limits.
11. Preserve existing users, drafts, media, and active schedules during migration.
12. Treat all content and retrieval as scoped to the authorized user/brand; never mix brands or tenants.

## A03. Reported baseline: keep, modify, investigate

| Area | Reported state | Direction |
| --- | --- | --- |
| Auth, sessions, MCP JWT, tenant helpers | Implemented; local tests reported | Keep; regression-check affected boundaries |
| PostgreSQL/Drizzle | 24 tables and 19 migrations reported | Extend through reviewed migrations |
| Chat transport | NDJSON progress and messages | Reuse; add persistent job progress/read-back |
| Brand context | Profile entries, voice bible, design brief | Reuse; unify chat and worker context |
| Review/drafts | Editing, revision counter, validation, publish attempts | Reuse primitives; add versioned approvals and schedule intent |
| Plans | Flat `conversation_content_plans` snapshot | Evolve into structured documents with versions/comments |
| Campaigns | One campaign row advancing through days | Separate durable generated items from scheduling operations |
| Calendar | Reads schedules from SocialMCP | Keep UI; add reconciled operation progress and explicit timezone |
| Models | Role-based environment configuration | Keep; replace name-based provider inference with explicit capabilities |
| Image credits | Monthly counters and jobs | Preserve history; migrate carefully to general usage accounting |
| Billing | Subscription/top-up/AI ledger absent in report | Add after usage measurement |
| SocialMCP | Subsequent supplied source inspection identifies `zayn-tech-info/all-social-mcp` at `8a6317a` | Fix scheduling replay and worker claiming; verify live behavior |
| Dead UI/code | Unwired chips, setup agent, abandoned thinking path reported | Confirm references and remove or finish intentionally |

Reported code locations: `packages/orchestration/src/service.ts`, `clerk-lock.ts`, `openai-model.ts`, `content-plan.ts`, `review.ts`, `publishing.ts`, `tools.ts`; `packages/api/src/campaign-worker.ts`, `campaign-day.ts`, `campaign-config.ts`, `calendar-routes.ts`, `image-service.ts`; `packages/database/src/schema.ts`, `campaign-job.ts`, `profile.ts`; and `web/`.

Reported local verification: database 67, auth 25, API 96 tests; web 172/173. Many API tests mock external services. Campaign tests reportedly cover shallow lifecycle/slot behavior, not booking outcomes. These counts are historical evidence, not current release gates.

### Do not inherit these unsupported conclusions

- Debug beacons around the Luna clerk do not prove the original failure's root cause.
- An empty public repository does not prove the correct private SocialMCP repository is unavailable.
- A localhost debug collector is not automatically malicious exfiltration. Inspect payloads, retain useful diagnostics safely, then remove obsolete instrumentation.
- A missing post in local bookkeeping may still appear in SocialMCP's calendar. The precise visibility depends on external read-back behavior.
- A 30-day schema limit is different from a 30-post limit; classify each before changing it.

## A04. Ordered delivery plan

Proceed in this sequence. A later phase may be designed while an external dependency is blocked, but do not claim its integration is complete. Relative scope is guidance, not a delivery-time promise.

| Phase | Outcome | Relative scope | Prerequisite |
| --- | --- | --- | --- |
| 0 | Reproducible baseline and execution contract | Small–medium | Correct product checkout; SocialMCP access pursued |
| 1 | Shared context and complete usage measurement | Medium | Baseline |
| 2 | Durable generated content and scheduling operations | Large | Verified contract for live completion |
| 3 | Interview, plan document, comments, approvals | Large | Item/version foundation |
| 4 | Correction memory and source inbox | Medium | Shared context and review events |
| 5 | Evaluated model routing and budget estimates | Medium | Usage data and representative workflows |
| 6 | Subscription, credit ledger, top-ups | Large | Accounting and entitlement decisions |
| 7 | Pilot verification and controlled transition | Medium | Core phases complete |
| 8 | Retention and expansion features | Incremental | Demonstrated weekly use |

### Phase 0 — Establish truth and reproduce the failures

1. Inspect `https://github.com/zayn-tech-info/all-social-mcp` and record the current commit and deployment relationships. The supplied inspection covered `main` at `8a6317ad1e8735954f5aae10ceb370a9e3eff390`; reconcile any newer changes.
2. Confirm test databases are isolated before any write-capable test. Preserve unrelated changes and production data.
3. Inspect the clerk-to-enqueue flow. Reproduce model errors, absent tool calls, invalid arguments, and valid delegated planning. Capture explicit error states instead of silently treating a failed planner as ordinary chat.
4. Exercise the actual campaign loop with a fake gateway: cap handling, partial success, timeout after remote success, malformed success response, no available slots today, worker crash/restart, and duplicate attempts.
5. Trace debug payloads and remove obsolete collectors after preserving sanitized diagnostic value. Replace needed diagnostics with structured operational events.
6. Resolve the calendar test failure through a targeted browser check; distinguish a test harness issue from broken drag-and-drop behavior.
7. Document the external scheduling contract: request shape, identifiers, idempotency scope and retention, validation, read-back, update/cancel, errors, statuses, credential expiry, media lifetime, rate limits, and due-time delivery ownership.
8. Add relevant checks to CI; the handover reports deploy-only CI. Do not expand unrelated test suites merely to raise counts.

**Acceptance:** Local tests reproduce or rule out each reported failure; current unknowns are explicit; there is an agreed execution contract or a clearly marked blocked integration. No root-cause claim based solely on debug locations.

### Phase 1 — Shared context and usage measurement

1. Introduce one context assembly service used by chat, plan generation, revisions, and background drafting. Inputs include authorized brand facts, voice preferences, current campaign, approved sources, recent content, and applicable corrections.
2. Store context provenance/version with generated artifacts. Select relevant facts rather than appending unlimited history. Reuse compiled voice/design material when unchanged.
3. Separate retrieval data from agent instructions. A website or uploaded file cannot grant publishing authority or change billing policy.
4. Record every model/tool operation, including workers and retries: operation ID, user/brand, parent job, role, provider, exact model, token categories when supplied, latency, tool charges, attempt, outcome, rate-card version, and estimated/actual cost status.
5. Distinguish internal cost from customer charge. Internal retry expense must remain visible even when it is not billable. Never fabricate usage when a provider omits it; mark unresolved estimates for reconciliation.
6. Add an explicit profile/brand IANA timezone with confirmation and browser-based initial suggestion. Display timezone on schedule confirmation and support daylight-saving transitions.

**Acceptance:** Chat and batch generation respect the same explicit brand preference; worker usage appears in accounting; usage retries are not duplicated; timezone survives device changes.

### Phase 2 — Durable content and reliable scheduling

Preserve the lease/claim pattern if suitable. Do not add a new queue technology without a demonstrated need.

1. Save each generated content revision and media association before attempting scheduling. Restarting scheduling must not regenerate approved captions.
2. Introduce separate records for content items, platform/account variants, scheduling operations, and attempts. One content idea can have multiple destination deliveries.
3. Generate scheduling operations only from approved content and confirmed schedule intent. Store content revision, destination, UTC instant, displayed timezone, and a stable logical operation identifier.
4. Use bounded concurrency and configurable operational limits. Accept a larger campaign and partition work; do not silently truncate it. If a request cannot be accepted, explain the real constraint before execution.
5. Validate external success against the verified contract; missing `ok` is not sufficient proof. Save the external schedule identifier and receipt.
6. On timeout with possible remote success, enter `outcome_unknown`, then query by operation/idempotency key or use a verified safe replay. Do not blindly create another schedule or mislabel the first as definitely failed.
7. Retry recoverable failures with bounded backoff and jitter. Reconnect-required or invalid-media failures need user action. A healthy item's progress must not discard unsuccessful siblings.
8. Keep no-slot days distinct from failed campaigns. Propose the next valid slot; never silently move an approved date or publish immediately because its time passed.
9. Support cancellation of pending operations separately from cancellation of confirmed remote schedules. Surface cancellation uncertainty and races with publication.
10. Reconcile delivery outcomes from SocialMCP. Product records describe intent and operation progress; external confirmed receipts describe remote scheduling/publication. Avoid two competing schedule authorities.
11. Handle media availability through the publication date. Short-lived preview URLs must not become the only delivery asset reference.
12. Migrate incrementally: stop routing new work to the legacy path behind a controlled flag, drain or explicitly transition active legacy campaigns, retain external IDs, and prevent dual workers from booking the same logical item.

**Proposed operation states:** queued, scheduling, scheduled, outcome_unknown, needs_attention, canceled. Track publication separately: pending, publishing, published, failed, unknown, canceled. A displayed label may summarize these, but persistence must preserve the distinction.

**Acceptance:** 20/50/100-destination harness cases with per-item receipts; crash and timeout recovery without duplicates; only failed recoverable operations retried; cancellation does not report success prematurely; no arbitrary 30 truncation. Live integration requires a separately authorized controlled test, not just mocks.

### Phase 3 — Interview and interactive plan/review

1. Replace the mandatory-ideas rule. Ask usually two or three useful questions based on missing context: goal, current news/assets, and desired direction. Do not repeat known onboarding questions.
2. Support answered, partially answered, delegated, and clarification-needed outcomes. Model inference can interpret language; code validates the structured next action. Failure to classify must be visible and recoverable.
3. When delegated, research relevant material and retain structured sources: URL, title, retrieval date, supporting excerpt/summary, and linked claim. If research fails, clearly offer a plan using existing verified context; do not claim research occurred.
4. Create the document schema described in A05 and a spacious responsive viewer. Desktop may use a modal or panel; mobile must allow full-screen reading and easy touch commenting.
5. Render sections, calendar tables, callouts, and status using application components. The model produces validated content structure, not arbitrary executable HTML or per-document CSS.
6. Persist comments immediately. A highlighted selection uses block identity plus text quote/context, version, and optional range; a block-only comment remains possible.
7. “Review comments” processes a submitted set. If a new comment arrives during revision, retain it as pending. Reject stale overwrites through optimistic concurrency.
8. Revise the same document identity into a new immutable version. Preserve unchanged IDs, record changed sections and handled comment IDs, and flag ambiguous feedback. Removed anchors become “needs reattachment,” not silently resolved.
9. “Approve plan” approves direction only. “Create content” runs durable generation jobs from that approved version. Show captions, platform variants, assets, and outstanding inputs.
10. Reuse the existing draft preview/editing primitives for content review. Missing required media or unresolved factual placeholders prevent that item from scheduling; ready items may proceed if the user selects them explicitly.
11. “Schedule” opens date/account/timezone review. “Confirm schedule” binds the exact selected revisions and times to scheduling operations. Server-side checks enforce every gate regardless of UI or model behavior.
12. Edits to approved unscheduled content invalidate the affected approval. Edits to scheduled content create a proposed revision; apply only through a supported remote update or verified replacement workflow. The UI must distinguish the live scheduled revision from the new draft.

**Acceptance:** Delegation paraphrases work; partial interview answers are retained; comments survive refresh/revision; two concurrent revisions do not lose work; approval cannot be reused for changed content; scheduling cannot bypass content/date confirmation; long plans remain navigable.

### Phase 4 — Useful memory and source material

1. Extend existing profile entries where appropriate rather than creating redundant memory stores. Store scope (brand/campaign/item), source, timestamps, status, and expiry where relevant.
2. Save an explicit instruction such as “Always keep my openings short” as an editable durable preference. Do not add a second approval click merely because it is memory; the instruction itself is explicit intent.
3. Treat inferred patterns from edits as proposed preferences. A single rewrite is not automatically a permanent rule. Provide correction and removal in the memory UI.
4. Start a source inbox with text, links, images, and voice-note transcription. Link extracted facts/angles back to source material. Let users fix transcripts, remove material, and exclude sensitive or outdated information.
5. Maintain a scoped post/angle history. Begin with reliable text/topic comparisons; add semantic retrieval only if measured repetition warrants it.
6. Track missing assets and unverified claims as work to complete. Do not convert a suggested idea into an assertion about the business.

**Acceptance:** Permanent and one-time edits behave differently; expired offers do not reappear; removed context is excluded from future generation and compiled memory is refreshed; source provenance remains inspectable.

### Phase 5 — Model evaluation and budgets

1. Replace `name.includes('gpt-')` client selection with explicit provider, endpoint, API shape, capabilities, model ID, and role configuration. Validate supported tools/structured output and timeout behavior.
2. Evaluate candidate Thesean Sonnet/Terra everyday models, Luna extraction tasks, and direct OpenAI Astra strategy tasks. These are candidates, not immutable dependencies. Do not assume Thesean serves Astra or discounts it.
3. Preserve the same approved brief, facts, and corrections across model handoffs. A lighter drafting model cannot reinterpret approved strategy or authority.
4. Build a representative evaluation set across founders, businesses, and creators: interviews, delegated plans, localized voice, conflicting comments, missing facts, long campaigns, and tool failures.
5. Score factuality, voice match, usefulness, repetition, correction handling, tool reliability, time, and total cost to approved content. Include human review; a model grading itself is insufficient.
6. Offer Standard/Advanced independently of Plan/Agent workflow if evaluation supports it. Respect the user's selected budget and quality; do not silently downgrade paid work or escalate costs. Offer alternatives when funds are insufficient.
7. Estimate task cost using measured operations, include a maximum spend authorization, and pause safely before exceeding it. Reserve room for active calls; estimates alone are not enforcement.

**Acceptance:** Role routing is explicit; evaluation results explain the chosen default; background cost is included; no provider fallback changes spending/quality commitments silently.

### Phase 6 — Subscription and shared AI credits

Implement A07 using Paddle and the working pricing configuration below. Deferred commercial policies must remain configurable or disabled; they do not block independent implementation. Preserve existing image usage history and define any beta allowance conversion; never invent purchased balances.

**Acceptance:** Concurrent tasks cannot overspend; repeated payment notifications cannot double-credit; successful work and released reservations reconcile; unknown provider outcomes remain pending; zero AI balance does not stop completed scheduled delivery during active entitlement.

### Phase 7 — Pilot and migration completion

1. Pilot with a small set of users who manage their own content. Verify first approved plan, first scheduled batch, and return usage.
2. Run controlled end-to-end delivery tests only on authorized accounts and content. Verify reconnect, failure reporting, media lifetime, timezone, and duplicate-safe recovery.
3. Remove conflicting legacy routes only after new routing is stable and active work has drained. Rollback disables new entry paths while preserving workers needed by already-created operations.
4. Resolve login recovery/onboarding gaps appropriate to the release: invitation provisioning may serve a closed beta; public self-service needs a functioning acquisition and account-recovery path. Do not confuse placeholder removal with removing the underlying user need.
5. Publish accurate capabilities and limits. Do not advertise future platforms, learning behavior, or delivery guarantees as implemented.

**Acceptance:** No orphaned campaigns; legacy/new workers do not duplicate work; representative users complete the workflow; billing and delivered capability agree.

### Phase 8 — Earn expansion through usage

Proposed additions, in order to validate rather than all at once: reusable visual templates; optional weekly check-ins; selected source integrations; performance-informed planning; more brands/accounts; team review; further platform formats. Validate platform API access and demand before promising an integration. Delay large video-generation and autonomous engagement systems until core retention is demonstrated.

## A05. Proposed durable data boundaries

Choose final names after schema inspection. These are responsibilities, not a mandate to create one table per row.

| Entity | Required responsibility |
| --- | --- |
| Brand/context | Explicit owner and scope; map current user profile without losing isolation |
| Source | Original reference, extracted facts, permissions, freshness, deletion state |
| Plan | Stable document identity, owner, campaign, current version |
| Plan version | Immutable validated structure, parent version, source/context references |
| Block/item | Stable identity across revisions; structured table cells/items where needed |
| Comment | Version/block anchor, selected quote, thread, status, submitted revision batch |
| Approval | Actor, exact version/revision, scope, timestamp, invalidation reason |
| Content revision | Caption, destination variant, assets, source/plan lineage |
| Schedule operation | Approved revision, destination, time, idempotency key, external ID, state |
| Attempt | Request correlation, outcome, sanitized error, retry/reconciliation details |
| Usage event | Internal measured expense and separately determined customer charge |
| Ledger/reservation | Idempotent balance movements and outstanding commitments |

Launch with one brand per user, reusing the existing user-owned business profile and preserving tenant isolation. Do not build brand switching or multiple-brand management for this release. Document a backward-compatible ownership mapping so multiple brands can be considered after launch without mixing existing context or losing data. A one-brand limit does not imply a one-connected-account limit; connected-account entitlements remain deferred.

## A06. Interface and behavior contract

Plan sections: goal; audience/voice; direction and themes; proposed calendar; sources/assumptions; missing inputs. Each calendar item has a stable ID, angle, intended audience, format, destination, proposed time, and asset needs.

Use strong headings, restrained brand colors, secondary labels, comfortable body text, and readable tables. Status cannot depend on color alone. Support keyboard focus, accessible modal dismissal, mobile navigation, and touch-friendly commenting.

Progress labels describe real actions: checking brand context, retrieving sources, drafting plan, applying comments, creating content, scheduling items. Do not invent progress or expose private reasoning. Persist enough state to resume viewing a background job after refresh; rerunning generation is not a refresh mechanism.

Large batches show aggregate counts and filtered items. “27 scheduled, 11 queued, 2 need attention” must derive from persisted states. Publish confirmation includes an external receipt or URL where available. Incomplete/unknown status remains visible.

## A07. Billing implementation contract

**Working launch decision:** Paddle payments; Starter $15/month with 1,000 AI credits; Plus $35/month with 3,000 AI credits. Optional top-ups: $5/400, $10/800, $25/2,000 credits. Validate unit economics before paid launch. Credit expiry, cancellation terms, trial allowance, and multi-brand entitlements are deferred, not approved defaults.

Chargeable candidates: interviews/model turns, research, planning, AI revisions, generation, brand analysis, transcription, and generated imagery. Manual comments, viewing, direct edits, and ordinary scheduling are included within active service entitlement. Exact rates require measurement.

Use an append-only ledger or equivalently auditable transaction model. Distinguish grants/purchases, reservations, settlements, releases, and refunds. Represent currency/credits in fixed-precision units, not floating-point arithmetic. A balance mutation must be atomic with its idempotency record.

Reserve before enqueueing paid work. Settle completed billable operations once; release unused reservations. Cancellation stops future work but may leave authorized completed work billable. Do not debit credits again for system-caused retries. An unknown charge/outcome must be reconciled rather than immediately refunded and retried.

Verify payment signatures, amounts, currency, purchase identity, and server-side product mapping. Deduplicate both provider notifications and the underlying payment fulfillment. Never grant credits from a browser success redirect alone. Handle refunds and disputes through auditable policy.

Keep entitlement separate from balance. Define what happens on subscription cancellation, payment failure, and grace-period expiry before launch; do not promise indefinite free hosting of schedules. Show affected future schedules before service ends. Auto-top-up is optional, explicitly enabled, and capped by the user.

## A08. Decisions and verification gates

| ID | Item | State | When needed |
| --- | --- | --- | --- |
| D01 | SocialMCP repository identified; source contract supplied | Verify behavior and fixes | Before claiming live queue reliability |
| D02 | Retire legacy immediate publishing/trusted autonomy | Agreed: remove immediate publishing and full-access modes; require review and schedule confirmation for all content execution | Implement during routing migration |
| D03 | Multiple brands at V2 launch | Agreed: one brand per user; multiple brands deferred until after launch | Preserve current user ownership during schema work |
| D04 | Paddle; USD working prices and allowances selected; expiry deferred | Implement configurable catalog; verify economics | Before paid checkout |
| D05 | Model defaults and Advanced pricing | Evaluate | Before customer cost promises |
| D06 | Operational rates/concurrency | Engineering proposal based on contracts/load | Before large-batch rollout |
| D07 | Subscription lapse and future schedules | Open | Before accepting paid subscriptions |
| D08 | Tone matching | Agreed direction; revise legacy formal rules | During prompt/context work |
| D09 | New platform/format support | Verify per connector | Before marketing or release |

## A09. Completion record template

For each feature record: phase/section; commits and migrations; user outcome; what was reused; tests and environment; external behavior verified versus mocked; active-job migration/rollback; remaining decisions; next feature. Update both documents when a product decision changes. Keep this guide as the implementation reference and the companion as the founder-facing statement of intent.

## A10. Provider references carried from the planning discussion

Availability and pricing are time-sensitive; verify again during implementation. These pages support candidate selection, not measured superiority on Sochestral tasks.

- [Thesean Ship](https://www.thesean.ai/blog/introducing-ship)
- [Thesean model catalog](https://docs.thesean.ai/api-reference/models)
- [OpenAI model guidance](https://developers.openai.com/api/docs/models)
- [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)

**First assigned implementation should be Phase 0 across both identified repositories.** Continue independent work if environment access is blocked. Source-inspection findings are not live verification.


## A11. SocialMCP integration addendum — source inspection supplied 10 September

This supersedes earlier uncertainty about repository identity. Source: supplied `Pasted markdown(1).md`; no new audit or tests were performed by the document author.

- Repository: [all-social-mcp](https://github.com/zayn-tech-info/all-social-mcp). Local developer path: `/home/zayntechinfo/work/projects/all-social-mcp`; product sibling: `/home/zayntechinfo/work/projects/sochestral`. These paths are not assumed to exist in another agent environment.
- Reported runtime: Fly app `all-social-mcp`, SQLite on a persistent `/data` volume, HTTP MCP through `POST /mcp`, and a 15-second polling worker. Use SQLite-compatible atomic transactions/conditional updates for claims; do not copy PostgreSQL `FOR UPDATE` syntax into this service.
- JWT `sub` supplies user identity. Destination account IDs must be explicit when ambiguous. Preserve tenant checks and encrypted token storage.
- Tools: `schedule_post`, `get_scheduled_posts`, `get_post_status`, `reschedule_scheduled_post`, `update_scheduled_post_content`, `cancel_scheduled_post`. Mutations require `confirm: true` or a non-writing `dryRun: true`. Only pass confirmation after product authorization.
- Creation accepts an explicit UTC `scheduledAt`; rescheduling uses `publishAt`. The supplied IANA timezone is stored but not converted by the service. Product-side conversion is required.
- Creation returns `postId` and `scheduled[].id`. Persist destination-specific receipts. Status comes from schedule rows and publish logs; parent `posts.status` reportedly remains stale.

### Required fixes in SocialMCP before dependable batch rollout

1. Replace global key hashing with tenant-scoped scheduling idempotency and a request fingerprint. Same logical request returns the existing receipt; changed payload returns a defined conflict. Preserve legacy keys/rows during migration and provide exact-key lookup, avoiding reliance on unbounded list scans.
2. Make multi-destination inserts transactional or expose explicit per-destination outcomes. A partial call must not be presented as all-or-nothing success.
3. Prevent overlapping ticks; atomically claim due work with a durable attempt and lease. Expired leases must reconcile uncertain external execution before another publish attempt. A mutex alone cannot solve crash-after-platform-success duplication.
4. Preserve platform container/post identifiers as soon as available. Resume polling an existing container after timeout where supported. If publication cannot be established safely, expose an unknown/manual-review state; do not promise exactly-once delivery without platform support.
5. Coordinate cancel, edit, and reschedule with worker state. Never mark an already published row canceled as though the remote post disappeared. Revalidate edited media/content. Distinguish cancel-requested from confirmed canceled where necessary.
6. Add bounded status pagination/date filters and consistent error/status contracts. Poll from Sochestral initially; existing platform webhooks are not schedule-lifecycle notifications to the product.
7. Preserve original scheduled time separately from operational retries. Keep media reachable through platform fetch/processing. Test credential expiry and reconnect behavior.

**Required tests:** tenant key collisions; same-key replay and changed-payload conflict; timeout after insert; two overlapping ticks/workers; crash after remote acceptance; cancel during claim/publication; partial platform insert; invalid scheduled edit; media container timeout. Existing unit tests and old smoke dates do not establish present live correctness.

### Capability-driven UI

Reported adapter support at the inspected commit: Threads text/images/carousels up to 20/video; LinkedIn Personal text/link, one image or one video, no carousel; Instagram media-required image/video/reels/carousel up to 10/stories. Validate against current adapter and official platform requirements before release. Fix the earlier product-side LinkedIn multi-image allowance mismatch. Derive format controls from a shared capability contract; do not advertise stubbed Facebook/X/TikTok/Discord/Reddit connectors as functional. Query current platform limits where supported rather than freezing quota numbers from the handover.

## A12. UI specification — required implementation and release scope

The founder supplied desktop screenshots on 10 September. They establish a visual baseline, not proof of functional or mobile behavior. Preserve the pink identity, rounded surfaces, and central composer while consolidating layout and components.

| Surface | Required change |
| --- | --- |
| Global shell | Compact useful header; consistent alignment and spacing; collapsible labeled navigation |
| Navigation | Workspace, Content, Calendar, Brand; settings for accounts, appearance, billing. Calendar/List are views of the same scheduling area |
| Workspace | Preserve central starting composer; open persistent plan/preview panel beside active chat; expand document to full width |
| Plan viewer | Title/status/version, section navigation, comments, change summary, stage-appropriate primary action |
| Post editor | Desktop two columns: content/assets/date controls and live preview. One save action with truthful partial-error reporting |
| Calendar | Caption snippets, recognizable handles/platform, timezone, full-week navigation, agenda/list alternative, attention filter |
| Connected accounts | One unified list rather than duplicated platform cards and table; connect/reconnect actions and human-readable identity |
| Memory | Editable Brand facts, Voice, Preferences, Current priorities; raw compiled prompt is not the main user interface |
| Onboarding | Same theme as workspace; short description accepted; optional enrichment; replace skills questionnaire with help-needed choices |
| Login | Service failure shown at form level; field errors only for invalid input; no secrets or technical infrastructure details in copy |

**Tokens:** one configurable accent with derived hover/selected/focus/tint shades; neutral surfaces; separate semantic error/warning/success colors. Pink is the default; extract the exact existing token from source rather than guessing from screenshots. Store appearance per user, with preset/custom accent and light/dark/system choices. Workspace accent never changes generated brand colors. Use solid primary actions, restrained shadows/gradients, accessible text contrast, and no color-only status cues.

**Starting dimensions:** body/document text 16px; controls/secondary 14px; small labels 12px sparingly; page headings 28–32px; spacing scale 4/8/12/16/24/32px. Touch targets aim for at least 44px. Keep existing font if readable; verify sizing and weight rather than replacing it without reason.

**Responsive contract:** large desktop allows navigation/chat/document; medium screens collapse navigation and switch or resize panels; phones use one main surface with Chat/Plan switch, full-screen documents, bottom-sheet comments, agenda calendar, stacked editor with Preview tab, collapsible filters, safe-area-aware actions, and keyboard-aware composer. Preserve unsent text and scroll position. No essential action depends on hover, dragging, or precise text selection.

**UI acceptance:** inspect at 360, 390, 768, 1024, and 1440 CSS pixels; no unintended page overflow or obscured actions; light/dark/custom accent states; keyboard focus and modal restoration; reduced-motion support; loading/empty/partial/unknown/reconnect/low-balance states. Show all seven days through a clear responsive navigation strategy. Verify actual browser flows and screenshots. The new design must be implemented and included in the release, not delivered only as mockups; deployment still follows the founder's authorized release workflow.

## A13. Working commercial configuration and deferred decisions

| SKU | Price in USD | Credits |
| --- | ---: | ---: |
| Starter monthly | 15 | 1,000 |
| Plus monthly | 35 | 3,000 |
| Top-up small | 5 | 400 |
| Top-up medium | 10 | 800 |
| Top-up large | 25 | 2,000 |

Provisional internal conversion: one credit corresponds to $0.003 of eligible provider expense. This budgets approximately $3 and $9 of provider expense for the included plan allowances, before hosting, Paddle fees, storage, support, taxes where applicable, and profit. It is a configurable costing assumption, not a measured cost per post or guaranteed margin. Use fixed precision, track fractional usage, and avoid rounding every low-cost call up to a whole credit. Estimate substantial tasks and enforce the approved ceiling.

Both plans retain core planning/review/memory and Standard/Advanced choices; Advanced consumes more according to measured expense. Scheduling finished content has no AI debit within active service scope. Measure all tool/media/worker usage, not only visible chat tokens. Price IDs, rate cards, and entitlements must be server-controlled and configurable. Use Paddle sandbox for development; live paid launch requires correct catalog mapping, signatures, idempotent fulfillment, and verified economics.

The founder explicitly deferred the proposed 7-day/150-credit trial, three-account allowance, rollover/expiry rules, active-subscription requirement for using purchased credits, auto-top-up policy, cancellation/grace behavior, upgrade/downgrade details, and refunds. None are approved defaults. Retain policy seams and disable unavailable actions where needed. They must not stop design, core scheduling, metering, or sandbox checkout development. Resolve any policy required for a live paid promise at that release gate rather than inventing terms now.

**Revision 1.1:** incorporates the correct execution repository, delivery fixes, supplied UI screenshots, responsive/custom-color requirements, Paddle selection, two working plans/top-ups, and explicit deferral of remaining policies.

## A14. Confirmed scheduling-only decision — 10 September

The founder resolved the legacy publishing decision: remove immediate publishing and the idea and implementation of full access/trusted autonomy entirely from Sochestral. The product plans content, generates ideas and finished posts, supports review, and schedules approved work for publication when due.

Implementation acceptance:

- Remove full-access controls, settings, entitlement checks, prompts, and agent tooling that enable review bypass or direct publication. Remove obsolete product immediate-publish routes and calls after safe transition.
- Enforce content review and schedule confirmation server-side for every content execution path, including one-post requests, campaigns, and privileged users. An instruction to “publish now” must lead into the review/scheduling workflow rather than direct platform execution. Do not simulate immediate publishing by silently creating a schedule for the current instant.
- Keep planning delegation, content generation, visible previews, and persisted scheduling progress. The decision removes approval bypasses, not the agent's ability to help plan and draft.
- Preserve due-time platform publication inside SocialMCP's delivery worker. That internal delivery operation is necessary for scheduling and is distinct from exposing an immediate-publish action to the user or agent.
- Preserve existing confirmed schedules and receipts. Inspect active legacy campaigns and their approval evidence; work lacking the required review must enter review or be paused for explicit transition rather than inheriting full-access permission.
- Test direct API/tool bypass attempts, removed permission modes, campaign paths, stale approvals, and due-time delivery. No privilege or workflow mode can skip review.

This records an approved product direction. Code removal, migrations, and verification have not been performed by updating this guide. Brand count is resolved below; deferred commercial policies remain unresolved.

**Revision 1.2:** resolves D02 and companion P15/D05; adds scheduling-only removal and migration acceptance.

## A15. Confirmed single-brand launch scope — 10 September

The founder chose one brand per user for now. Multiple-brand support may be considered after launch. Reuse existing user-owned brand/profile primitives; keep facts, voice, sources, plans, media, and content scoped to that user’s brand. No brand switcher or multi-brand management is required for V2 launch. Preserve a clear ownership mapping for possible future migration. Connected-social-account limits and other deferred commercial policies are unchanged.

**Revision 1.3:** resolves D03 and companion P15/D11. This records launch scope; implementation remains outstanding.
````

</details>

## Appendix F. Repository assessment — historical source

Source: `/home/zayntechinfo/work/projects/sochestral/docs/v2/Repository-Assessment.md`. SHA-256: `874ae79d775bce31a37e0c5d1940b5c713934053b0ee6d5947a8707341346e5c`. This verbatim snapshot is source material; preserve its distinction between required, proposed, deferred and conditional work. Historical progress entries are superseded by later entries and the interrupted-work section above.

<details>
<summary>Full source document</summary>

````markdown
# V2 repository assessment

Date: 10 September 2026. Scope: read both supplied v1.1 documents, inspect both local repositories, preserve the references, and identify implementation questions. This is source inspection, not completed Phase 0 or live verification. No application code, migrations, deployments, or live delivery were changed or exercised. No test suites were run in this preparation pass.

## Reference files and authority

- `Sochestral-Product-Reference.md`: product outcomes, agreed direction, proposals, and deferred policies.
- `Sochestral-Agent-Implementation-Guide.md`: phased implementation and acceptance criteria.
- Both files were initially copied unchanged from `/home/zayntechinfo/` into `docs/v2/` in both repositories. Repository copies are now v1.3 with the founder’s scheduling-only and one-brand-per-user decisions; original input files remain unchanged.
- The founder's current request is preparation and copying. Instructions inside the documents do not independently start implementation or authorize production actions.
- The founder identifies these documents as the basis for future work. Their agreed V2 direction differs from legacy scope, pricing, and autonomy descriptions. Proposed and open decisions remain distinct from agreed requirements.

## Baseline

| Repository | Branch / inspected commit | Responsibility |
| --- | --- | --- |
| `/home/zayntechinfo/work/projects/sochestral` | `main` / `a8c9981` | Next.js/React web, Hono API, PostgreSQL/Drizzle, auth, orchestration, drafts, brand context, media, campaign generation |
| `/home/zayntechinfo/work/projects/all-social-mcp` | `main` / `8a6317a` | OAuth/account tokens, HTTP/stdio MCP, SQLite/Drizzle, adapter validation, scheduling and due-time publication |

Both working trees were clean before reference copies. Product `web/` uses its own npm project; backend packages use pnpm. SocialMCP requires Node 22 and supplies a wrapper. Product Fly configs name `sochestral` and `sochestral-api`; execution config names `all-social-mcp` with SQLite under `/data`. These are checked-in deployment settings, not proof of the currently running deployment. Product repository instructions identify Neon as production PostgreSQL.

## Understanding of the destination

Interview or delegate → persistent plan → comments/revisions → approve direction → generate finished posts → review content → confirm destinations, dates, and timezone → durable scheduling → publication when due.

Strategy approval, content approval, and scheduling authorization have distinct scopes. Generated content must survive retries without being regenerated. Delivery states and uncertainty must be based on persisted receipts. Brand voice should follow the user, with facts and source provenance preserved. Existing users, drafts, media, and active schedules must survive the transition.

The core includes the implemented responsive UI, accessible plan commenting, appearance preferences, source/correction memory, usage accounting, and configurable Paddle sandbox billing. Working prices are Starter $15/1,000 credits and Plus $35/3,000 credits, with the documented working top-ups. Model candidates require evaluation; commercial policies explicitly deferred in the documents remain unset. Phase 8 expansion is proposed and conditional on usage, not an unconditional first-release checklist.

## Existing pieces to reuse

| Area | Evidence and reuse |
| --- | --- |
| Auth/tenancy | Product `packages/api/src/app.ts`, `packages/auth/src/`, and database ownership helpers; SocialMCP user-scoped tools and connected-account ownership checks |
| Chat and review | Product orchestration service, review services/routes, NDJSON transport, draft/media schema, chat workspace and platform previews |
| Brand memory | `packages/database/src/profile.ts`, voice bible/design brief storage and compilers; editable memory UI already supports adding, editing, deleting entries |
| Jobs | Product campaign claim/reclaim helpers and image workers; retain useful mechanisms while introducing per-item content and delivery records |
| UI | `web/src/components/workspace/` shell/navigation/panels; calendar, scheduled list, editor, account picker, onboarding, and media components |
| Delivery | SocialMCP scheduling/status/edit/cancel tools, adapters for Threads/Instagram/LinkedIn Personal, encrypted credentials, retries, and publish logs |

## Source-confirmed gaps

1. **Planning and delegation:** product `packages/orchestration/src/service.ts` explicitly requires ideas before ordinary multi-post planning. It also has direct scheduling/autonomy paths. `clerk-lock.ts` returns null for missing tool calls, invalid output, or exceptions, and contains localhost debug collectors. Reproduce each failure before assigning the historical root cause.
2. **Plan persistence:** `conversation_content_plans` in the product schema is a mutable flat snapshot. It does not provide the required immutable document versions, stable blocks, anchored comments, and scoped version approvals.
3. **Generation and approval:** `packages/orchestration/src/campaign-day.ts` generates captions and immediately calls `schedule_post` with confirmation. It does not persist each finished revision for the new review workflow before submission.
4. **Receipt handling and partial completion:** that loop treats missing `ok` as success, records booked times/counts rather than destination receipts, and advances the day after partial success. Timeouts are counted as failures without unknown-outcome reconciliation. No-slot days enter the retry/failure path.
5. **Limits:** the 30-post cap exists in runtime configuration, enqueue logic, and a database check; a separate 30-day plan horizon check also exists. These must be classified separately and replaced with appropriate operational controls.
6. **Shared context:** campaign generation explicitly reads the plan and voice bible, while chat assembles broader context. Shared context/provenance and complete worker usage accounting need deliberate implementation.
7. **Execution idempotency:** SocialMCP `apps/mcp-server/src/tools/service.ts` hashes explicit scheduling keys with platform only, backed by a global unique index. Scheduling inserts the parent and variants before each schedule row without a surrounding transaction or existing-receipt replay. A duplicate-key error is not a successful idempotent replay.
8. **Execution worker:** `apps/worker/src/index.ts` uses an async `setInterval` tick; `process-due.ts` selects scheduled rows and publishes without an atomic claim/lease. Platform results are logged after adapter completion. Overlap and crash-after-acceptance need reproductions and durable recovery design.
9. **Cancel/edit races:** cancellation can set any existing owned row to canceled, including published rows. Edit/reschedule check a previously read status but do not coordinate with worker claims. Content editing does not rerun adapter validation.
10. **Status access:** scheduled-list reads load all tenant rows and filter in memory, without bounded pagination/date filtering or exact scheduling-key lookup. Existing `originalPublishAt` support should be preserved and clarified for intentional rescheduling versus retry timing.
11. **Capability mismatch:** product `platform-media-limits.ts` allows 20 LinkedIn images; SocialMCP's LinkedIn adapter defines `LINKEDIN_MAX_MEDIA_ITEMS = 1`. UI controls should consume a shared capability contract.
12. **UI/onboarding:** existing components are useful, but document review and the full V2 appearance/responsive workflow require implementation. Onboarding currently enforces a 30-word description and asks about skills. Product CSS contains several theme scopes; one existing pink primary is `#f211b6`, and final token consolidation must inspect the active workspace theme.
13. **Billing:** the inspected schema has image wallets/jobs, but no V2 subscription/shared AI ledger tables; registered API routes have no Paddle billing integration. Preserve usage history when adding the new system.
14. **CI and worker availability:** both checked-in GitHub workflows deploy without a test gate. Product API Fly settings allow stopping with zero minimum machines, while campaign work runs inside the API process; verify actual machine settings and background-job liveness before promising unattended generation.

## Conflicting legacy context

`sochestral-master-plan.md` still describes Starter/Pro/Agency, image caps, regional pricing, and Paystack plus Paddle. Existing scope and root instructions describe a business-strict audience and trusted autonomy. The new reference describes business owners/founders/creators, user-matching voice, Starter/Plus shared credits, and a review-first scheduling core. These legacy records should be reconciled when implementation begins; they were not rewritten during this preparation task.

## Decisions requested

1. **Resolved:** one brand per user at launch. Reuse existing user-owned brand/profile context and preserve tenant isolation. Multiple brands may be considered after launch; brand switching is outside current scope. This does not determine connected-account limits. See guide A15.
2. **Resolved:** remove immediate publishing and full-access/trusted-autonomy concepts and implementation. Every content execution path requires review and schedule confirmation. Preserve confirmed schedules; transition active legacy work without carrying forward approval bypasses. See guide A14. Code changes remain outstanding.

These questions do not block baseline reproduction. Trial, expiry, rollover, subscription-lapse behavior, refunds, and other deferred commercial policies should be resolved only when their release gate requires them.

## Next implementation boundary

Begin Phase 0 with isolated test configuration, targeted clerk and actual campaign-loop harnesses, and SocialMCP replay/claim/cancellation reproductions. Record a precise cross-repository contract and add relevant CI checks. Existing campaign-day tests cover slot placement and display helpers rather than the full booking loop. Historical test counts and a reported calendar failure must be rerun before they become current evidence.

Then follow the guide's ordered foundations: shared context/accounting; durable content and delivery; versioned plans/comments/approval UI; correction memory/source inbox; measured model routing/budgets; Paddle sandbox/shared credits; controlled pilot and transition. Browser acceptance remains required at 360, 390, 768, 1024, and 1440 CSS pixels. Live delivery, provider availability/economics, media lifetime, credential expiry, and current cloud data remain unverified in this assessment.
````

</details>

## Appendix G. Execution contract — implemented local contract

Source: `/home/zayntechinfo/work/projects/sochestral/docs/v2/Execution-Contract.md`. SHA-256: `8fab238cb211e7f6b70af76cce862b7c99f3d0dc499fb1b5f73e62ec9156c00a`. This verbatim snapshot is source material; preserve its distinction between required, proposed, deferred and conditional work. Historical progress entries are superseded by later entries and the interrupted-work section above.

<details>
<summary>Full source document</summary>

````markdown
# V2 execution contract

10 September 2026. Local implementation on `codex/sochestral-v2`. Production behavior is not yet verified.

## Ownership

Sochestral owns user brand context, source provenance, generated revisions, review, schedule confirmation, timezone conversion, credits and submission progress. SocialMCP owns account tokens, schedule receipts and publication when due. JWT `sub` identifies the tenant. One user currently owns one brand. Accounts remain separately identified.

## Scheduling

`schedule_post` accepts `platforms`, explicit destination account IDs, finished text and options/media, UTC `scheduledAt`, display IANA `timezone`, and a stable `idempotencyKey`. It requires `confirm: true` or a nonwriting `dryRun: true`. The product must supply confirmation only after the exact content revision, account and instant have been approved. The execution service does not infer timezone conversion.

Successful creation returns `{ ok: true, postId, scheduled: [{ id, postVariantId, platform, connectedAccountId, publishAt, status }] }`. Store every destination receipt. Creation and receipt persistence occur in one SQLite immediate transaction. An insert failure rolls back parent, variants, schedules and request receipt.

New request keys are scoped to the tenant. Same key and canonical request fingerprint return the original receipt with `replayed: true`, including when the original date is now past. A changed payload returns `IDEMPOTENCY_CONFLICT`. JSON object field order and platform order do not alter the fingerprint; content, media, destination and instant do. Confirmation flags are not content. Explicit keys and receipts are retained with the user; no expiry policy is invented.

`get_schedule_request { idempotencyKey }` returns `{ ok: true, found, receipt }` for exact tenant scoped lookup. A missing receipt means no committed V2 request was found. Legacy rows and hashes are preserved. A matching legacy hash returns `LEGACY_SCHEDULE_REQUIRES_REVIEW` rather than creating a duplicate without trustworthy fingerprint evidence. Legacy keys were global hashes of key plus platform; new keys include tenant and destination. Never claim legacy behavior was exactly once.

## Status and pagination

`get_scheduled_posts` accepts platform/status, inclusive `from` and `to` instants, `limit` (1 to 500, default 100) and opaque `cursor`. It returns `scheduled` and nullable `nextCursor`, ordered by row ID. Tenant and date filters execute in SQL. The product follows every cursor and rejects repeated/invalid cursors. `get_post_status` reads owned schedules and publish logs. Parent post status is not delivery authority.

Delivery states include `scheduled`, `publishing`, `published`, `failed`, `cancelled`, and `outcome_unknown`. Product labels include Scheduled, Publishing, Done, Failed, Canceled, and Checking status. Unknown states never appear as confirmed Scheduled. The initial scheduling receipt remains the receipt of creation; read current status separately.

## Worker and recovery

The worker fetches at most 25 due rows per tick. A conditional database update claims each row with a random token, five minute lease and durable attempt count. Competing connections cannot claim the same row. The process tick also avoids overlapping intervals.

Before provider submission, an attempt is stored in publish logs. Trusted adapter callbacks save parent media container IDs before polling, record the boundary before publication, and save returned post IDs before completion. These callbacks are an application interface, never model supplied options.

A saved Threads/Instagram parent container can resume polling without creating a replacement container. Poll failures with a known container use the existing bounded retry schedule. An expired lease during preparation can be reclaimed. An expired lease with a confirmed saved post receipt settles as published. An uncertain response during publication stays `outcome_unknown`; it is never blindly published again. A crash between remote acceptance and durable receipt still requires status investigation. Partial child container creation, ambiguous LinkedIn outcomes and evidence that cannot be reconciled remain manual review cases. No exactly once platform guarantee is claimed.

The original scheduled instant remains in `originalPublishAt` while retry timing uses `publishAt`. Publication does not invoke a language model or debit AI credits. Entitlement policy remains product controlled and deferred commercial policies remain unset.

## Mutations and validation

Cancellation cannot overwrite publishing, published or uncertain delivery. Conditional writes detect changes between read and mutation. Editing requires a scheduled row and reruns platform/media validation. Rescheduling allows scheduled or canceled rows, with a future instant and confirmation. Editing and schedule state updates share an immediate transaction; a worker claim cannot race past them. In flight mutations return a defined error and require refreshed status instead of reporting a false cancellation.

## Migrations and deployment

Delivery migrations 0006 and 0007 add request receipts and nullable claim/lease/phase fields. Tests apply them to isolated SQLite databases, including an on disk two connection fixture. Existing schedules and tokens remain intact. Generated unrelated analytics reconstruction was excluded from these migrations. Apply migrations before starting the new worker; use one worker version during rollout. Rollback must not restart an old worker against unresolved claims or permit legacy request replay to duplicate V2 requests.

Both repositories now gate deployment with foundation checks. This is local verification, not authorization to deploy. Full product release still requires content approval enforcement, active legacy campaign transition, media availability through due time, provider/reconnect verification, the complete responsive UI and billing acceptance.

## Verification

Real SQLite tests cover replay, tenant collision, concurrent replay, changed content conflict, transaction rollback, exact lookup, bounded pages, guarded mutations, two worker connections, lost response uncertainty, saved container resume and crash after receipt persistence. Adapter suites run against mocked network responses. Product calendar tests verify all pages and nonmutable uncertain statuses. Playwright exercises the real calendar DOM with a local API fixture; no social post is created by that browser test.
````

</details>

## Appendix H. Chronological implementation progress — historical checkpoints

Source: `/home/zayntechinfo/work/projects/sochestral/docs/v2/Implementation-Progress.md`. SHA-256: `0b15452398444a0a9d4b564ca00cdf10af46dc45bd3f401019756619a332037d`. This verbatim snapshot is source material; preserve its distinction between required, proposed, deferred and conditional work. Historical progress entries are superseded by later entries and the interrupted-work section above.

<details>
<summary>Full source document</summary>

````markdown
# V2 implementation progress

Started 10 September 2026. Status: in progress. This is a completion record, not a release claim.

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

Phase 0: finish cross repository contract and fault harness coverage, isolated full test baselines, browser calendar check and delivery CI gate.

Phase 1: shared scoped context/provenance, all operation usage accounting, persistent confirmed timezone.

Phase 2 and A11: transactional tenant scoped replay and conflict contract; claims, attempts, uncertainty and reconciliation; persisted content revisions and confirmed schedule operations; media lifetime; legacy campaign transition.

Phase 3 and A12/A14: interview/delegation and persistent plan/comments/approvals; implemented responsive UI, appearance and schedule confirmation; retire immediate publishing and full access throughout product.

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

The next major integration is replacing the mandatory-ideas/legacy planning path in chat with the documented partial-answer/delegation interview and durable plan creation. This remains necessary: the new viewer/worker does not yet replace that old chat path. Durable content generation, approval and confirmed scheduling, memory/sources, full accounting/routing/billing and final release verification also remain unfinished.

Final reattachment verification: all five browser widths pass, including explicit location selection and preservation of the original anchor; all five revision-worker regression tests pass. Standalone web typecheck and git diff --check pass. Logs: /tmp/v2-reattach-{db,api,web,worker,browser,types,web-types}.log. Nothing deployed and no provider calls made.
````

</details>

## Appendix I. Resume instruction for the next AI

Read §1, §7, §9 and §12 before editing. Preserve both dirty worktrees. First verify/fix the interrupted interview code, then build the missing content-approval-to-scheduling path. Use explicit local DB URLs and serial integration suites. Keep unknown results visible, preserve exact revision/account/time bindings, and retire product publishing bypasses. Do not call the full goal complete from these targeted checkpoints. The user requested this handoff instead of further implementation; await their continuation instruction before resuming feature work.
