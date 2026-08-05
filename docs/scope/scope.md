# Scope: Hosted SaaS Product

An AI social media manager for non technical business owners. They talk in plain language (web UI and optional WhatsApp / Telegram). The agent drafts, schedules, and publishes through official platform APIs. Users start in review-before-publish mode and can later unlock more autonomy.

**This repo** is the private hosted product. **SocialMCP** lives in a separate repository (future OSS) and is an **external dependency** this product calls. Do not fork MCP adapters, OAuth token storage, or the publish worker into this repo.

**Build approach:** Tracer Bullet (prove one real path through every layer before widening scope).
**First vertical path:** provision user → connect accounts → agent drafts → user approves → SocialMCP publishes → show result.
**Weight profile:** product database, auth/JWT, and orchestration are `full`; subscription tier design is `full`; most channel and agent features are `medium`.

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
| 4 | Sochestral chat workspace and connectors UI | Slice 1 | in-progress |
| 5 | Review mode publish loop | Slice 1 | in-progress |
| 6 | Subscription tier model | Slice 2 | planned |
| 7 | Setup agent and business profile | Slice 2 | planned |
| 8 | WhatsApp channel for agent chat | Slice 2 | planned |
| 9 | Telegram channel for agent chat | Slice 2 | planned |
| 10 | Web product UI | Slice 2 | planned |
| 11 | Structured memory and correction loop | Slice 3 | planned |
| 12 | Configurable publishing authority and image uploads | Slice 3 | in-progress |
| 13 | Intent clarify and Thinking UI | Slice 3 | in-progress |
| — | Operator comment/mention handling | Deferred | planned |
| — | Video and image generation pipeline | Deferred | planned |
| — | Facebook Pages (after MCP adapter exists) | Deferred | planned |
| — | Analytics and trends | Deferred | planned |
| — | Payment provider integration | Deferred | planned |

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

Thin but real path: provision user → connect Threads, LinkedIn, and Instagram via web OAuth (product starts connect; **MCP stores tokens**) → agent drafts a post → user approves in review mode → SocialMCP publishes → result shown. No messaging channels or long term memory in this slice yet.

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

### 4. Sochestral chat workspace and connectors UI · medium · in-progress

First authenticated product experience with a quiet light chat workspace and Settings connectors. The existing orchestration path powers chat. Connect flow hands off to SocialMCP OAuth, and tokens remain in the MCP execution DB. Approval, live publishing, calendar, profile, and analytics remain later features.
**Done when:** a tenant user can create and continue safe orchestration chats, manage conversation history, start connect for Threads, LinkedIn Personal, and Instagram from Settings, and see live connector status without product code storing OAuth tokens.
**Spec:** [0004](../specs/0004-chat-connectors-ui/index.md)
**Code:** `web/src/app/app`, `web/src/components/app`, `packages/api/src/connector-routes.ts`, `packages/orchestration/src/connectors.ts`; SocialMCP `apps/api/src/routes/oauth.ts`
- [x] Design it (spec): `/architect Sochestral chat workspace and connectors UI`
- [x] Build it: `/develop Sochestral chat workspace and connectors UI`
  - [x] Add the tenant scoped connector API and safe SocialMCP contract
  - [x] Build the responsive authenticated chat workspace
  - [x] Build Settings connectors and OAuth return handling
  - [x] Redesign login and finish the Sochestral visual system
  - [x] Simplify the workspace, remove the right context rail, and move connector state fully into Settings
  - [x] Add polished product motion, reduced motion behavior, and reliable local preview startup
  - [x] Render safe Markdown formatting in assistant chat messages
- [ ] Verify it: `/check verify Sochestral chat workspace and connectors UI`
- [x] Test it: `/test Sochestral chat workspace and connectors UI`

### 5. Review mode publish loop · medium · in-progress

Default for new users: agent generates a draft in the product, user approves or edits, then publish runs through SocialMCP. No silent auto publish in this slice.
**Done when:** a tenant user can approve a draft and publish to Threads, LinkedIn, and Instagram in one flow via MCP; publish results (or clear failures) appear in the product UI.
**Spec:** [0005](../specs/0005-review-mode-publish-loop/index.md)
**Code:** `packages/database/src/review.ts`, `packages/orchestration/src/review.ts`, `packages/api/src/review-routes.ts`, `web/src/components/app/review-group.tsx`; SocialMCP `apps/mcp-server/src/tools/service.ts`
- [x] Design it (spec): `/architect review mode publish loop`
- [x] Build it: `/develop review mode publish loop`
  - [x] Migrate product review drafts and immutable publish attempts
  - [x] Prove the Threads prepare, edit, approve, publish, and restore path
  - [x] Add SocialMCP idempotency, replay, unknown recovery, and rate safety
  - [x] Widen grouped execution and modal review UI to all three platforms
