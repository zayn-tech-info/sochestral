# Scope: SocialMCP Product

An AI social media manager for non technical business owners. They talk in plain language (web UI or optional messaging apps). The agent drafts, schedules, and publishes through official platform APIs. This monorepo holds the SocialMCP execution layer (MCP tools, adapters, worker) and the hosted product we build on top of it.

**Build approach:** Tracer Bullet (prove one real path through every layer before widening scope).
**Weight profile:** multi tenant, orchestration, and Instagram are `full`; subscription tier design is `full`; most channel and agent features are `medium`.

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | SocialMCP core layer | Foundation | existing |
| 2 | MCP reliability and platform safety fixes | Foundation | existing |
| 3 | Multi tenant identity and data isolation | Foundation | done |
| 4 | Product database for hosted SaaS | Foundation | planned |
| 5 | Orchestration backend skeleton | Slice 1 | planned |
| 6 | Thin web OAuth and account connect | Slice 1 | planned |
| 7 | Instagram publish adapter | Slice 1 | done |
| 8 | Review mode publish loop | Slice 1 | planned |
| 9 | Subscription tier model | Slice 2 | planned |
| 10 | Setup agent and business profile | Slice 2 | planned |
| 11 | WhatsApp channel for agent chat | Slice 2 | planned |
| 12 | Telegram channel for agent chat | Slice 2 | planned |
| 13 | Web product UI | Slice 2 | planned |
| 14 | Structured memory and correction loop | Slice 3 | planned |
| 15 | Autonomous mode and trust threshold | Slice 3 | planned |
| 16 | Platform webhooks and comment handling | Deferred | partial (Threads + Instagram webhooks ingested; autonomous reply deferred) |
| 17 | Video and image generation pipeline | Deferred | planned |
| 18 | Facebook Pages adapter | Deferred | planned |
| 19 | Analytics and trend detection | Deferred | planned |
| 20 | Selective open source release | Deferred | planned |

## Foundation (existing)

### 1. SocialMCP core layer · existing

MCP server, platform adapters, OAuth callback API, CLI, worker, shared packages. Developers can plug agents into social tools today in local BYOA mode.
**Done when:** already shipped for Threads (full Meta API) and LinkedIn Personal (self-serve publish + engage).
code in `apps/mcp-server/`, `apps/worker/`, `apps/api/`, `packages/adapters/`

### 2. MCP reliability and platform safety fixes · existing

Per platform text composition, publish preview, worker retry backoff, adapter registry, publishability guards, account resolution, and related regression tests.
**Done when:** BUG_FIX_PLAN items 1, 2, 3, 5, 6 complete; code review fixes verified by tests.
code in `apps/mcp-server/src/tools/`, `packages/adapters/src/registry.ts`, `apps/worker/src/`

## Foundation (to build)

### 3. Multi tenant identity and data isolation · full · done

Replace `user_local_default` with real per user context on every tool call, OAuth session, post, schedule, and publish log. Prerequisite for the hosted product and for Instagram at scale.
**Done when:** every data row and tool handler resolves `userId` from authenticated context; two users cannot read or publish to each other's accounts; local BYOA dev mode still works with an explicit dev user.
**Spec:** [0005](../specs/0005-multi-tenant-identity.md)
**Code:** `apps/mcp-server/src/lib/context.ts`, `packages/database/src/schema.ts`, `packages/oauth/`, `apps/api/`, `apps/worker/`
- [x] Design it (spec): `/architect multi tenant identity and data isolation`
- [x] Build it: /develop multi tenant identity and data isolation
  - [x] Migration: users.status + oauth_sessions.userId (AC-1, AC-3)
  - [x] ToolContext userId + JWT helpers + local env identity (AC-1, AC-6)
  - [x] Scope MCP/OAuth/worker queries by userId (AC-2, AC-3, AC-4)
  - [x] Two user isolation tests + BYOA regression (AC-5)
- [x] Verify it: /check verify multi tenant identity and data isolation
- [x] Test it: /test multi tenant identity and data isolation

### 4. Product database for hosted SaaS · needs a decision

