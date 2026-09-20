# Sochestral V2 Launch Plan

**Status:** Active execution plan. This is not a claim that the product is ready to launch.  
**Created:** 20 September 2026  
**Repo:** hosted Sochestral product (`sochestral`), branch `cursor/v2-next-9bc5`  
**Companion gold files:** [`Sochestral-Product-Reference.md`](./Sochestral-Product-Reference.md) (P01–P19) and [`Sochestral-Agent-Implementation-Guide.md`](./Sochestral-Agent-Implementation-Guide.md) (A01–A15)  
**Historical evidence:** [`Sochestral-V2-Implementation-Handoff-2026-09-11.md`](./Sochestral-V2-Implementation-Handoff-2026-09-11.md), [`Implementation-Progress.md`](./Implementation-Progress.md), [`Execution-Contract.md`](./Execution-Contract.md)

## You are here

| Field | Value |
| --- | --- |
| Current step | **L2** — interview product gates (delegation, research, no schedule) |
| Last completed | **L1** (20 Sep 2026): interview typecheck, isolated tests, chat routing onto the review link, CI include |
| Do not start | Durable content generation, schedule confirmation, billing, WhatsApp, Phase 8 expansion |
| Stop if | A later step would invent a deferred commercial policy, publish live, migrate production Neon, or treat direction approval as schedule permission |

Update this table at the end of every completed step. Do not mark a step complete from code review alone.

---

## 0. How to use this file

This is the build order for the rest of the product until users can run the gold loop end to end and we can invite them to use it.

1. Read this file, then the gold files for the step you are on. The gold files define **what** and **why**. This file defines **order**, **gates**, and **what is already done**.
2. Do **one step**. Commit, test, record evidence, then stop. Do not bundle L5 into L1.
3. A step is done only when its **Done when** checks pass. Partial code without tests stays **in progress**.
4. If source disagrees with this file, inspect the code, then update this file in the same change that proves the new truth. Do not silently shrink the gold loop.
5. If a load bearing product decision is still Open (P10 deferred policies, model defaults, live paid terms), keep the seam and disable the action. Do not invent terms.
6. WhatsApp (SOC-15 / Feature 8) waits until the web gold loop ships. Do not rebase or land PR 15 or PR 16 as part of this plan.
7. This file does **not** authorize production migrations, Fly deploys, live social posts, or taking payment.

### Skills and approach

Build with Tracer Bullet: one real path through every required stage before widening. Use `/develop` for implementation, `/test` after code, `/check verify` before calling a user outcome done. Use `/architect` only when a load bearing decision is unmade and not already settled in P15 / A08 / A13–A15.

---

## 1. Authority

| Document | Role |
| --- | --- |
| Product Reference v1.3 | Founder facing intent, P05 user loop, P17 UI, P19 deferred policies |
| Agent Implementation Guide v1.3 | Phases A04, invariants A02, SocialMCP A11, UI A12, billing A13, scheduling only A14, one brand A15 |
| This Launch Plan | Sequential work units L0–L18 and launch gates |
| Execution Contract | Implemented SocialMCP scheduling/receipt/worker contract (local, not live verified) |
| Implementation Progress | Dated Codex checkpoints. Later checkpoints override earlier “pending” lines |
| Codex handoff 11 Sep 2026 | Interrupted interview details and remaining map. Historical. Prefer current source if they diverge |
| `docs/scope/scope.md` | Slice 1 history. V2 gold files override full access / immediate publish / “next is Feature 10” language where they conflict |

Locked decisions (do not reopen inside a step):

- Scheduling only. No product immediate publish. No full access / trusted autonomy. A14.
- One brand per user at launch. A15. This is not a one social account limit.
- Interview or delegate → versioned plan → comments → approve **direction** → finished content → content approval → confirm accounts/dates/timezone → queue → due time publish. P05, A02.
- No arbitrary 30 post commercial ceiling.
- Paddle working prices exist for sandbox later. Trial, expiry, rollover, account limits, auto top up, cancellation, refunds remain **deferred**. Do not invent them.
- SocialMCP owns tokens, schedule receipts, and due time publication. Sochestral owns brand context, plans, content, review, timezone conversion, credits, and confirmation.

