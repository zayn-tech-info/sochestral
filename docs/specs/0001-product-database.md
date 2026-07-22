# 0001. Product database (Postgres)

**Date**: 2026-07-17
**Status**: Proposed

## Summary

This decision puts hosted product data in Postgres for the private SaaS app. The first cut is a thin schema: product users (with a stable `userId` that SocialMCP sees as JWT `sub`) and review drafts the user must approve before publish. SocialMCP keeps tokens, posts, schedules, and publish logs in its own database. We use Drizzle ORM and migrate with drizzle-kit so later Slice 1 features can provision a user and run the review loop without inventing storage mid build.

## Context

The hosted product needs its own place for login identity, review state, and later profiles, tiers, channels, and memory. SocialMCP already stores execution data (connected accounts, tokens, posts, schedules, logs) and scopes every tool call by `userId`. Putting product tables into the MCP database would couple the future open source execution layer to private product concerns and break the repo split.

Slice 1 must prove one path: provision a user, connect accounts through MCP, draft, approve, then publish via MCP. Without product side draft and approval state, review before publish cannot live in the SaaS app. Building the full foundation schema (tiers, profiles, channels, memory) now would slow that path and invite unused tables.

The team already runs Postgres in Docker for local work. TypeScript and Drizzle are familiar from SocialMCP. Auth, orchestration, and the web UI are separate features; this feature only stands up durable product storage and a tiny local provision helper.

## Requirements

**User stories**:
- As a product engineer, I want a Postgres schema for SaaS users and review drafts so Slice 1 can provision a tenant and approve content before calling SocialMCP.
- As the orchestration layer (later), I want each user to have a stable opaque `userId` so MCP JWTs can use the same string as `sub`.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: Migrations create a `users` table whose primary key is an app generated opaque id (`user_…`) suitable to send as SocialMCP JWT `sub`.
- **AC-2**: Migrations create a `drafts` table owned by one `users.id`, with one platform per row, text body, optional `mediaUrls`, and status among `draft`, `approved`, `publish_requested`, `published`, `failed`.
- **AC-3**: A local provision helper (TypeScript function plus `pnpm` script) creates a user with optional email and prints `{ id, email, createdAt }`; it is not a public HTTP signup API. CLI email: positional arg wins over `PROVISION_EMAIL` env; blank or absent becomes `email: null` in JSON.
- **AC-4**: Duplicate email on provision fails with a stable mapped error (`EMAIL_TAKEN`), not a silent upsert and not only raw Postgres text. Email is trimmed and lowercased before insert and uniqueness checks.
- **AC-5**: Missing `DATABASE_URL` makes migrate and provision fail fast with an error that names `DATABASE_URL`.
- **AC-6**: Product schema does not store platform OAuth tokens, MCP posts/schedules/publish logs, or treat chat logs as the memory store.
- **AC-7**: Deleting a user cascades to that user’s drafts (no orphan draft rows).
- **AC-8**: Tests (and later writers) can create a draft with app generated `draft_…` id, default status `draft`, and read it back via `listDraftsByUserId(userId)` (full rows for that owner, newest `createdAt` first).

## Options considered

### Option 1: Tracer Bullet schema (`users` + `drafts` only)

Ship the minimum tables for Slice 1 review mode. Thicken with tiers, profiles, channels, and memory in later features.

**Pros**:
- Matches Tracer Bullet and unblocks the publish loop soon
- Avoids unused tables and premature product model lock in

**Cons**:
- Later features need more migrations
- No tier or profile columns until Slice 2

### Option 2: Full foundation schema in the first migration

Add users, profiles, tiers, channel links, memory, and drafts together.

**Pros**:
- One big design pass up front

**Cons**:
- Slows Slice 1
- Many empty tables and decisions that belong to later features

### Option 3: Identity only (`users` without drafts)

Defer draft storage until the review loop feature.

**Pros**:
- Smallest possible first migration

**Cons**:
- Review mode has nowhere to persist approval state in the product DB
- Splits the Tracer Bullet path across features without a clear win

## Decision

**Chosen option**: Option 1: Tracer Bullet schema (`users` + `drafts` only)

Host product data in Postgres with Drizzle ORM (`pgTable`, drizzle-kit generate/migrate), schema package at `packages/database`, connection via `DATABASE_URL`. Opaque ids use `nanoid` (default alphabet, length 21) with `user_` / `draft_` prefixes, so a full id looks like `user_` + 21 chars. Provision is a local helper and script only. Stack defaults for the build: stable `drizzle-orm` 0.x (not the v1 beta relations API), Postgres driver `postgres` (postgres.js) with a small pool, SQL column names in snake_case mapped to camelCase in TypeScript.

