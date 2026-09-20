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
