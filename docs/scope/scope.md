# Scope: Hosted SaaS Product

**Sochestral** is a business-strict AI social operator for people who sell or ship something real and need steady online presence. Users talk in plain language (web UI and optional WhatsApp / Telegram). The agent drafts, schedules, and publishes through official platform APIs. New users start in review-before-publish mode and can later unlock more autonomy.

### Who this is for

| Persona | Job to be done |
|---------|----------------|
| Physical product sellers | Push consistent content so the brand stays relevant and wins more customers |
| Founders launching a product | Keep shipping updates about the product without becoming a full time social media person |
| Developers and builders | Stay visible while building; do not get stuck only writing code with no public signal |

### Who this is not for

Not a casual consumer toy, not “anyone who posts,” and not a generic content farm. If the user is not running a business, launch, or builder presence with real stakes, they are outside the ICP.

### Product bar

Implementation stays professional and conservative: official APIs only, validated tool execution (model decides, code executes), review safety before live posts, clear tenant boundaries, and better practice defaults over clever shortcuts. Copy, UX, and agent behavior should read as a serious operator for a business, not a playful chatbot.

**This repo** is the private hosted product. **SocialMCP** lives in a separate repository (future OSS) and is an **external dependency** this product calls. Do not fork MCP adapters, OAuth token storage, or the publish worker into this repo.

**Build approach:** Tracer Bullet (prove one real path through every layer before widening scope).
**First vertical path:** provision user → connect accounts → agent drafts → user approves → SocialMCP publishes → show result.
**Workflow:** Medium (after `/develop`: `/check verify`, then `/test`). Auth, database, orchestration, and tier design override to `full`.
**Weight profile:** product database, auth/JWT, and orchestration are `full`; subscription tier design is `full`; most channel and agent features are `medium`.

## Progress snapshot (reconciled against code + Linear, 2026-08-09)

| Area | Reality |
|------|---------|
| Foundation (1 to 2) | Shipped: product schema on **Neon** Postgres, sessions, MCP JWT minting |
| Slice 1 core (3 to 5) | **Done.** Tracer Bullet path proven on the product URL (`https://app.sochestral.shop`): connect → chat → draft → preview aside → approve → SocialMCP publish → live result. Linear SOC-5 / SOC-6 / SOC-18 / SOC-19 Done |
| Slice 3 early (12 to 14) | Feature 14 **Done** (SOC-7). Feature 12 live smoke **Done** (SOC-9). Feature 13 intent clarify + action labels **Done**; Thesean Thinking smoke **Canceled** (SOC-8) — model has no extended thinking; think-stream UI removed |
| Slice 2 (6 to 10) | Feature 7 **Done** ([0009](../specs/0009-setup-agent-business-profile/index.md), SOC-12 / SOC-13). Feature 6 tiers **deferred** (SOC-10 / SOC-11 Backlog). Channels (8/9) wait until the main web app is further along. Feature 10 calendar + scheduled posts list **build landed** ([0010](../specs/0010-schedule-calendar/index.md), [0011](../specs/0011-scheduled-posts-list/index.md)); next `/check verify` then `/test`. Feature 15 chat schedule loop **build + tests landed** ([0012](../specs/0012-chat-schedule-loop/index.md)); live SocialMCP smoke still open in verify.md. Feature 16 autonomous schedule planner **build landed** ([0013](../specs/0013-autonomous-schedule-planner/index.md)); verify/test open. Brand kit (SOC-40) stays a strong parallel Settings deepen |
| Hosting | Fly apps `sochestral` (web) + `sochestral-api` (Hono); cloud SocialMCP; Neon as primary product DB. Local Docker Postgres on 5433 is for agent/dev only |

**Next:** `/check verify chat schedule loop` (Feature 15, [0012](../specs/0012-chat-schedule-loop/index.md)), then `/test`. Feature 10 calendar verify can run in parallel. WhatsApp/Telegram after the web operator loop feels complete. Feature 6 tiers still deferred. Free beta access; billing is parallel and not a beta gate.

