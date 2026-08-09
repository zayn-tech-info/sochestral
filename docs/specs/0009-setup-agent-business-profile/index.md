# 0009. Setup agent and business profile

**Date**: 2026-08-08
**Status**: Accepted

## Summary

Sochestral adds a forced setup agent that turns plain language onboarding into a structured business profile in product Postgres. Categories stay queryable rows, not one opaque document. A basic settings page lets the user see and edit what was stored. When setup is complete, every operator chat turn injects a compiled profile note so drafts match the business.

## Requirements

**User stories**:

- As a new business owner, I want the product to require me to describe my business before normal operator chat so that Sochestral knows who I am before it drafts.
- As a business owner, I want sample posts I can correct during setup so that tone rules come from real examples, not abstract adjectives.
- As a business owner, I want the agent to research likely competitors after I name and describe the business, then confirm which ones are real, so that the profile starts with useful market context.
- As a business owner, I want to open Profile settings, read the compiled note and each category, and edit anything wrong, so that the stored profile stays accurate.
- As a product engineer, I want the operator agent to load active profile data on every turn after setup so that generation is driven by Postgres, not chat history alone.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: Migrations create `business_profiles` (one row per user) and `profile_entries` (many per user) owned by `users.id` with `ON DELETE CASCADE`. Ids use app prefixes `bprof_` and `pentry_` plus nanoid(21).
- **AC-2**: When `SETUP_AGENT_ENABLED` is true and `setup_status` is not `complete`, every chat turn (any conversation) uses the setup agent path. Operator publish tools and live publish are unavailable until the minimum profile is complete. When the flag is false, the gate does not block operator chat.
- **AC-3**: Setup chat persists `business_name`, `business_description`, and categorized `profile_entries`. The tone path generates sample posts, captures user corrections, and writes at least one active `tone` entry before the gate can clear.
- **AC-4**: After name and description, a product owned DeepSeek research step may propose competitor candidates as `proposed` entries. The chat presents them through `intent_questions` (select true ones; Custom when none fit). Confirming answers set selected entries to `active` and others to `rejected`. If DeepSeek is unconfigured or errors, setup continues with manual competitor entry or an explicit skip and does not hard fail the gate.
- **AC-5**: Authenticated `GET /profile` returns identity fields, structured sections of entries, and a server compiled note from the profile plus **active** entries. Profile settings can PATCH identity fields and create, update, archive, or delete owned entries. The UI shows the same categories the model uses.
- **AC-6**: When `setup_status` is `complete`, every operator orchestration turn compiles active profile data and injects that note into model context before the model runs. No client header is required.
- **AC-7**: Mid conversation profile updates in Feature 7 apply only to clear profile level changes (for example a business pivot) and only after an explicit user confirm. Draft style corrections such as "no emojis" are out of scope (Feature 11). Feature 12 remains the source of truth for publishing authority.
- **AC-8**: All profile reads and writes are scoped to the session user. DeepSeek requests receive only business name, description, website, and industry (no OAuth tokens, MCP secrets, or platform account tokens). Entry writes redact obvious secret shaped strings.
- **AC-9**: The minimum gate clear requires business name, business description, a competitor decision (at least one active `competitor` entry or an explicit skip recorded on the profile step), and at least one active `tone` entry. Redo setup from Settings or chat sets `setup_status` to `in_progress` without wiping active entries unless the user confirms a reset. Setup may deep link to existing connectors; OAuth tokens stay in SocialMCP.

## Decision

**Chosen option**: Forced setup agent with categorized Postgres profile, settings edit surface, DeepSeek research confirm, and operator note injection

Ship a global setup gate on `business_profiles.setup_status`, a setup model route through Thesean (`ship-like/claude-opus-5` by default), structured `profile_entries` by closed category, and a compile at read time note for both the operator model and settings. Reuse existing chat routes and the `intent_questions` carousel for competitor confirm.

Chat UX is conversational: the web composer does not show a forced-setup banner. The server gate still routes incomplete profiles to the setup agent; the model introduces Sochestral, asks about the business, and steers digressions back with one bold closing question.

**Implementation skills**: `drizzle-orm-patterns` (`.agents/skills/drizzle-orm-patterns/`) · `postgres-drizzle` (`.agents/skills/postgres-drizzle/`) · `hono` (`.agents/skills/hono/`)

## Rationale

Reasoning and options: see [rationale.md](./rationale.md).

## Feature design

**Data model sketch**:

`business_profiles` (1:1 with `users`)