---

## 2. The product we are building

Plain outcome from P02 / P05:

Sochestral is an AI content partner. A user brings a brand and real work. The product interviews or accepts delegation, writes a persistent plan, takes comments, generates finished posts after direction approval, lets the user review those posts, then schedules only after explicit confirmation. Posts publish when due through SocialMCP.

The demonstration that must eventually work (P13):

1. User supplies brand context (and later a short voice note or examples).
2. Product asks two useful questions or proceeds on delegation.
3. A focused persistent plan appears.
4. User highlights a comment; the same document revises.
5. User approves direction; finished captions and variants appear.
6. User approves content, reviews destinations and timezone, confirms schedule.
7. Queue shows truthful status. Due time publication happens without keeping the page open.

Until that loop is real, launch copy must describe only what exists.

Audiences (P03): business owners, founders, creators. Onboarding adapts questions. Not a casual anyone posts app.

---

## 3. Current truth (20 September 2026)

Recorded against this checkout: `cursor/v2-next-9bc5` at `9008ef2` (same as `main` after merging V2 and the SOC-15 spec only). V2 product code is in `409126c`.

### Already in this product repo

| Area | What landed | Limit |
| --- | --- | --- |
| Slice 1 hosted SaaS | Login, chat, connectors, review drafts, R2/MinIO media, calendar/list, setup profile | Legacy campaign / immediate publish paths still exist |
| Phase 0 (partial) | Planner `MODEL_UNAVAILABLE`, sanitized errors, campaign/delivery characterizations, calendar fixture, foundation CI | Full A11 fault harness and live adapter verification still open |
| Phase 1 (partial) | Confirmed profile timezone (0019), shared generation context (0020), provider attempt accounting (0021) | Not every compose/setup/research/image/tool path is instrumented. No rate card, no user usage UI, no billing |
| SocialMCP contract (external) | Receipts, tenant replay, worker claims, pagination, mutation guards (delivery 0006/0007) | Local/mocked. Live reconnect, media lifetime, LinkedIn uncertainty still open. This repo does not contain SocialMCP |
| Phase 3 plan artifact | Versioned plans, comments, batches, direction approval (0022), revision worker (0023), reattachment (0024), Plans UI | Chat interview not proven. No durable finished content. Direction approval is not content or schedule permission |
| Phase 3 interview (source only) | `planInterviews` (0025), `runPlanInterview`, DeepSeek citation parsing, chat routing into interview | **Not tested.** Typecheck after interview edits was not proven at Codex pause. Mandatory ideas and legacy campaign still live |

### Explicitly not done

- Interview tests, browser chat → plan link, original request constraint persistence
- Durable content items, revisions, variants, content approval
- Confirm schedule binding approved revision + account + IANA timezone + UTC instant
- Product schedule operations reconciled to SocialMCP receipts
- A14 retirement of immediate publish and full access
- Correction memory UI and source inbox (Phase 4)
- Explicit provider routing and evaluation (Phase 5)
- Paddle ledger (Phase 6)
- Pilot, public signup/recovery, coordinated production migrate/deploy (Phase 7)
- Phase 8 expansion (templates, check-ins, analytics, extra brands, teams, WhatsApp)

### Open PRs that are not this plan

- PR 15: obsolete calendar spec vs already shipped 0010/0011. Leave unmerged.
- PR 16: WhatsApp implementation colliding with existing migration names. Leave unmerged. Rebuild later after 0025 with a new migration number.

---

## 4. Environment and safety (every step)

Pin local databases. Injected Cloud Agent secrets can point `DATABASE_URL` at production Neon. `.env` does not override them.