## Already done in SocialMCP (do not rebuild here)

Treat the following as shipped in the external SocialMCP repo. This SaaS scope only consumes them.

- MCP server with tools for Threads, LinkedIn Personal, and Instagram
- OAuth callback API, CLI connect, scheduled publish worker
- Execution database (SQLite + Drizzle locally; ops choices stay in that repo): accounts, tokens, posts, schedules, publish logs
- Multi tenant identity: every tool path scopes by `userId`
- Product callers authenticate with `Authorization: Bearer` JWT (`sub` = user id, HS256 with shared `JWT_SECRET`)
- Local BYOA still works via `SOCIALMCP_USER_ID` / `user_local_default`
- Threads + Instagram webhook ingestion exists (autonomous reply does not)

**Shared contract:** the same `userId` string lives in SaaS Postgres and in the MCP JWT `sub`. Product profiles, billing, chat, and memory never go into the MCP database.

## Repo split

| Repo | Owns |
|------|------|
| SocialMCP (separate, future OSS) | Platform OAuth tokens, connected accounts, posts, schedules, publish logs, MCP tools, worker |
| This SaaS repo (private) | Login/users, business profiles, tiers, orchestration + LLM, review UI, channels, memory, billing later |

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Product database (Postgres) | Foundation | done |
| 2 | Auth / session and MCP JWT issuance | Foundation | done |
| 3 | Orchestration backend skeleton | Slice 1 | done |
| 4 | Sochestral chat workspace and connectors UI | Slice 1 | done |
| 5 | Review mode publish loop | Slice 1 | done |
| 6 | Subscription tier model | Slice 2 | deferred |
| 7 | Setup agent and business profile | Slice 2 | done |
| 8 | WhatsApp channel for agent chat | Slice 2 | planned |
| 9 | Telegram channel for agent chat | Slice 2 | planned |
| 10 | Remaining web product surfaces | Slice 2 | in-progress |
| 11 | Structured memory and correction loop | Slice 3 | planned |
| 12 | Configurable publishing authority and image uploads | Slice 3 | done |
| 13 | Intent clarify and Thinking UI | Slice 3 | done |
| 14 | Live platform preview aside | Slice 3 | done |
| 15 | Chat schedule loop | Slice 3 | in-progress |
| 16 | Autonomous schedule planner | Slice 3 | in-progress |
| — | Operator comment/mention handling | Deferred | planned |
| — | Video and image generation pipeline | Deferred | planned |
| — | Facebook Pages (after MCP adapter exists) | Deferred | planned |
| — | Analytics and trends | Deferred | planned |
| — | Payment provider integration | Deferred | planned |
| — | System dark mode (product + platform chrome) | Deferred | planned |

## Foundation

### 1. Product database (Postgres) · full · done

Hosted product data lives here: users, business profiles, subscription tier, channel links (WhatsApp / Telegram), structured memory/rules, and product-side draft/approval state. SocialMCP keeps its own execution DB for tokens, posts, schedules, and publish logs.
**Done when:** product schema runs on Postgres; migrations apply cleanly; no product profile, billing, chat, or memory tables are written into the MCP database.
**Note:** Postgres is the right choice for concurrent hosted users, backups, and growth. Do not invent a dual-DB abstraction for MCP SQLite inside this repo — call SocialMCP over its API/MCP contract.
**Spec:** [0001](../specs/0001-product-database.md)
**Code:** `packages/database`
- [x] Design it (spec): `/architect product database (Postgres)`
- [x] Build it: `/develop product database (Postgres)`
  - [x] Scaffold `packages/database` schema, drizzle-kit, fail fast `DATABASE_URL` (AC-1, AC-2, AC-5, AC-6, AC-7)
  - [x] First Postgres migration + local Docker URL docs on port 5433 (AC-1, AC-2, AC-5)
  - [x] Provision helper/script, draft list/insert for tests, unit tests (AC-3, AC-4, AC-7, AC-8)
  - [x] Smoke migrate + provision against Docker Postgres (AC-1, AC-3, AC-5)