| Column | DB type | Required | Notes |
|---|---|---|---|
| `id` | text PK | yes | `bprof_` + nanoid(21) |
| `user_id` | text FK → `users.id` ON DELETE CASCADE | yes | unique |
| `business_name` | text | no until name step | required for gate clear |
| `business_description` | text | no until description step | required for gate clear |
| `website_url` | text | no | settings + research hint |
| `target_audience` | text | no | short summary |
| `industry` | text | no | |
| `setup_status` | text | yes | check: `not_started` \| `in_progress` \| `complete`; default `not_started` |
| `setup_step` | text | no | current step id (app enum string) |
| `competitors_skipped` | boolean | yes | default false; true when user explicitly skips competitors |
| `created_at` / `updated_at` | timestamptz | yes | DB default `now()`; app sets `updated_at` on change |

`profile_entries` (N per user)

| Column | DB type | Required | Notes |
|---|---|---|---|
| `id` | text PK | yes | `pentry_` + nanoid(21) |
| `user_id` | text FK → `users.id` ON DELETE CASCADE | yes | index `(user_id)`, `(user_id, category)`, `(user_id, status)` |
| `category` | text | yes | check closed set below |
| `title` | text | no | e.g. competitor name |
| `body` | text | yes | non empty after trim |
| `status` | text | yes | check: `proposed` \| `active` \| `rejected` \| `archived` |
| `source` | text | yes | check: `setup` \| `settings` \| `operator_confirm` \| `research` |
| `sort_order` | integer | yes | default 0 |
| `created_at` / `updated_at` | timestamptz | yes | |

Closed `category` values: `tone`, `do_not`, `cadence`, `competitor`, `audience`, `skill`, `brand_fact`.

**State transitions**:

`setup_status`: `not_started` → `in_progress` → `complete`. From `complete` → `in_progress` on redo. Illegal jumps rejected in app code.