```bash
# Local test migrate only. Never unqualified pnpm run db:migrate in this environment.
DATABASE_URL=postgresql://sochestral:sochestral@127.0.0.1:5433/sochestral_test \
  pnpm run db:migrate

# Integration tests: distinct URLs, NODE_ENV not production, CORS_ORIGIN unset if it is the product origin.
env -u CORS_ORIGIN NODE_ENV=test \
  DATABASE_URL=postgresql://sochestral:sochestral@127.0.0.1:5433/sochestral \
  TEST_DATABASE_URL=postgresql://sochestral:sochestral@127.0.0.1:5433/sochestral_test \
  pnpm --filter @sochestral/database exec vitest run <file>
```

Rules:

- `TEST_DATABASE_URL` must contain `test`. DB suites delete users globally; run them serially.
- Do not print secrets while diagnosing env.
- Do not call real social publish scripts.
- Do not apply product migrations to Neon until Phase 7 is authorized.
- Node 22 for package tests if host Node is newer (`bash ./scripts/with-node22.sh` when the delivery wrapper exists; otherwise the repo’s Cloud Agent Node 22).
- Web is `web/` with npm, not pnpm workspace.

---

## 5. The gold loop as gates

Every tracer path must pass these server side, even if the UI is wrong or the model says go ahead.

| Gate | Meaning | Not sufficient |
| --- | --- | --- |
| G1 Interview | Answers retained; delegation classified in code; research failure is explicit | Chat prose that looks like a plan |
| G2 Plan persisted | Versioned document with six sections and stable IDs | Markdown in the conversation only |
| G3 Direction approval | Explicit, version bound, invalidated by revision | Opening the plan page |
| G4 Content generated | Immutable revision stored before any schedule attempt | Regenerating captions on retry |
| G5 Content approval | Separate from G3; invalidated if unscheduled content is edited | “Looks good” in chat |
| G6 Confirm schedule | Exact revision + destination account + UTC instant + display timezone + `confirm: true` | Dry run, “publish now”, scheduling now to fake immediate post |
| G7 Receipt | Tenant scoped SocialMCP receipt stored; status read separately | Assuming parent post status is live |
| G8 Due time | Worker publishes when due; uncertain stays checking, not fake success | User keeping the tab open |

If a step cannot add the next gate, it must not pretend the later gate already exists.

---

## 6. Step catalog

Relative size is guidance. Do the steps in order unless a later step is marked **parallel allowed**.

### L0 — Orient, pin, and freeze scope

**Status:** Done for this continuation (20 Sep 2026). Repeat L0 at the start of a new agent session.

**Do:**

1. Confirm branch is `cursor/v2-next-9bc5` (or the successor recorded here), not `main` for new commits.
2. Read gold files P05, P07, P17, P19 and guide A02, A04, A11, A12, A14, A15.
3. Confirm local Postgres on 5433 and that you will pin `DATABASE_URL` for any migrate.
4. Record current commit in the progress log if it changed.

**Done when:** The worker knows the current step is L1 and will not migrate production.

**Next:** L1.

---

### L1 — Interview typecheck and isolated tests

**Status:** Done 20 September 2026 on `cursor/v2-next-9bc5`. Interview source is covered by isolated tests. Remaining mandatory-ideas / campaign paths are L2/L11.  
**Gold:** A04 Phase 3 items 1–3; handoff §7.  
**Why:** Chat still has a mandatory ideas / clerk campaign path. The new interview is the entry to the gold loop. Untested interview code must not be treated as shipped.

**Build (only if tests expose defects):**

- Keep `packages/database/src/plan-interview.ts` and `packages/orchestration/src/plan-interview.ts`.
- Fix TypeScript in `packages/orchestration/src/service.ts` if typecheck fails.
- Do not retire legacy campaign in this step. Do not generate finished posts.

**Tests to add and run (handoff list, required):**

1. Full backend typecheck (`pnpm -r typecheck`) and `web/` `tsc --noEmit`.
2. Database: owner and context scoping; concurrent expected revision; partial state retained; atomic plan plus interview link.
3. Orchestration with fake provider: first plan request asks questions; partial reply retained; plan saved with context and `/app/plans/:id` link; **no** MCP `schedule_post` and **no** publish.
4. Same request id does not call the model again or create a second plan.
5. Invalid classifier / truncated tool result fails visibly, keeps saved answers, does not fall into legacy scheduling.
6. Existing revision worker, plan API, and plan viewer tests still pass.