- [x] Verify it: `/check verify product database (Postgres)`
- [x] Test it: `/test product database (Postgres)`

### 2. Auth / session and MCP JWT issuance · full · done

Product login and session for the hosted app. When the orchestration layer calls SocialMCP, it issues a short-lived MCP JWT with `sub` = the same `userId` string stored in SaaS Postgres, signed with the shared `JWT_SECRET`.
**Done when:** a signed-in SaaS user maps to one stable `userId`; product sessions never leak platform tokens; orchestration can obtain a valid MCP Bearer token for that user without using `user_local_default` in production.
**Spec:** [0002](../specs/0002-auth-session-mcp-jwt/index.md)
**Code:** `packages/auth`, `packages/api`, `web/src/app/login`
- [x] Design it (spec): `/architect auth session and MCP JWT issuance`
- [x] Build it: `/develop auth session and MCP JWT issuance`
  - [x] Migrate `password_hash` + `sessions` table (AC-1)
  - [x] Password/session helpers + `mintMcpJwt` + set password CLI (AC-2, AC-7, AC-8, AC-9)
  - [x] Hono API login/logout/me/mcp-token routes (AC-3, AC-4, AC-5, AC-6, AC-7, AC-8)
  - [x] Minimal Next login page + smoke path (AC-3, AC-5, AC-7, AC-10)
- [x] Verify it: `/check verify auth session and MCP JWT issuance`
- [x] Test it: `/test auth session and MCP JWT issuance`

## Slice 1: Core publish loop

Thin but real path: provision user → connect Threads, LinkedIn, and Instagram via web OAuth (product starts connect; **MCP stores tokens**) → agent drafts a post → user reviews in the live platform preview aside → SocialMCP publishes → Live preview shown. Messaging channels and long term memory stay later. Slice 1 Tracer Bullet path is proven on the cloud product URL (Linear SOC-5 / SOC-6 / SOC-18 / SOC-19 Done).

### 3. Orchestration backend skeleton · full · done

Backend that loads SaaS user context, calls the LLM with a **fixed SocialMCP tool set**, validates tool args, and executes by calling SocialMCP. Model decides; code executes. Never let the model run arbitrary code against a real social account.
**Done when:** one authenticated product API path can invoke SocialMCP tools such as `validate_post` and `publish_now` for a real tenant `userId` via JWT; tool allowlist and arg validation sit in this repo, not in prompt text alone.
**Spec:** [0003](../specs/0003-orchestration-backend/index.md)
**Code:** `packages/orchestration`, `packages/api/src/orchestration-routes.ts`, `packages/database/src/orchestration.ts`; SocialMCP `apps/mcp-server/src/http-server.ts`
- [x] Design it (spec): `/architect orchestration backend skeleton`
- [x] Build it: `/develop orchestration backend skeleton`
  - [x] Add the four-table orchestration data model, ownership queries, idempotency, pagination, and concurrency guards (AC-1, AC-6, AC-8, AC-9)
  - [x] Expose authenticated HTTP MCP in SocialMCP and add the tenant-scoped product client with its fixed dry-run tool contract (AC-3, AC-4, AC-5, AC-9, AC-11)
  - [x] Add the Thesean Anthropic provider, explicit platform resolution, bounded context, safe tool loop, and first end-to-end conversation path (AC-1, AC-2, AC-3, AC-7, AC-10, AC-11)
  - [x] Add authenticated Hono routes, usage limits, retries, stable errors, safe summaries, deletion, and redaction (AC-1, AC-6, AC-7, AC-8, AC-9)
- [x] Verify it: `/check verify orchestration backend skeleton`
- [x] Test it: `/test orchestration backend skeleton`

### 4. Sochestral chat workspace and connectors UI · medium · done