Hosted product data (users, business profiles, memory rules, subscription tier, channel links) lives on a server grade database. The open MCP dev path can keep SQLite for local use.
**Done when:** product schema runs on the hosted database; migrations apply cleanly; Drizzle (or chosen layer) supports both local SQLite for core dev and hosted Postgres for the product without duplicating business logic.
**Note:** Postgres is the right choice for the SaaS product (concurrent users, backups, growth). SQLite stays fine for single machine BYOA and local MCP development. Do not run multi tenant hosted SaaS on SQLite alone.
- [ ] Design it (spec): `/architect product database for hosted SaaS`

## Slice 1: Core publish loop

Thin but real path: sign up (or provision user) → connect Threads, LinkedIn, and Instagram via web OAuth → agent drafts a post → user approves in review mode → SocialMCP publishes → result logged. No messaging channels or long term memory in this slice yet.

### 5. Orchestration backend skeleton · full

Backend that loads user context, calls the LLM with a fixed SocialMCP tool set, validates tool args, and executes through the MCP layer. Model decides; code executes.
**Done when:** one authenticated API path can invoke `validate_post` and `publish_now` for a real tenant user without touching `user_local_default`.
- [ ] Design it (spec): `/architect orchestration backend skeleton`

### 6. Thin web OAuth and account connect · medium

Minimal web surface for platform OAuth consent. Users can start connect from the product UI. Same link pattern will later be sent through messaging bots. Not a full dashboard yet.
**Done when:** a tenant user can connect Threads, LinkedIn Personal, and Instagram through managed builder OAuth apps; tokens store encrypted per user; connect status is visible to the orchestration layer.
- [ ] Design it (spec): `/architect thin web OAuth and account connect`

### 7. Instagram publish adapter · full · done

Instagram Graph via Facebook Login for business or creator accounts: IMAGE / VIDEO / REELS / CAROUSEL / STORIES publish, media+comment management, insights, limits, and webhooks.
**Done when:** MCP publish and management tools work for a connected Instagram account; capability flags match Graph surface (excluding DMs/shopping/Pages).
**Specs:** [0001](../specs/0001-instagram-publish-adapter.md) (v1 image), [0004](../specs/0004-instagram-full-graph.md) (full Graph)
**Code:** `packages/adapters/src/meta/instagram*.ts`, `apps/api/src/routes/oauth.ts`, `apps/api/src/routes/webhooks-instagram.ts`, `apps/mcp-server/src/lib/platforms.ts`, `apps/worker/src/process-due.ts`
- [x] Design it (spec): `/architect Instagram publish adapter` + full Graph expansion
- [x] Build it: image Tracer Bullet + VIDEO/REELS/carousel/Stories + management MCP + webhooks
- [x] Verify/test: unit + MCP mocked Graph routing

### 8. Review mode publish loop · medium

Default for new users: agent generates a draft, user approves or edits, then publish runs. No silent auto publish in this slice.
**Done when:** a tenant user can approve a draft and publish to Threads, LinkedIn, and Instagram in one flow; publish results appear in post status; failed publishes surface a clear error to the user.
- [ ] Design it (spec): `/architect review mode publish loop`

## Slice 2: Onboarding, channels, and tiers

Users can manage the product through web UI or optional messaging apps. Neither channel is mandatory.

### 9. Subscription tier model · full

Define tiers and what each tier gates (platforms, post volume, channels, autonomy, generation features). Billing integration comes later; rules exist before features assume unlimited access.
**Done when:** tier definitions and gate checks are documented in a spec; orchestration can read a user's tier and block or allow actions accordingly; payment provider integration is explicitly deferred.
- [ ] Design it (spec): `/architect subscription tier model`

### 10. Setup agent and business profile · full

Separate setup agent turns plain language onboarding into structured profile data (tone, rules, cadence, skills, approval mode). Distinct from the operator agent that runs day to day.
**Done when:** a new user can complete onboarding and persisted structured profile drives content generation; sample post correction flow captures tone; profile is categorized not one blob.
- [ ] Design it (spec): `/architect setup agent and business profile`

### 11. WhatsApp channel for agent chat · full

WhatsApp as the primary messaging add on for business owners. Inbound messages trigger the operator agent; outbound sends drafts, approvals, and status. OAuth connect still uses a browser link sent in chat.
**Done when:** a linked WhatsApp user maps to one tenant user; they can request a draft, approve a post, and receive publish confirmation without opening the web UI.
- [ ] Design it (spec): `/architect WhatsApp channel for agent chat`