**Implementation skills**: `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.agents/skills/drizzle-orm-patterns/`) · `postgres-drizzle` (`ccheney/robust-skills`, `.agents/skills/postgres-drizzle/`)

## Rationale

Slice 1 fails without users and drafts; it does not need tiers or memory yet. Keeping product data out of SocialMCP preserves the private SaaS versus future OSS split and the shared `userId` contract. Drizzle matches team practice and keeps schema in TypeScript next to the app. A local provision helper proves the path without pretending auth is done. Allowed `platform` and `status` values are enforced with DB check constraints so raw test inserts cannot store junk; legal status transitions and non empty body checks stay in the review loop feature.

## Feature design

**Data model sketch**:

`users`
| Column | DB type | Required | Notes |
|---|---|---|---|
| `id` | text PK | yes | app: `user_` + nanoid(21); MCP JWT `sub` |
| `email` | text | no | unique when set; store trimmed lowercase |
| `created_at` | timestamptz | yes | DB default `now()`; exposed as `createdAt` |
| `updated_at` | timestamptz | yes | DB default `now()` on insert; app sets on update |

`drafts`
| Column | DB type | Required | Notes |
|---|---|---|---|
| `id` | text PK | yes | app: `draft_` + nanoid(21) on every insert |
| `user_id` | text FK → `users.id` ON DELETE CASCADE | yes | owner |
| `platform` | text | yes | check: `threads` \| `linkedin` \| `instagram` |
| `body` | text | yes | no DB length cap; non empty enforced in review loop |
| `media_urls` | text[] | no | URL list; null or empty = text only |
| `status` | text | yes | default `draft`; check: allowed status set |
| `last_error` | text | no | short error after failed publish |
| `mcp_post_id` | text | no | id from SocialMCP when known |
| `created_at` | timestamptz | yes | DB default `now()` |
| `updated_at` | timestamptz | yes | DB default `now()` on insert; app sets on update |

Indexes: unique on `users.email`; index on `drafts(user_id)`; index on `drafts(user_id, status)`.

Check constraints: `platform` in (`threads`, `linkedin`, `instagram`); `status` in (`draft`, `approved`, `publish_requested`, `published`, `failed`).

Out of scope tables: tiers, profiles, channel links, memory/rules, password hashes, soft delete columns, MCP execution tables.

**State transitions** (`drafts.status`):

`draft` → `approved` → `publish_requested` → `published`  
`publish_requested` → `failed` (keep row; set `last_error`)  
From `failed` → `draft` or `approved` (retry after edit; enforced in app when review loop lands)

New rows start at `draft` (DB default). Illegal jumps (for example `draft` → `published`) are rejected in application code by the review loop feature. This feature only constrains the allowed status strings in the DB.

**API surface** (no public HTTP in this feature):

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `provisionUser` | TS function | `email?: string` (trim+lowercase; empty → null) | `{ id, email, createdAt }` | local/dev only | `EMAIL_TAKEN`; missing `DATABASE_URL` |
| `pnpm` provision script | CLI | positional email arg, else `PROVISION_EMAIL`; blank/absent → null | prints JSON of the user | local/dev only | same as function |
| `listDraftsByUserId` | TS function (tests / later) | `userId: string` | full draft rows for that owner, newest `createdAt` first | local/package | none special |
| `insertDraft` (test helper ok) | TS function | `userId`, `platform`, `body`, optional `mediaUrls` | draft row with `id`, status `draft` | local/package | check constraint on bad platform/status |
| `drizzle-kit migrate` | CLI | `DATABASE_URL` | applied migrations | local/ops | missing `DATABASE_URL`; migration failure |

Review loop transition helpers are out of this feature’s ship list. This feature still ships id generation, `listDraftsByUserId`, and enough insert support for tests to prove **AC-2**, **AC-7**, **AC-8**.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| provisionUser | `id` | app: `user_` + nanoid(21, default alphabet) |
| provisionUser | `email` | optional input, trim+lowercase; blank → null |
| provisionUser | `createdAt` | DB `created_at` default `now()` |
| provisionUser | `updatedAt` (column) | DB `updated_at` default `now()` on insert |
| provision script | email input | CLI arg if present, else env `PROVISION_EMAIL`, else null |
| provisionUser duplicate | error | map unique violation → `EMAIL_TAKEN` |
| insertDraft / tests | `id` | app: `draft_` + nanoid(21, default alphabet) |
| insertDraft / tests | `status` | DB default `draft` (or explicit insert value `draft`) |
| insertDraft / tests | `createdAt` / `updatedAt` | DB defaults `now()` on insert |
| any update | `updatedAt` | app sets to now on update |
| listDraftsByUserId | draft rows | DB query `WHERE user_id = ?` order by `created_at` desc; all columns |
| migrate | `users` / `drafts` tables | this spec’s data model |
| (later review loop) | `status` transitions | app helpers; column `drafts.status` |
| (later review loop) | `lastError` | short message from MCP/publish failure |
| (later review loop) | `mcpPostId` | SocialMCP tool response when publish succeeds |
| (later review loop) | `body` non empty | caller input; enforced in review loop app code |
| (later review loop) | `mediaUrls` | optional caller input → `media_urls` |