First authenticated product experience: chat workspace, Settings connectors, and product login. Orchestration powers chat. Connect hands off to SocialMCP OAuth; tokens stay in the MCP execution DB. Review presentation moved to Feature 14. Schedule view, business profile settings, and analytics remain later (Feature 10 / deferred).
**Done when:** a tenant user can create and continue safe orchestration chats, manage conversation history, start connect for Threads, LinkedIn Personal, and Instagram from Settings, and see live connector status without product code storing OAuth tokens.
**Progress:** Done on cloud product path (Linear SOC-5, SOC-18). Connectors + chat work against live SocialMCP / Thesean on `https://app.sochestral.shop`. Product unit tests remain green. See `docs/specs/0004-chat-connectors-ui/verify.md`. Welcome composer polish (2026-08-08): attach enabled, mic/slash removed, send navigates to `/app/chat/new` immediately with optimistic message and planning UI.
**Spec:** [0004](../specs/0004-chat-connectors-ui/index.md)
**Code:** `web/src/app/app`, `web/src/components/app`, `web/src/components/auth`, `web/src/components/workspace`, `packages/api/src/connector-routes.ts`, `packages/orchestration/src/connectors.ts`
- [x] Design it (spec): `/architect Sochestral chat workspace and connectors UI`
- [x] Build it: `/develop Sochestral chat workspace and connectors UI`
  - [x] Add the tenant scoped connector API and safe SocialMCP contract
  - [x] Build the responsive authenticated chat workspace
  - [x] Build Settings connectors and OAuth return handling
  - [x] Redesign login and finish the Sochestral visual system
  - [x] Simplify the workspace, remove the right context rail, and move connector state fully into Settings
  - [x] Add polished product motion, reduced motion behavior, and reliable local preview startup
  - [x] Render safe Markdown formatting in assistant chat messages
- [x] Verify it: `/check verify Sochestral chat workspace and connectors UI`
- [x] Test it: `/test Sochestral chat workspace and connectors UI`

### 5. Review mode publish loop · medium · done

Default for new users: agent prepares a draft set in the product, user edits and approves, then publish runs through SocialMCP. No silent auto publish in this slice.
**Done when:** a tenant user can approve a draft and publish to Threads, LinkedIn, and Instagram in one flow via MCP; publish results (or clear failures) appear in the product UI.
**Progress:** Done on cloud product path (Linear SOC-6, SOC-19). Live review publish smoke with SocialMCP is satisfied as part of the proven Tracer Bullet path. Presentation is Feature 14’s live preview aside. See `docs/specs/0005-review-mode-publish-loop/verify.md`.
**Spec:** [0005](../specs/0005-review-mode-publish-loop/index.md)
**Code:** `packages/database/src/review.ts`, `packages/orchestration/src/review.ts`, `packages/api/src/review-routes.ts`, `web/src/components/preview/live-preview-aside.tsx`
- [x] Design it (spec): `/architect review mode publish loop`
- [x] Build it: `/develop review mode publish loop`
  - [x] Migrate product review drafts and immutable publish attempts
  - [x] Prove the Threads prepare, edit, approve, publish, and restore path
  - [x] Add SocialMCP idempotency, replay, unknown recovery, and rate safety
  - [x] Widen grouped execution to all three platforms (UI presentation owned by Feature 14)
- [x] Verify it: `/check verify review mode publish loop`
- [x] Test it: `/test review mode publish loop`

## Slice 2: Onboarding, channels, and tiers

Users can manage the product through web UI or optional messaging apps. Neither channel is mandatory.

### 6. Subscription tier model · full · deferred

Define tiers and what each tier gates (platforms, post volume, channels, autonomy, generation features). Gate checks live in the product before orchestration assumes unlimited access. Payment provider integration is deferred.
**Done when:** tier definitions and gate checks are documented in a spec; orchestration can read a user's tier from Postgres and block or allow actions accordingly; payment provider work is explicitly out of this feature.
**Progress:** Intentionally deferred (2026-08-09) until core operator features exist to gate. Free beta continues without Feature 6. Linear SOC-10 / SOC-11 in Backlog. Reopen before paid launch.
- [ ] Design it (spec): `/architect subscription tier model`