`profile_entries.status`: research creates `proposed`; confirm → `active` or `rejected`; settings edit keeps `active` or sets `archived`; archived is soft retire (queries for compile and default settings lists exclude archived unless asked).

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/profile` | GET | none | identity, sections by category, `compiledNote`, `setupStatus`, `setupStep` | session | 401 |
| `/profile` | PATCH | identity fields; optional `redoSetup`; optional `confirmReset` | updated profile projection | session | 401, 422 |
| `/profile/entries` | GET | `category?`, `status?`, `cursor?`, `limit?` | paginated entries (default limit 50, max 100) | session | 401 |
| `/profile/entries` | POST | `category`, `title?`, `body`, `status?` (default `active`), `sortOrder?` | entry | session | 401, 422 |
| `/profile/entries/:id` | PATCH | `title?`, `body?`, `status?`, `sortOrder?` | entry | owner session | 401, 404, 422 |
| `/profile/entries/:id` | DELETE | none | 204 | owner session | 401, 404 |
| existing orchestration create/message (and stream) | POST | message, requestId, intentAnswers? | TurnResponse; setup path may emit `intent_questions` | session | existing + setup gate behavior |

Setup vs operator is **not** a client mode flag. The server reads `business_profiles.setup_status` and `SETUP_AGENT_ENABLED`.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Gate allow operator chat | boolean | `SETUP_AGENT_ENABLED` and `business_profiles.setup_status` equals `complete` |
| Minimum complete | boolean | name + description present; (`competitors_skipped` or ≥1 active `competitor`); ≥1 active `tone` |
| Compiled note | text | deterministic server compile of profile identity + active entries ordered by category then `sort_order` then `created_at` |
| Settings sections | identity + entry lists | same DB rows as compile; no second store |
| Competitor proposals | proposed entries + Q&A options | DeepSeek structured result mapped to `profile_entries` with `source=research`, `status=proposed` |
| Competitor confirm | active/rejected statuses | `intentAnswers` on follow up chat turn |
| Sample tone rules | active `tone` entries | setup model sample posts + user corrections, written by trusted setup tools |
| Setup model id | string | `THESEAN_SETUP_MODEL` or default `ship-like/claude-opus-5` |
| Research model | string | `DEEPSEEK_MODEL` env |
| Operator injection | system/developer context block | compile helper on each operator turn |
| Profile level mid chat update | patched identity or active entries | operator detects profile level change → confirm Q&A → trusted write with `source=operator_confirm` |
| Publishing authority | effective mode | Feature 12 preference snapshot only (not this schema) |
| Connect platforms CTA | deep link | existing Settings connectors routes; SocialMCP holds tokens |

**Key invariants**:

- One `business_profiles` row per `user_id`.
- Compile and operator injection use **active** entries only.
- Setup path never exposes live SocialMCP publish tools.
- Closed category set in Feature 7; unknown model labels map to `brand_fact` or `do_not` in trusted setup code, never invent new category strings in the DB check.
- Derived compiled note is not stored as a source of truth column (compute on read).
- Entry list endpoints paginate.

**Security model**:

- Session user owns all profile rows for their `user_id`. No admin cross tenant profile API in Feature 7.
- Research payloads exclude OAuth and MCP secrets.
- Profile bodies may contain business PII (name, site, audience); treat as tenant private data; no public profile routes.

**Configuration required**:

- `SETUP_AGENT_ENABLED`: when not `"false"`, forced setup gate is on (default on for local and test; cloud may set false until smoke)
- `THESEAN_SETUP_MODEL`: setup Thesean model id (default `ship-like/claude-opus-5`)
- `DEEPSEEK_API_KEY`: DeepSeek API key (optional; missing disables live research)
- `DEEPSEEK_BASE_URL`: DeepSeek API base URL
- `DEEPSEEK_MODEL`: DeepSeek model id for research (default `deepseek-v4-flash`, DeepSeek V4 Flash)

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):

- Happy path: new user completes name, description, competitor Q&A, sample tone corrections; `setup_status` becomes `complete`; next operator turn receives compiled note; settings GET shows the same sections, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-9**
- Failure case: DeepSeek key missing or timeout → setup offers manual or skip competitors and still can complete after tone, verifies **AC-4**
- Auth/permission: user B cannot GET or PATCH user A profile or entries (404/403 as existing product pattern), verifies **AC-8**
- Mid chat: profile level confirm updates an entry; "never use emojis" does not write a Feature 7 rule without Feature 11, verifies **AC-7**
- Flag off: `SETUP_AGENT_ENABLED=false` allows operator chat with incomplete profile, verifies **AC-2**

## Build plan

Tracer Bullet order: thin end to end thread first (persist → read API → setup gate → inject), then thicken research, tone, and settings UI.

1. [x] Add Drizzle schema, migration, and database helpers for `business_profiles` and `profile_entries` (create on first need, cascade delete, id helpers, list/paginate entries), satisfies **AC-1**, **AC-9** (skip flag column)
2. [x] Add compile helper and authenticated profile REST (`GET/PATCH /profile`, entry CRUD with pagination), satisfies **AC-5**, **AC-8**
3. [x] Wire setup gate in orchestration: when flag on and not complete, route turns to setup agent (Thesean setup model, setup tool allowlist, no live publish), satisfies **AC-2**
4. [x] Implement setup write tools for identity fields and entries; advance `setup_step` / `setup_status`; enforce minimum complete rules, satisfies **AC-3**, **AC-9**
5. [x] Add DeepSeek research client and proposed competitor flow with `intent_questions` confirm; fail open without key, satisfies **AC-4**
6. [x] Add sample post tone capture path writing active `tone` entries, satisfies **AC-3**
7. [x] Inject compiled note on every operator turn after complete; add confirm path for profile level mid chat updates only, satisfies **AC-6**, **AC-7**
8. [x] Ship basic web Profile / Brand settings page (read, edit, redo setup) and conversational setup chat UX (no forced-setup banner; server gate + setup prompt), satisfies **AC-5**, **AC-9**
9. [x] Tests across database, API, orchestration, and web for the critical scenarios above, satisfies **AC-1** through **AC-9**

## Consequences

**Positive**:

- Operator drafts gain durable business context without relying on long chat history.
- Settings and the model share one source of truth.
- Forced setup matches the OpenClaw style "know the user" bar for a business product.

**Negative / tradeoffs**:

- Incomplete profiles cannot use the normal operator until the gate clears (unless the flag is off).
- DeepSeek is a new external dependency; cloud needs a key before live research works.
- Setup opus calls cost more than Sonnet; keep setup turns infrequent and gate clear once.

**Neutral**:

- Feature 6 tiers remain separate; this feature does not gate by plan.
- Feature 10 may later thicken schedule and other surfaces; Feature 7 owns the first profile settings page.
- Feature 11 still owns the correction to rules loop.

## Follow-up

- [ ] Provision `DEEPSEEK_API_KEY` (and base URL / model) on local and Fly when ready for live research smoke
- [ ] Cloud smoke: forced setup → settings edit → operator draft uses compiled note; then leave `SETUP_AGENT_ENABLED` on
- [ ] Feature 11 must own draft style correction write back and must not duplicate Feature 7 profile confirm
- [ ] Feature 6 may later tier cap research or setup model cost; no gate here yet
- [ ] Optional later: move DeepSeek behind Thesean if a stable route exists