### 12. Telegram channel for agent chat · medium

Telegram as a second messaging add on. Same channel abstraction as WhatsApp where possible. Useful for testing and users who prefer Telegram.
**Done when:** a linked Telegram user maps to one tenant user; core operator flows (draft, approve, status) work parity with WhatsApp for text first interactions.
- [ ] Design it (spec): `/architect Telegram channel for agent chat`

### 13. Web product UI · medium

Web UI for users who prefer a browser. Coexists with messaging channels. Covers connect, drafts, approval queue, schedule view, and profile settings. Not required for every action once channels exist.
**Done when:** a user can complete the same core operator flows on web as on WhatsApp without being forced to use messaging.
- [ ] Design it (spec): `/architect web product UI`

## Slice 3: Memory and autonomy

### 14. Structured memory and correction loop · medium

User corrections become discrete rules in categorized storage. Every generation pulls current rules. Pre publish self check runs against rules before go live.
**Done when:** a correction in chat or web updates stored rules; the next draft reflects it; conflicting rules resolve with newer wins; rules do not live only in raw chat logs.
- [ ] Design it (spec): `/architect structured memory and correction loop`

### 15. Autonomous mode and trust threshold · medium

Review mode remains default. Users unlock autonomous publish after a trust threshold (progress toward 100%). User is notified and can opt in or stay in review mode.
**Done when:** trust score increases from successful reviewed publishes; at threshold user gets an explicit opt in prompt; autonomous mode respects tier gates and memory rules.
- [ ] Design it (spec): `/architect autonomous mode and trust threshold`

## Deferred

Out of scope for the current build pass. Kept so the plan stays honest.

- **Platform webhooks and comment handling**: comment and mention triggers for operator agent · needs a decision · medium
- **Video and image generation pipeline**: async generation jobs and media storage · needs a decision · full
- **Facebook Pages adapter**: after Instagram and multi tenant are stable · needs a decision · full
- **Analytics and trend detection**: needs posting volume first · needs a decision · medium
- **Selective open source release**: product first; open source core packages later when stable · not a current priority
- **Management tool schema generalization**: BUG_FIX_PLAN item 4; fold into platform expansion · lean
- **Payment provider integration**: follows subscription tier model spec · full

## Legend

**The decision box.** Every feature carries exactly one sub task whose label ends with `(spec)`. `/architect` owns that step.

**Feature lifecycle**

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | `/architect` at spec capture | `Design it` ticked; spec linked; `Build it` milestones; `Verify it` + `Test it` |
| `done` | `/test`, then `/sync` | all boxes ticked |
| `existing` | `/scope` brownfield | shipped before this workflow; no task list |

**Next step** = the first unticked box on the lowest numbered `planned` feature.

**Weight `full`** = fresh model `/check review` warranted before merge.

**Approach** = Tracer Bullet for the whole project unless a feature tag says otherwise.

## References

### Project sources

- `docs/MASTER_PLAN.md` (product vision, agent roles, build order, risks)
- `docs/BUG_FIX_PLAN(1).md` (completed MCP fixes and deferred schema item)
- `README.md` (current SocialMCP core capabilities and BYOA model)

### Practices and standards

- Foundations before features: multi tenant before Instagram scale and messaging (basis: your MASTER_PLAN section 3 and section 9)
- Tracer Bullet sequencing: prove connect → draft → approve → publish before channels and memory (basis: vertical slice ships real value early)
- Model decides, code executes: LLM returns tool calls; backend validates before platform APIs (basis: MASTER_PLAN section 2)
- Postgres for hosted multi tenant SaaS; SQLite for local single user MCP dev (basis: production database concurrency and ops requirements)

### Links (web verified)

- [Implementing managed PostgreSQL for multi-tenant SaaS applications](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/welcome.html) (AWS Prescriptive Guidance)
- [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/) (Meta for Developers)
- [Telegram Bot API](https://core.telegram.org/bots/api) (Telegram)
- [Instagram content publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing) (Meta for Developers)
- [Model Context Protocol architecture](https://modelcontextprotocol.io/docs/learn/architecture) (modelcontextprotocol.io)