### 7. Setup agent and business profile · full · done

Separate setup agent turns plain language onboarding into structured profile data (tone, rules, cadence, skills, approval mode). Distinct from the operator agent that runs day to day. Profile lives in product Postgres, categorized — not one blob.
**Done when:** a new user can complete onboarding and the persisted structured profile drives content generation; sample post correction flow captures tone; profile categories are queryable, not a single opaque document.
**Spec:** [0009](../specs/0009-setup-agent-business-profile/index.md)
**Code:** `packages/database/src/profile.ts`, `packages/api/src/profile-routes.ts`, `packages/orchestration/src/setup-agent.ts`, `packages/orchestration/src/service.ts`, `web/src/components/app/profile-settings.tsx`, `web/src/app/app/settings/profile/page.tsx`
- [x] Design it (spec): `/architect setup agent and business profile`
- [x] Build it: `/develop setup agent and business profile`
  - [x] Persist `business_profiles` / `profile_entries` and profile REST + compile helper (AC-1, AC-5, AC-8)
  - [x] Setup gate + setup agent writes + minimum complete rules (AC-2, AC-3, AC-9)
  - [x] DeepSeek research confirm + sample tone path (AC-3, AC-4)
  - [x] Operator note injection, profile level confirm, Profile settings and chat gate UX (AC-5, AC-6, AC-7, AC-9)
- [x] Verify it: `/check verify setup agent and business profile`
- [x] Test it: `/test setup agent and business profile`

### 8. WhatsApp channel for agent chat · full

WhatsApp as the primary messaging add-on. Inbound messages trigger the operator agent; outbound sends drafts, approvals, and status. OAuth connect still uses a browser link sent in chat (product starts connect; MCP stores tokens).
**Done when:** a linked WhatsApp identity maps to one SaaS `userId`; the user can request a draft, approve a post, and receive publish confirmation without opening the web UI.
- [ ] Design it (spec): `/architect WhatsApp channel for agent chat`

### 9. Telegram channel for agent chat · medium

Telegram as a second messaging add-on. Same channel abstraction as WhatsApp where possible.
**Done when:** a linked Telegram identity maps to one SaaS `userId`; core operator flows (draft, approve, status) work at parity with WhatsApp for text-first interactions.
- [ ] Design it (spec): `/architect Telegram channel for agent chat`

### 10. Remaining web product surfaces · medium · in-progress

Chat workspace, connectors, review/preview aside, login, and the marketing landing already ship under Features 4, 5, 14 and `web/src/app/page.tsx`. This feature is no longer a greenfield web app. It covers the remaining operator surfaces that Slice 1 did not build.
**Done when:** a signed in user can manage a schedule view, business profile settings, and any standalone approval queue needed beyond the conversation scoped preview aside, without being forced onto messaging channels.
**Progress:** Profile settings already ship under Feature 7. Preview aside covers review. Spec 0010 calendar build landed (week grid, detail + live preview). Spec 0011 locks the Scheduled Posts list (`/app/scheduled`, sort/filter, 30 day windows, shared detail). Channels are out of this feature. Standalone approval queue stays out unless the aside proves insufficient later. Manual create form is deferred (from 0011).
**Spec:** [0010](../specs/0010-schedule-calendar/index.md) · [0011](../specs/0011-scheduled-posts-list/index.md)
- [x] Design it (spec): `/architect remaining web product surfaces`
- [x] Build it: `/develop remaining web product surfaces`
  - [x] MCP schedule contract + calendar list/accounts APIs (AC-2, AC-3, AC-4, AC-9, AC-10, AC-13)
  - [x] Slot detail mutations (get / reschedule / cancel) with ownership guards (AC-5, AC-6, AC-7, AC-8, AC-13)
  - [x] `/app/calendar` week UI, account sidebar, detail + preview, nav wiring (AC-1, AC-11, AC-12)
  - [x] Diff any automation calendar work to 0010; keep matches or rewrite; then close tests (AC-1 through AC-13)
  - [x] Shared projection + `GET /scheduled/posts` (30 day window, filters, sort, hasOlder/hasNewer) (0011 AC-2 to AC-5, AC-10, AC-14)
  - [x] `/app/scheduled` table UI, empty/error, Scheduled Posts nav, Week/List cross links (0011 AC-1, AC-6 to AC-9, AC-11 to AC-13)