**Key invariants**:
- Every `drafts.user_id` references an existing `users.id`.
- One draft targets exactly one platform.
- Product DB never holds platform OAuth tokens or MCP post/schedule/log tables.
- `users.id` is the only tenant key shared with SocialMCP (`sub`).
- Email uniqueness on canonical (trim+lowercase) form when email is present; duplicates raise `EMAIL_TAKEN`.
- `platform` and `status` values always match the check constraints.

**Security model**:
- Provision helper and migrate run on a trusted local or ops machine only. No public signup route here.
- Draft rows are owned by one user; `listDraftsByUserId` filters by that owner. Later HTTP APIs must scope by `userId` (auth feature).
- `DATABASE_URL` stays in env / `.env` and is never committed.

**Configuration required**:
- `DATABASE_URL`: Postgres connection string (local Docker example: `postgresql://USER:PASS@localhost:5433/sochestral`)
- `PROVISION_EMAIL` (optional): used by the provision script only when no positional email arg is passed

**Critical test scenarios**:
- Happy path: migrate on empty DB, provision a user, insert a draft, `listDraftsByUserId` returns it newest first, verifies **AC-1**, **AC-2**, **AC-3**, **AC-8**
- Failure case: provision two users with the same email (differing only by case/space) → second raises `EMAIL_TAKEN`; migrate/provision with `DATABASE_URL` unset → fail fast naming the var, verifies **AC-4**, **AC-5**
- Auth/permission: no public HTTP provision route is exposed by this feature (script/function only), verifies **AC-3**
- Cascade: delete user removes their drafts, verifies **AC-7**
- Boundary: schema package and migrations contain no token/post/schedule tables, verifies **AC-6**

## Build plan

Approach: Tracer Bullet (thin end to end proof: migrate → provision user → draft row exists).

1. Scaffold `packages/database` with Drizzle schema for `users` and `drafts` (defaults, check constraints, cascade), drizzle-kit config, and `DATABASE_URL` loading that fails fast if missing, satisfies **AC-1**, **AC-2**, **AC-5**, **AC-6**, **AC-7**
2. Generate and apply the first Postgres migration; document the local Docker URL on port `5433`, satisfies **AC-1**, **AC-2**, **AC-5**
3. Implement id helpers, `provisionUser` (canonical email + `EMAIL_TAKEN`), provision script (arg / `PROVISION_EMAIL`), `listDraftsByUserId`, and test insert path; add tests for provision, duplicate email, cascade delete, and draft insert/read, satisfies **AC-3**, **AC-4**, **AC-7**, **AC-8**
4. Smoke check against the running Docker Postgres (migrate + provision once), satisfies **AC-1**, **AC-3**, **AC-5**

## Consequences

**Positive**:
- Slice 1 has real product storage for identity and review state
- Clear boundary with SocialMCP execution data
- Drizzle schema is reusable by API, scripts, and later workers

**Negative / tradeoffs**:
- More migrations as Slice 2 and 3 add tables
- Status transition rules still wait on the review loop feature (only allowed values are constrained now)
- No password or session tables yet; auth is a follow on feature

**Neutral**:
- Local Docker Postgres on host port `5433` is the assumed dev database
- Root `AGENTS.md` still describes the SocialMCP monorepo stack; `/sync` should record Postgres + Drizzle for this SaaS repo and point at the new skills

## Follow-up

- [ ] `/sync` (or a later edit): root `AGENTS.md` should list Postgres + Drizzle for this SaaS repo and bullet `drizzle-orm-patterns` and `postgres-drizzle` under Agent skills
- [ ] Feature 2 (auth / session and MCP JWT issuance) adds login secrets and issues JWTs with `sub` = `users.id`
- [ ] Feature 5 (review mode publish loop) owns draft transition helpers, non empty body checks, and MCP publish wiring
- [ ] Slice 2+ migrations add tiers, profiles, channels, memory when those features are designed
)