**Done when:** Those tests pass on pinned local `sochestral_test`. Typecheck is green. Progress log records L1.

**Do not:** Live Thesean quality claims; browser polish; content generation; enabling production 0025.

**Next:** L2.

---

### L2 — Interview product gates (delegation, research, no schedule)

**Status:** Next. Depends on L1.  
**Gold:** P05.3, A04 Phase 3 items 2–3, A02 invariants 1–2 and 6.

**Build:**

1. Delegation: model may paraphrase; **code** validates structured next action (`delegated`, `ready`, `asking`, `clarification_needed`, `research_unavailable`, `canceled`).
2. Research unavailable: persist that state; offer existing context drafting; never claim research happened; never invent citations.
3. Attributed research: persist URL, title, retrieval time, excerpt/summary; writer may only cite supplied provenance; reject fabricated, missing, or duplicate substitutions (strict bijection, not length plus membership).
4. Ready with complete answers must not skip a failed research choice unless the user explicitly chose existing context.
5. Persist load bearing original request constraints (horizon, item count, platforms, cadence, attachment identity) across partial turns, not only `goal` / `newsAssets` / `direction`.
6. After a plan exists, “go ahead” returns review guidance. It must not start a legacy campaign worker or schedule.
7. Usage: interview and research attempts record through `measureModelAttempt`. Missing provider tokens stay unknown. Do not write zero.

**Tests:** Fake provider cases for each status; research unavailable then explicit continue; fabricated sources rejected; go ahead after plan does not call SocialMCP; usage row exists with null tokens when omitted.

**Done when:** Code gates, not prompts, enforce the above. CI includes the new interview files.

**Next:** L3.

---

### L3 — Chat to plan viewer, browser proof

**Status:** Not started. Depends on L2.  
**Gold:** P05.4–5, A12 plan viewer, P17 responsive.

**Build:**

1. Chat response link opens the saved plan in `/app/plans/:id`.
2. Refresh and retry show the same interview/plan, not a new generation.
3. Five widths: 360, 390, 768, 1024, 1440. Comment, submit batch, direction approve remain as already tested on fixtures; now also from a plan created by interview (fixture or intercepted API is allowed; live model is not required).
4. Pause / cancel interview so later unrelated chat is not captured. Define resume. One conversation, one active generated plan for now (second plan in same thread is out of this step).

**Tests:** Playwright chat fixture → plan page. Existing `e2e/plans.spec.ts` still green.

**Done when:** A reviewer can watch the browser path without a live model.

**Next:** L4. Do not expand plan chrome (section nav, change summaries) beyond what L4 needs until the tracer through G8 exists.

---

### L4 — Direction approval is only direction

**Status:** Not started. Plan API already stores direction approval. This step is the product rule plus chat/API enforcement.  
**Gold:** P05.6, A04 Phase 3 item 9, A14.

**Build:**

1. Approve plan on the viewer remains version bound (already implemented). Audit every other path (chat tools, clerk acceptance, campaign, privileged flags) so none of them schedule or generate under the name “approved.”
2. Create content is a **new** explicit action. This step may add the API/UI stub that refuses until L5 exists, or it may be the first call into L5 if L5 is implemented immediately after in a separate commit.
3. Messages that sound like publish, post now, or full access must not call SocialMCP.

**Tests:** Direction approval does not insert schedule operations or MCP schedule calls. Stale version approval is rejected.

**Done when:** Grep/audit of publish/schedule entry points from plan approval is documented in the progress log with tests for the dangerous ones.

**Next:** L5.

---

### L5 — Durable finished content (first tracer)

**Status:** Not started. This is the largest missing product core.  
**Gold:** A04 Phase 2 items 1–2, Phase 3 items 9–10, A05 content/revision/variant entities.

**Build the thinnest vertical slice:**