- [ ] Verify it: `/check verify remaining web product surfaces`
- [ ] Test it: `/test remaining web product surfaces`

**Code:** `packages/orchestration/src/calendar.ts`, `packages/api/src/calendar-routes.ts`, `web/src/app/app/calendar/`, `web/src/app/app/scheduled/`, `web/src/components/app/schedule-calendar.tsx`, `web/src/components/app/schedule-detail.tsx`, `web/src/components/app/scheduled-posts-list.tsx`

## Slice 3: Memory and autonomy

### 11. Structured memory and correction loop · medium

User corrections become discrete rules in categorized product storage. Every generation pulls current rules. Pre-publish self-check runs against rules before go live.
**Done when:** a correction in chat or web updates stored rules in Postgres; the next draft reflects it; conflicting rules resolve with newer wins; rules do not live only in raw chat logs.
- [ ] Design it (spec): `/architect structured memory and correction loop`

### 12. Configurable publishing authority and image uploads · medium · done

Users choose Always draft, Approve for me, or Full access across conversations. Every automatic live post still requires explicit live wording and trusted review preflight. Private image uploads flow through chat, review, model vision, and SocialMCP without exposing storage keys.
**Done when:** publishing preferences are versioned and auditable; Full access requires explicit consent; authority is snapshotted per run; owned sanitized images can be attached and published; and a feature flag forces Always draft until R2, SocialMCP `connectedAt`, and live smoke checks are complete.
**Progress:** Done on cloud (Linear SOC-9). Schema, APIs, orchestration routing, composer attach, Settings mode control, review media, R2, and live image publish smoke complete; `PUBLISHING_AUTHORITY_ENABLED` enabled in cloud after smoke.
**Spec:** [0006](../specs/0006-publishing-authority-images/index.md)
**Code:** `packages/database/src/publishing.ts`, `packages/orchestration/src/publishing.ts`, `packages/api/src/publishing-routes.ts`, `packages/api/src/media-routes.ts`, `packages/api/src/media-storage.ts`, `web/src/components/app/publishing-mode-control.tsx`
- [x] Design it (spec): `/architect configurable publishing authority and image uploads`
- [x] Build it: `/develop configurable publishing authority and image uploads`
  - [x] Persist preferences, consent, audit events, authority snapshots, and normalized media
  - [x] Add guarded preference and private image upload APIs
  - [x] Route explicit automatic publishing through trusted review services
  - [x] Add composer, Settings, image, and review media UI
  - [x] Complete storage, vision, contract, and rollout checks (SOC-9)
- [x] Verify it: `/check verify configurable publishing authority and image uploads`
- [x] Test it: `/test configurable publishing authority and image uploads`

### 13. Intent clarify and Thinking UI · medium · done

When Approve for me or Full access cannot tell live publish from draft, ask instead of silently drafting. Chat shows safe progress **action labels** (and structured intent Q&A). Thesean extended think-stream UI was abandoned: the model route has no extended thinking, smoke failed, and the expandable Thinking disclosure was removed.
**Done when:** unclear intent never calls `prepare_review`; clarify copy is product owned; stream emits safe steps; web shows action labels (not Thesean think-log).
**Progress:** Intent clarify + action labels shipped (0007 amended). SOC-8 Thesean Thinking close-out **Canceled** (2026-08-09).
**Spec:** [0007](../specs/0007-intent-clarify-thinking-ui/index.md)
**Code:** `packages/database`, `packages/orchestration/src/publishing.ts`, `packages/orchestration/src/stream.ts`, `packages/api/src/orchestration-routes.ts`, `web/src/components/app/chat-workspace.tsx`, `web/src/components/app/workspace-provider.tsx`
- [x] Design it (spec): `/architect intent clarify and Thinking UI`
- [x] Build it: `/develop intent clarify and Thinking UI`
  - [x] Ternary intent + unclear clarify turn
  - [x] Action labels + NDJSON stream (Thesean think-stream removed)
  - [x] Web action labels + stream client + intent Q&A carousel
