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

## Progress snapshot (reconciled against code + Linear, 2026-08-07)

| Area | Reality |
|------|---------|
| Foundation (1 to 2) | Shipped: product schema on **Neon** Postgres, sessions, MCP JWT minting |
| Slice 1 core (3 to 5) | **Done.** Tracer Bullet path proven on the product URL (`https://app.sochestral.shop`): connect → chat → draft → preview aside → approve → SocialMCP publish → live result. Linear SOC-5 / SOC-6 / SOC-18 / SOC-19 Done |
| Slice 3 early (12 to 14) | Feature 14 **Done** (SOC-7). Feature 13 build + Thinking automated tests Done; cloud Thinking flag smoke still open (SOC-8). Feature 12 code + **R2 wired** in cloud; live smoke then `PUBLISHING_AUTHORITY_ENABLED` remains (SOC-9) |
| Slice 2 (6 to 10) | Not started. Feature 10 is narrowed: chat/connectors/preview already ship under 4/5/14 |
| Hosting | Fly apps `sochestral` (web) + `sochestral-api` (Hono); cloud SocialMCP; Neon as primary product DB. Local Docker Postgres on 5433 is for agent/dev only |

**Close out next (before Slice 2):** Feature 12 live smoke + enable `PUBLISHING_AUTHORITY_ENABLED` (SOC-9) → Feature 13 Thinking flag smoke (SOC-8). Free beta access; billing is parallel and not a beta gate.

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
| 6 | Subscription tier model | Slice 2 | planned |
| 7 | Setup agent and business profile | Slice 2 | planned |
| 8 | WhatsApp channel for agent chat | Slice 2 | in-progress |
| 9 | Telegram channel for agent chat | Slice 2 | planned |
| 10 | Remaining web product surfaces | Slice 2 | planned |
| 11 | Structured memory and correction loop | Slice 3 | planned |
| 12 | Configurable publishing authority and image uploads | Slice 3 | in-progress |
| 13 | Intent clarify and Thinking UI | Slice 3 | in-progress |
| 14 | Live platform preview aside | Slice 3 | done |
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

### 6. Subscription tier model · full

Define tiers and what each tier gates (platforms, post volume, channels, autonomy, generation features). Gate checks live in the product before orchestration assumes unlimited access. Payment provider integration is deferred.
**Done when:** tier definitions and gate checks are documented in a spec; orchestration can read a user's tier from Postgres and block or allow actions accordingly; payment provider work is explicitly out of this feature.
- [ ] Design it (spec): `/architect subscription tier model`

### 7. Setup agent and business profile · full

Separate setup agent turns plain language onboarding into structured profile data (tone, rules, cadence, skills, approval mode). Distinct from the operator agent that runs day to day. Profile lives in product Postgres, categorized — not one blob.
**Done when:** a new user can complete onboarding and the persisted structured profile drives content generation; sample post correction flow captures tone; profile categories are queryable, not a single opaque document.
- [ ] Design it (spec): `/architect setup agent and business profile`

### 8. WhatsApp channel for agent chat · full · in-progress

WhatsApp as the primary messaging add-on. Inbound messages trigger the operator agent; outbound sends drafts, approvals, and status. OAuth connect still uses a browser link sent in chat (product starts connect; MCP stores tokens).
**Done when:** a linked WhatsApp identity maps to one SaaS `userId`; the user can request a draft, approve a post, and receive publish confirmation without opening the web UI.
- [x] Design it (spec): `/architect WhatsApp channel for agent chat` → [SOC-15-spec.md](../specs/SOC-15-spec.md)
- [x] Build it: `/develop WhatsApp channel for agent chat`
  - [x] Schema, webhooks, link/unlink, orchestration bridge, approve/status, connect links, Settings entry
  - code in `packages/database/src/channels.ts`, `packages/api/src/whatsapp-*.ts`, `web/src/components/app/channels-settings.tsx`
- [ ] Verify it: `/check verify WhatsApp channel for agent chat`
- [x] Test it: `/test` (channel helpers, webhook/link routes, Settings UI)

### 9. Telegram channel for agent chat · medium

Telegram as a second messaging add-on. Same channel abstraction as WhatsApp where possible.
**Done when:** a linked Telegram identity maps to one SaaS `userId`; core operator flows (draft, approve, status) work at parity with WhatsApp for text-first interactions.
- [ ] Design it (spec): `/architect Telegram channel for agent chat`

### 10. Remaining web product surfaces · medium

Chat workspace, connectors, review/preview aside, login, and the marketing landing already ship under Features 4, 5, 14 and `web/src/app/page.tsx`. This feature is no longer a greenfield web app. It covers the remaining operator surfaces that Slice 1 did not build.
**Done when:** a signed in user can manage a schedule view, business profile settings, and any standalone approval queue needed beyond the conversation scoped preview aside, without being forced onto messaging channels.
**Progress:** Partially delivered elsewhere. No schedule view, profile settings, or dedicated approval queue routes yet. Design this as the gap list, not a second chat product.
- [ ] Design it (spec): `/architect remaining web product surfaces`

## Slice 3: Memory and autonomy

### 11. Structured memory and correction loop · medium