1. New product tables (next migration after 0025): content item, immutable content revision, optional platform/account variant, media association, generation job with claim/lease similar to plan revision batches.
2. Create content only from a direction approved plan version. Job input is that exact version plus shared generation context snapshot.
3. Persist captions and asset references **before** any schedule attempt. Restart must not regenerate approved text.
4. Missing media and unverified factual placeholders block **that item**, not the whole set. Ready siblings can proceed if the user selects them later (selection UI can be minimal in this step).
5. No schedule calls in this step.
6. Reuse existing draft preview/editor primitives where they fit. Do not invent a second editor.
7. One user, one brand. Tenant scope everywhere.

**Tests:** Job creates a revision; crash before complete does not leave a schedulable blank; second start does not duplicate if the revision exists; unapproved plan version is rejected; mocked model only.

**Done when:** One plan can produce at least one persisted caption revision visible in UI or API, with no SocialMCP traffic.

**Next:** L6.

---

### L6 — Content review and content approval

**Status:** Not started. Depends on L5.  
**Gold:** P05.7, A04 Phase 3 items 10–12.

**Build:**

1. User can edit, comment, regenerate a selected part, or exclude an item. One bad caption must not force full campaign regeneration.
2. Content approval is a separate record: revision id, actor, timestamp. It is not direction approval.
3. Edit to unscheduled approved content invalidates that content approval.
4. Unsupported claims and missing assets stay visible.
5. Short requests (single post) use a compact flow but still require content review and later schedule confirmation.

**Tests:** Approval does not survive an edit; excluded item cannot be selected for schedule later; regenerate one item leaves siblings intact.

**Done when:** G5 exists in the database and API, enforced server side.

**Next:** L7.

---

### L7 — Confirm schedule (accounts, dates, timezone)

**Status:** Not started. Depends on L6. Timezone columns and `resolveScheduleTime` already exist.  
**Gold:** P05.8, A04 Phase 1 item 6, Phase 2 items 3–4, Phase 3 item 11, A14, Execution Contract.

**Build:**

1. Schedule UI lists selected approved revisions, destination connected account ids, local times, confirmed IANA timezone, and computed UTC instants.
2. Confirm schedule is an explicit user action. Server checks: content approval current, timezone confirmed on profile, accounts owned by tenant, future instant, no silent “now.”
3. “Publish now” language routes into this review. It must not create a schedule for the current instant to fake immediate posting.
4. Unconfirmed timezone cannot bind. Browser detection remains a suggestion (already true on profile).
5. DST gaps and overlaps use existing `resolveScheduleTime` rules.
6. Persist the confirmation payload (revision, account, UTC, timezone, logical operation id) before calling SocialMCP.

**Tests:** Missing timezone confirmation 422; stale content approval 409; confirm false or omitted does not write; dry run does not persist remote receipts.

**Done when:** G6 is real for at least one destination in tests with a fake MCP client.

**Next:** L8.

---

### L8 — Product operations plus SocialMCP receipts

**Status:** Not started. Depends on L7. Delivery contract already exists in SocialMCP.  
**Gold:** A04 Phase 2 items 5–10, A11, Execution Contract.

**Build:**

1. One logical schedule operation per destination: state, attempts, idempotency key, fingerprint, external ids, receipt.
2. Call `schedule_post` with `confirm: true` only after G6. Store every `scheduled[]` receipt. Creation failure rolls back product operation state honestly.
3. Replay same key and fingerprint returns original receipt. Changed payload is conflict. Product must not double book.
4. Distinguish product operation progress (queued, scheduling, scheduled, needs_attention, canceled, outcome_unknown) from delivery publication states.
5. Status reads use `get_post_status` / `get_scheduled_posts` with cursor pagination. Parent post status is not authority.
6. Cancel pending local ops separately from remote cancel. Cancellation cannot overwrite publishing, published, or unknown.
7. No second schedule authority. Calendar reads reconciled operations, not a competing campaign tick.

**Tests:** Fake MCP: success receipt stored; conflict; replay; timeout → outcome_unknown without second create; cancel during scheduling defined.

**Done when:** G7 holds in tests. No live post required.