- [x] Verify it: `/check verify intent clarify and Thinking UI`
- [x] Test it: `/test intent clarify and Thinking UI`

### 14. Live platform preview aside · medium · done

Replace the chat draft log and review modal with a right hand aside that shows a faithful Threads, LinkedIn, and Instagram post preview. Users edit text and images in place, pick the account, and approve from that aside. After go live, the aside keeps a Live preview of what published. Videos stay deferred.
**Done when:** no View review launcher or modal remains; the aside auto opens for drafts and live outcomes; platform chrome matches the checked in references for text and images; Save and Approve use the existing trusted review APIs.
**Progress:** Done on cloud product path (Linear SOC-7). Aside is in use on the proven Tracer Bullet path (edit in aside → approve → live result). Code lives under `web/src/components/preview/*`; unit test `live-preview-aside.test.tsx` exists. Videos remain deferred. See `docs/specs/0008-live-platform-preview-aside/verify.md`.
**Spec:** [0008](../specs/0008-live-platform-preview-aside/index.md)
**Code:** `web/src/components/preview`, `web/src/components/app/chat-workspace.tsx`
- [x] Design it (spec): `/architect live platform preview aside`
- [x] Build it: `/develop live platform preview aside`
  - [x] Aside shell, auto open, remove modal launcher (AC-1, AC-2, AC-9, AC-11)
  - [x] Threads preview chrome plus in place edit, images, account, Save (AC-3, AC-4, AC-5, AC-6)
  - [x] Approve, Live state, validation in aside; LinkedIn and Instagram chrome (AC-7, AC-8, AC-12, AC-3, AC-4)
  - [x] Light mode token structure for later system dark (AC-10)
- [x] Verify it: `/check verify live platform preview aside`
- [x] Test it: `/test live platform preview aside`

### 15. Chat schedule loop · medium · in-progress

Operators can ask chat to schedule a post. The agent understands first, drafts via `prepare_review` when content is new, then calls SocialMCP `schedule_post` when when and intent are clear. Calendar and Scheduled Posts already display the result.
**Done when:** a signed in user can schedule at least one post through chat with a clear `publishAt`, see it on Calendar or Scheduled Posts, and never get a false “scheduled” claim on tool failure. Multi day series require an accepted plan before multiple schedule calls.
**Spec:** [0012](../specs/0012-chat-schedule-loop/index.md)
- [x] Design it (spec): `/architect chat schedule loop`
- [x] Build it: `/develop chat schedule loop`
  - [x] DB checks + `schedule_post` Zod/allowlist/MCP wiring (AC-1, AC-7, AC-8)
  - [x] Schedule intent + SYSTEM_MESSAGE + clarify UI + tests (AC-2 to AC-6, AC-9)
- [ ] Verify it: `/check verify chat schedule loop` (unit AC proof green; live SocialMCP smoke still open in [verify.md](../specs/0012-chat-schedule-loop/verify.md))
- [x] Test it: `/test chat schedule loop`

**Code:** `packages/orchestration/src/tools.ts`, `packages/orchestration/src/publishing.ts`, `packages/orchestration/src/service.ts`, `packages/database`

### 16. Autonomous schedule planner · medium · in-progress

