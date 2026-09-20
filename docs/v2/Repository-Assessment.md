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