**Next:** L9.

---

### L9 — Progress UI and due time observation

**Status:** Not started. Depends on L8.  
**Gold:** P05.9, A12 calendar, Execution Contract worker section.

**Build:**

1. Show counts like queued / scheduled / need attention without implying unknown is Done.
2. User can open the two that need attention without repeating the rest.
3. Calendar and list are two views of the same operations (A12). Timezone visible. Uncertain labeled Checking status.
4. Product does not debit AI credits at due time (nothing to implement if no ledger yet; do not add a debit).
5. Due time publication remains SocialMCP’s worker. Product observes. Do not run a second publisher.

**Tests:** Browser fixture for mixed statuses at 360 and 1440. Calendar drag still works. No hover only essential action.

**Done when:** G8 is observable in the product UI with fixtures. Live publish still belongs to L16.

**Next:** L10, with L11 allowed in parallel after L8 tests exist.

---

### L10 — Widen the tracer (variants, scale, media, recovery)

**Status:** Not started. Depends on L9.  
**Gold:** P08, A04 Phase 2 items 4, 7, 8, 11, 12; A11 tests.

**Build:**

1. Platform/account variants from a shared capability contract. LinkedIn is not a carousel. Do not advertise stub Facebook/X/TikTok connectors.
2. 20 / 50 / 100 destination harness with per item receipts. Partition work. **Never truncate** requested scope silently. If over operational limits, explain and refuse or queue, do not drop items.
3. Failed sibling does not discard healthy items. No slot days are not campaign failure; propose next slot; never silently move a confirmed date.
4. Media reachable through due time (R2/private object), not only short preview URLs.
5. Scheduled content edits become a proposed revision; live scheduled revision stays distinct until a supported remote update or replacement.
6. Bounded concurrency, backoff, jitter. Reconnect and invalid media need user action.
7. Incremental drain of legacy campaigns: flag new work onto V2 path; do not dual book the same logical item.

**Tests:** Harness sizes; media expiry fixture; capability mismatch rejected; truncation test fails if items disappear.

**Done when:** Operational batching is proven without a 30 cap. Live accounts still not required.

**Next:** L11 if not already done; then L12.

---

### L11 — Scheduling only retirement (A14)

**Status:** Not started. **Parallel allowed** once L8 fake MCP tests exist. Must complete before calling the product safe to invite users.  
**Gold:** A14, P07 trust boundary, P15 D05.

**Build:**

1. Remove full access / trusted autonomy settings, entitlements, prompts, tools, and immediate publish product routes.
2. Audit: one post, campaigns, accepted plans, privileged users, background workers, MCP tools from the product, `PUBLISHING_AUTHORITY_ENABLED`, `CAMPAIGN_QUEUE_CAP`.
3. Legacy campaigns without review evidence pause for transition; they do not inherit old permission.
4. Keep SocialMCP due time worker and existing confirmed remote schedules.
5. Replace obsolete tests that expected autonomy/direct publish with tests that they are gone.

**Tests:** Direct API/tool bypass attempts fail; removed modes 404/403; stale approvals cannot publish; due time path still callable in isolation.

**Done when:** A14 acceptance list is checked in the progress log with grep evidence and tests.

**Next:** Continue L10 if unfinished, else L12.

---

### L12 — Finish shared context and usage (Phase 1 remainder)

**Status:** Not started. **Parallel allowed** with L5–L10 for instrumentation only; do not block the tracer.  
**Gold:** A04 Phase 1.

**Build:**

1. Wire remaining compose, rewrite, setup, research, image, and tool paths to the assembler and usage attempts.
2. Link snapshots to plan versions and content revisions.
3. One brand preference identical across planner, writer, rewriter, workers (integration proof).
4. Never coerce missing usage to zero. Accounting finalize failure must not repeat a successful provider call (already true on Thesean wrappers; extend).
5. User visible usage can wait until L15 if the ledger is not ready; internal rows must already exist.

**Done when:** A checklist of generation entry points all write attempt rows in tests.

**Next:** L13.

---