When the operator asks chat to decide posting itself, orchestration builds a grounded context brief (profile, competitors, playbooks, cadence, calendar occupancy, heuristic times) and calls `schedule_post` in that turn. No background cron and no analytics ingest in this slice.
**Done when:** “decide for me / manage posting yourself” with a complete profile and connected accounts creates real SocialMCP schedules from the brief without a second acceptance turn; incomplete profile or missing connectors refuse clearly; live auto publish stays gated.
**Spec:** [0013](../specs/0013-autonomous-schedule-planner/index.md)
- [x] Design it (spec): `/architect autonomous schedule planner`
- [x] Build it: `/develop autonomous schedule planner`
  - [x] Playbooks + brief builder + timing heuristics (AC-3, AC-4, AC-8)
  - [x] Autonomy intent + service branch + refuse paths (AC-1, AC-2, AC-5, AC-6, AC-7)
  - [x] Stream planning label + tests + 0012 follow-up (AC-8)
- [ ] Verify it: `/check verify autonomous schedule planner`
- [ ] Test it: `/test autonomous schedule planner`

**Code:** `packages/orchestration/src/autonomy-brief.ts`, `packages/orchestration/src/platform-playbooks.ts`, `packages/orchestration/src/publishing.ts`, `packages/orchestration/src/service.ts`, `web/src/lib/product-api.ts`

## Deferred

Out of scope for the current build pass. Kept so the plan stays honest.

- **Operator-driven comment / mention handling**: product orchestration on top of MCP webhook ingestion · needs a decision · medium
- **Video and image generation pipeline**: async generation jobs and media storage · needs a decision · full (image upload/normalize already exists under Feature 12; generation does not)
- **Facebook Pages**: only after a SocialMCP adapter exists; do not build the adapter in this repo · needs a decision · full
- **Analytics and trend detection**: needs posting volume first · needs a decision · medium (login promo analytics cards are decoration only)
- **Payment provider integration**: follows subscription tier model spec · full
- **System dark mode**: product shell plus platform preview chrome · enrolled from 0008 follow-up · medium
- **Manual schedule create form**: empty state Create post stops linking only to Workspace · from spec 0011 · medium
- **Anything that belongs only in the open MCP repo**: adapters, token encryption, worker internals, MCP tool implementations

## Legend

**The decision box.** Every feature carries exactly one sub task whose label ends with `(spec)`. `/architect` owns that step.

**Feature lifecycle**

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | `/architect` at spec capture | `Design it` ticked; spec linked; `Build it` milestones; `Verify it` + `Test it` |
| `done` | `/test`, then `/sync` | all boxes ticked |
| `existing` / already done in SocialMCP | `/scope` context | listed only under “Already done in SocialMCP”; not a build task here |

**Next step** = `/check verify chat schedule loop` (Feature 15, [0012](../specs/0012-chat-schedule-loop/index.md)), then `/test`. Feature 10 calendar verify remains available in parallel. Channels (Feature 8/9) wait. Feature 6 tiers stay deferred.

**Weight `full`** = fresh model `/check review` warranted before merge.

**Approach** = Tracer Bullet for the whole product unless a feature tag says otherwise.

## References

### Project sources

- `docs/MASTER_PLAN.md` (product vision, agent roles, build order, risks)
- SocialMCP repo (external): MCP tools, OAuth, worker, execution DB, multi tenant JWT `sub` contract
- SocialMCP multi tenant identity: already shipped; SaaS must reuse the same `userId` string

### Practices and standards

- Repo split: product owns login, profiles, tiers, orchestration, channels, memory; MCP owns tokens, posts, schedules, publish (basis: hard split above)
- Tracer Bullet sequencing: prove connect → draft → approve → publish before channels and memory (basis: vertical slice ships real value early)
- Model decides, code executes: LLM returns tool calls; backend validates before SocialMCP and platform APIs (basis: MASTER_PLAN section 2)
- Postgres for hosted product data; MCP keeps its own execution DB (basis: concurrency and ownership boundaries)

### Links (web verified)

- [Implementing managed PostgreSQL for multi-tenant SaaS applications](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/welcome.html) (AWS Prescriptive Guidance)
- [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/) (Meta for Developers)
- [Telegram Bot API](https://core.telegram.org/bots/api) (Telegram)
- [Model Context Protocol architecture](https://modelcontextprotocol.io/docs/learn/architecture) (modelcontextprotocol.io)
)