User corrections become discrete rules in categorized product storage. Every generation pulls current rules. Pre-publish self-check runs against rules before go live.
**Done when:** a correction in chat or web updates stored rules in Postgres; the next draft reflects it; conflicting rules resolve with newer wins; rules do not live only in raw chat logs.
- [ ] Design it (spec): `/architect structured memory and correction loop`

### 12. Configurable publishing authority and image uploads · medium · in-progress

Users choose Always draft, Approve for me, or Full access across conversations. Every automatic live post still requires explicit live wording and trusted review preflight. Private image uploads flow through chat, review, model vision, and SocialMCP without exposing storage keys.
**Done when:** publishing preferences are versioned and auditable; Full access requires explicit consent; authority is snapshotted per run; owned sanitized images can be attached and published; and a feature flag forces Always draft until R2, SocialMCP `connectedAt`, and live smoke checks are complete.
**Progress:** Schema, APIs, orchestration routing, composer attach, Settings mode control, and review media wiring exist (migrations `0004` to `0006`). **Cloudflare R2 is fully wired** in the cloud product env (SOC-9). `.env.example` still leaves R2 empty and `PUBLISHING_AUTHORITY_ENABLED=false` / `THESEAN_VISION_ENABLED=false` for local defaults. Remaining: coordinated live image publish smoke on the product URL, then enable `PUBLISHING_AUTHORITY_ENABLED`.
**Spec:** [0006](../specs/0006-publishing-authority-images/index.md)
**Code:** `packages/database/src/publishing.ts`, `packages/orchestration/src/publishing.ts`, `packages/api/src/publishing-routes.ts`, `packages/api/src/media-routes.ts`, `packages/api/src/media-storage.ts`, `web/src/components/app/publishing-mode-control.tsx`
- [x] Design it (spec): `/architect configurable publishing authority and image uploads`
- [ ] Build it: `/develop configurable publishing authority and image uploads`
  - [x] Persist preferences, consent, audit events, authority snapshots, and normalized media
  - [x] Add guarded preference and private image upload APIs
  - [x] Route explicit automatic publishing through trusted review services
  - [x] Add composer, Settings, image, and review media UI
  - [ ] Complete storage, vision, contract, and rollout checks (R2 wired in cloud; vision smoke + SocialMCP `connectedAt` + enable flag still pending on SOC-9)
- [ ] Verify it: `/check verify configurable publishing authority and image uploads`
- [ ] Test it: `/test configurable publishing authority and image uploads`

### 13. Intent clarify and Thinking UI · medium · in-progress

When Approve for me or Full access cannot tell live publish from draft, ask instead of silently drafting. Chat shows a Thinking disclosure with safe step labels and optional Thesean model reasoning over NDJSON streaming.
**Done when:** unclear intent never calls `prepare_review`; clarify copy is product owned; stream emits safe steps and sanitized thinking; web shows an expandable Thinking control.
**Progress:** Build is complete in code (migration `0007`, ternary intent, clarify turn, stream events, Thinking disclosure). Intent clarify that blocks silent drafts is part of the working cloud chat path. Automated Thinking / stream close out tests for SOC-8 are landed. **Thinking flag note:** cloud `THESEAN_THINKING_ENABLED` still needs operator smoke + Fly secret record (or intentional delay). See `docs/specs/SOC-8-spec.md` and `docs/specs/0007-intent-clarify-thinking-ui/verify.md`.
**Spec:** [0007](../specs/0007-intent-clarify-thinking-ui/index.md) · close out [SOC-8](../specs/SOC-8-spec.md)
**Code:** `packages/database`, `packages/orchestration/src/publishing.ts`, `packages/orchestration/src/stream.ts`, `packages/api/src/orchestration-routes.ts`, `web/src/components/app/chat-workspace.tsx`, `web/src/components/app/workspace-provider.tsx`
- [x] Design it (spec): `/architect intent clarify and Thinking UI`
- [x] Build it: `/develop intent clarify and Thinking UI`
  - [x] Ternary intent + unclear clarify turn
  - [x] Thinking persist + Thesean flag
  - [x] NDJSON stream with step and thinking events
  - [x] Web Thinking disclosure + stream client
- [ ] Verify it: `/check verify intent clarify and Thinking UI`
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

## Deferred

Out of scope for the current build pass. Kept so the plan stays honest.

- **Operator-driven comment / mention handling**: product orchestration on top of MCP webhook ingestion · needs a decision · medium
- **Video and image generation pipeline**: async generation jobs and media storage · needs a decision · full (image upload/normalize already exists under Feature 12; generation does not)
- **Facebook Pages**: only after a SocialMCP adapter exists; do not build the adapter in this repo · needs a decision · full
- **Analytics and trend detection**: needs posting volume first · needs a decision · medium (login promo analytics cards are decoration only)
- **Payment provider integration**: follows subscription tier model spec · full
- **System dark mode**: product shell plus platform preview chrome · enrolled from 0008 follow-up · medium
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

**Next step** = finish Feature 12 live smoke + enable authority flag (SOC-9), then Feature 13 Thinking flag smoke (SOC-8). After that, lowest numbered `planned` feature is Feature 6 (`/architect subscription tier model`).

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