### L13 — Correction memory and source inbox (Phase 4)

**Status:** Not started. Depends on shared context (0020) and review events from L6.  
**Gold:** P06 brand memory and source inbox, A04 Phase 4. Core for repeat use; required before claiming the P04 differentiator.

**Build:**

1. Explicit instruction (“always keep openings short”) saves as an editable preference without a second approval click.
2. Inferred patterns from a single edit stay **proposed**, not silent voice rewrite.
3. Inspect, correct, remove memory. Deleted context excluded from the next assembler snapshot.
4. Scope: brand / campaign / item. Expiry for offers and events.
5. Source inbox v1: text, links, images, voice note transcription. Link angles to original material. User can fix transcript and exclude sensitive items.
6. Missing assets and unverified claims remain work, not invented facts.

**Out of this step:** Semantic retrieval, weekly check-ins, performance planning.

**Done when:** Permanent vs one time edits differ in tests; expired offer does not reappear in assembled context.

**Next:** L14.

---

### L14 — Remaining A12 / P17 surfaces

**Status:** Partial (Plans viewer, calendar captions, timezone confirm). Complete before pilot.  
**Gold:** A12, P17.

**Build remaining:**

1. Compact shell; labeled collapsible nav; Workspace, Content, Calendar, Brand; settings for accounts, appearance, billing.
2. Desktop chat plus persistent plan/preview; mobile Chat/Plan switch; comment bottom sheet; keyboard and safe area.
3. Post editor two pane desktop; mobile Preview tab; one save; honest partial errors.
4. Unified accounts list (no duplicated cards plus table).
5. Memory UI from L13, not raw compiled prompt.
6. Onboarding: short description allowed; help needed choices, not old skills questionnaire.
7. Login: service failure at form level, not “wrong password” for API down.
8. Appearance: light / dark / system, pink default `#f211b6`, custom accent, derived shades, never recolor generated brand art.
9. Verify 360/390/768/1024/1440, light/dark/custom, reduced motion, loading/empty/partial/unknown/reconnect/low balance.

**Done when:** Browser evidence exists per surface. Screenshots alone are not enough; flows must run.

**Next:** L15 can start earlier for routing config, but UI acceptance is a Phase 7 gate.

---

### L15 — Explicit routing, evaluation, budgets (Phase 5)

**Status:** Not started. Needs usage rows from L12 and representative workflows from L5–L9.  
**Gold:** P09, A04 Phase 5, A13 Standard/Advanced.

**Build:**

1. Replace `name.includes('gpt-')` with explicit provider, endpoint, API shape, capabilities, model id, role.
2. Candidates remain candidates: Thesean Sonnet/Terra everyday, Luna extraction, Astra strategy only if available. Do not assume Thesean discounts Astra.
3. Handoffs keep approved brief and facts. Model choice cannot grant authority.
4. Evaluation set: founder, seller, builder; delegation; conflict comments; missing facts; long campaign; tool failure. Human review required.
5. Standard vs Advanced independent of Plan vs Agent if evaluation supports it. No silent downgrade.
6. Estimate plus max spend pause. Estimates are not enforcement by themselves.

**Done when:** Default routing is explained by recorded evaluation, not folklore. Budget enforcement tested with fake expensive calls.

**Do not:** Promise Advanced pricing to customers before this evidence.

**Next:** L16.

---

### L16 — Paddle sandbox and shared credits (Phase 6)

**Status:** Not started. Independent of live paid launch.  
**Gold:** P10, A07, A13, P19.

**Build:**

1. Server controlled sandbox catalog: Starter $15 / 1,000 credits, Plus $35 / 3,000, top ups $5/400, $10/800, $25/2,000.
2. Append only fixed precision ledger. Reserve, settle, release. Concurrent tasks cannot overspend. Webhook idempotency.
3. Internal cost vs customer charge. System retries not double charged.
4. Zero AI balance pauses new AI work; manual edit and **already scheduled** due delivery continue while entitlement is active.
5. Preserve image usage history; do not invent purchased balances for beta users.
6. Policy seams for trial, expiry, rollover, account limits, auto top up, cancel/grace, refunds: **disabled / unset**. UI does not offer them.