- [ ] Verify it: `/check verify review mode publish loop`
- [ ] Test it: `/test review mode publish loop`

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

### 8. WhatsApp channel for agent chat · full

WhatsApp as the primary messaging add-on. Inbound messages trigger the operator agent; outbound sends drafts, approvals, and status. OAuth connect still uses a browser link sent in chat (product starts connect; MCP stores tokens).
**Done when:** a linked WhatsApp identity maps to one SaaS `userId`; the user can request a draft, approve a post, and receive publish confirmation without opening the web UI.
- [ ] Design it (spec): `/architect WhatsApp channel for agent chat`

### 9. Telegram channel for agent chat · medium

Telegram as a second messaging add-on. Same channel abstraction as WhatsApp where possible.
**Done when:** a linked Telegram identity maps to one SaaS `userId`; core operator flows (draft, approve, status) work at parity with WhatsApp for text-first interactions.
- [ ] Design it (spec): `/architect Telegram channel for agent chat`

### 10. Web product UI · medium

Web UI for users who prefer a browser. Coexists with messaging channels. Covers connect, drafts, approval queue, schedule view, and profile settings. Not required for every action once channels exist.
**Done when:** a user can complete the same core operator flows on web as on WhatsApp without being forced to use messaging.
- [ ] Design it (spec): `/architect web product UI`

## Slice 3: Memory and autonomy

### 11. Structured memory and correction loop · medium

User corrections become discrete rules in categorized product storage. Every generation pulls current rules. Pre-publish self-check runs against rules before go live.
**Done when:** a correction in chat or web updates stored rules in Postgres; the next draft reflects it; conflicting rules resolve with newer wins; rules do not live only in raw chat logs.
- [ ] Design it (spec): `/architect structured memory and correction loop`

### 12. Configurable publishing authority and image uploads · medium · in-progress

Users choose Always draft, Approve for me, or Full access across conversations. Every automatic live post still requires explicit live wording and trusted review preflight. Private image uploads flow through chat, review, model vision, and SocialMCP without exposing storage keys.
**Done when:** publishing preferences are versioned and auditable; Full access requires explicit consent; authority is snapshotted per run; owned sanitized images can be attached and published; and a feature flag forces Always draft until R2, SocialMCP `connectedAt`, and live smoke checks are complete.
**Spec:** [0006](../specs/0006-publishing-authority-images/index.md)
**Code:** `packages/database`, `packages/orchestration`, `packages/api`, `web/src/components/app`; SocialMCP connector contract
- [x] Design it (spec): `/architect configurable publishing authority and image uploads`
- [ ] Build it: `/develop configurable publishing authority and image uploads`
  - [x] Persist preferences, consent, audit events, authority snapshots, and normalized media
  - [x] Add guarded preference and private image upload APIs
  - [x] Route explicit automatic publishing through trusted review services
  - [x] Add composer, Settings, image, and review media UI
  - [ ] Complete storage, vision, contract, and rollout checks
- [ ] Verify it: `/check verify configurable publishing authority and image uploads`
- [ ] Test it: `/test configurable publishing authority and image uploads`

### 13. Intent clarify and Thinking UI · medium · in-progress

When Approve for me or Full access cannot tell live publish from draft, ask instead of silently drafting. Chat shows a Thinking disclosure with safe step labels and optional Thesean model reasoning over NDJSON streaming.
**Done when:** unclear intent never calls `prepare_review`; clarify copy is product owned; stream emits safe steps and sanitized thinking; web shows an expandable Thinking control.
**Spec:** [0007](../specs/0007-intent-clarify-thinking-ui/index.md)
**Code:** `packages/database`, `packages/orchestration`, `packages/api`, `web/src/components/app`
- [x] Design it (spec): `/architect intent clarify and Thinking UI`
- [ ] Build it: `/develop intent clarify and Thinking UI`
  - [x] Ternary intent + unclear clarify turn
  - [x] Thinking persist + Thesean flag
  - [x] NDJSON stream with step and thinking events
  - [x] Web Thinking disclosure + stream client
- [ ] Verify it: `/check verify intent clarify and Thinking UI`
- [ ] Test it: `/test intent clarify and Thinking UI`

## Deferred

Out of scope for the current build pass. Kept so the plan stays honest.

- **Operator-driven comment / mention handling**: product orchestration on top of MCP webhook ingestion · needs a decision · medium
- **Video and image generation pipeline**: async generation jobs and media storage · needs a decision · full
- **Facebook Pages**: only after a SocialMCP adapter exists; do not build the adapter in this repo · needs a decision · full
- **Analytics and trend detection**: needs posting volume first · needs a decision · medium
- **Payment provider integration**: follows subscription tier model spec · full
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

**Next step** = the first unticked box on the lowest numbered `planned` feature.

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
`)