**Done when:** Sandbox checkout and ledger tests pass. No live Paddle money. No invented customer terms in copy.

**Next:** L17. Taking real payment is a separate founder authorized gate after deferred policies are decided.

---

### L17 — Pilot, migration, and launch (Phase 7)

**Status:** Not started. Depends on L10, L11, L14. Billing sandbox may be off for a free beta.  
**Gold:** P12, P13, A04 Phase 7, AGENTS.md free beta.

**Build / operate:**

1. Closed beta can use `db:provision` / invitation. Public launch needs real signup or invite plus account recovery. Dead buttons that promise signup are not a launch.
2. Controlled live test on **authorized** accounts and harmless content only: full G1–G8, reconnect, timezone, media lifetime, duplicate safe recovery.
3. Verify current official platform capabilities before marketing.
4. Drain legacy campaigns. Rollback plan: disable new V2 entry without stranding in flight operations; never run old worker against new claims.
5. Coordinated migrate: product 0019–00xx on Neon, SocialMCP 0006–0007 if not already live, one worker version, then web/API deploy. Founder authorizes. This plan does not self authorize.
6. Launch copy matches implemented gates. No virality, guaranteed sales, future platforms, or “it learns your voice” unless L13 is truly in.
7. Metrics (P14) instrumented enough to see: reached approved plan, finished post, schedule confirmed, unknown outcomes. Numerical targets wait for the first cohort.

**Pilot acceptance:**

- Representative users complete first approved plan, first scheduled batch, and a return session without an engineer driving the UI.
- No orphaned campaigns; no dual workers.
- Billing copy (even “free beta”) agrees with what the software does.
- Full test/lint/browser/accessibility audit recorded.

**Launch for users means:** those checks plus authorized production migrate/deploy. Not a green unit suite on a laptop.

**Next:** Operate the beta. Phase 8 only after weekly use evidence.

---

### L18 — Expansion after retention (Phase 8)

**Status:** Out of launch. Do not implement as a launch checklist.  
**Gold:** P06 Next/Later, A04 Phase 8.

Validate one at a time, with demand and official API access:

- Reusable visual templates
- Optional weekly check-in
- Selected source integrations
- Performance informed planning
- More brands / accounts
- Team review
- WhatsApp channel (SOC-15) rebuilt on a new migration after 0025
- Further formats

Defer large video generation and autonomous DMs/replies until core retention is real.

---

## 7. Suggested commit rhythm

One logical commit per substep inside L1–L11 is better than one giant “v2 done” commit.

Typical L1 commit set:

1. Interview typecheck fixes
2. Database interview tests
3. Orchestration interview tests and CI include

Then stop for review. L5 will need its own spec if `/develop` finds unnamed fields; write that spec before inventing table names beyond A05.

---

## 8. Requirement audit (use at L17)

Walk P05 numbered stages and A02 invariants. For each, record: implemented in which step, test evidence, live vs mocked.

Also tick:

- [ ] P07 trust boundary (no immediate publish)
- [ ] P08 no silent 30 truncation
- [ ] P17/A12 widths and themes
- [ ] P19 no invented commercial policies
- [ ] A11 fault cases against SocialMCP (in that repo) plus product reconciliation
- [ ] A14 list
- [ ] A15 one brand, no switcher
- [ ] Accurate public copy

---

## 9. What this plan will not do

- Merge PRs 15 or 16.
- Implement WhatsApp, Telegram, or a second brand switcher before L17.
- Enable live paid checkout while P10 deferred policies are unset.
- Treat foundation CI as release.
- Claim Codex interview work is complete.
- Run production `db:migrate` from a Cloud Agent shell.
- Publish to real social accounts except under L17 authorized controlled tests.

---

## 10. First action after this file exists

Execute **L1**. Start with typecheck, then interview tests, then record results in [`Implementation-Progress.md`](./Implementation-Progress.md) and move **You are here** to L2 when L1 is actually green.
