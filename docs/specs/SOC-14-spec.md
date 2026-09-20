# SOC-14. Schedule calendar and profile settings surfaces

**Date**: 2026-08-09
**Status**: Proposed
**Linear**: [SOC-14](https://linear.app/sochestral/issue/SOC-14/design-feature-10-schedule-calendar-profile-settings-surfaces)
**Scope**: Feature 10 in `docs/scope/scope.md`
**Related**: [0001 Product database](./0001-product-database.md) · [0002 Auth session and MCP JWT](./0002-auth-session-mcp-jwt/index.md) · [0003 Orchestration backend](./0003-orchestration-backend/index.md) · [0004 Chat connectors UI](./0004-chat-connectors-ui/index.md) · [0005 Review mode publish loop](./0005-review-mode-publish-loop/index.md) · [0008 Live platform preview aside](./0008-live-platform-preview-aside/index.md) · Feature 7 setup agent and business profile (SOC-12 / SOC-13; expected `0009` when present on `main`)

## Summary

This decision adds the remaining web operator surfaces for Feature 10. The main new work is a schedule calendar that reads and edits SocialMCP schedules through trusted product APIs, so a signed in user can see planned posts at a glance and change or cancel them. Business profile settings stay on the Feature 7 category model in product Postgres (no second profile schema). A standalone approval queue is not built; the conversation preview aside plus a calendar pending review list are enough for beta.

## Context

Slice 1 already ships login, chat, connectors, review drafts, live preview aside, and approve to publish. The side nav still marks Calendar and Scheduled Posts as Soon. Context panel copy promises a schedule drawer that does not exist. Operators cannot see future posts in one place even though the product vision and master plan call for a calendar view.

Schedules remain owned by external SocialMCP (execution DB and worker). Product Postgres must not grow schedule tables. Product drafts for review already live in Neon. Feature 7 is supposed to own structured profile categories and a settings editor; Linear marks SOC-12 and SOC-13 Done, but this checkout of `origin/main` still lacks `0009` and profile code. Feature 10 therefore designs the calendar path fully, and treats profile settings as a gap list against Feature 7 rather than a new category model.

Autonomous plan generation for a date range is SOC-39 / SOC-42, not this issue. Feature 10 is the surface those planners write into and that humans edit. Without this decision, a later build would invent schedule ownership, timezone rules, or a second approval queue mid flight.

## Requirements

**User stories**:
- As a signed in operator, I want a calendar of my scheduled posts so I can see what goes live and when without leaving the app.
- As a signed in operator, I want to reschedule or cancel a scheduled post from that calendar so I can fix timing without chat.
- As a signed in operator, I want to schedule an already reviewed draft for a future time through a trusted product action so the calendar is useful before the autonomous planner ships.
- As a signed in operator, I want pending review drafts listed beside the calendar so I know what still needs approval without a separate queue product.
- As a signed in operator, I want my business profile categories editable in Settings so the agent stays grounded in my brand (Feature 7 data and APIs).
- As a signed in operator, I want my IANA timezone saved so calendar days match the hours I mean.
- As the product, I want chat models still blocked from live schedule and publish tools so review before publish stays enforced.

**Acceptance criteria**:
- **AC-1**: Authenticated web users reach a real calendar route (not a Soon placeholder) from the workspace side nav. Month is the default at a glance view. Week and day views are available. Empty, loading, and SocialMCP error states are explicit.
- **AC-2**: Calendar items for scheduled work come from SocialMCP schedules for the session `userId` only. Product Postgres has no `schedules` table and no copied schedule row store. A thin product read model or DTO in memory or response JSON is allowed.
- **AC-3**: Users can cancel a schedule they own and reschedule its `runAt` through trusted product APIs. Mutations are idempotent with a client `idempotencyKey`. Failures return safe error codes without leaking MCP internals.
- **AC-4**: Users can create a future schedule from an owned review draft or draft group that is eligible to publish, via a trusted browser API (session plus review action headers as in Feature 5). Chat model tools remain unable to call schedule tools. Creating bulk date range plans is out of scope (SOC-39).
- **AC-5**: Calendar page shows a Pending review list sourced from product `drafts` in reviewable status for that user. Selecting an item opens the existing conversation scoped preview / review path (or navigates to the owning chat with the aside). No standalone `/approvals` queue route ships in v1.
- **AC-6**: Calendar day boundaries and item placement use an IANA timezone. Source order: saved `users.timezone` when set; otherwise the browser supplied IANA on the request for that read; Settings can persist the preference. UTC alone is not an acceptable silent default for placement when a browser IANA is available.
- **AC-7**: Profile settings UI edits Feature 7 Postgres categories (business profile, rules, skills, memory as delivered by Feature 7). Feature 10 does not invent a parallel schema. If Feature 7 code and APIs are missing on the build branch, calendar work may still land, but profile settings tasks stop and reopen the Feature 7 dependency rather than redesign categories here.
- **AC-8**: Side nav Calendar and Scheduled Posts point at the same calendar surface (one composition). Drafts may deep link to the pending list. Analytics and Brand Assets stay Soon.
- **AC-9**: All schedule and profile routes require the product session. Every SocialMCP call mints a tenant MCP JWT (`sub` = user id). Users cannot read or mutate another tenant’s schedules or drafts.
- **AC-10**: Automated tests cover at least: schedule list mapping and tenant scoping; cancel and reschedule happy path plus idempotency; schedule from draft authz failure; timezone day boundary placement; pending review list from product drafts; chat allowlist still excludes schedule tools; profile settings reuse Feature 7 APIs when present (or a clear build skip when Feature 7 is absent).

## Options considered

### Option 1: Product calendar over SocialMCP schedules, Feature 7 settings reuse, no standalone queue (recommended)

Add `/app/calendar` and trusted `/schedules*` APIs. `ScheduleService` calls SocialMCP schedule tools with a tenant JWT, outside the chat tool allowlist. Persist only `users.timezone` in product Postgres for display. Overlay pending product drafts as a list, not grid owned rows. Profile settings stay Feature 7 routes and APIs.

**Pros**:
- Honors locked repo split (MCP owns schedules; product owns profiles and review)
- Makes the calendar useful before SOC-39 via trusted schedule from draft
- Avoids a second approval product when 0008 already owns review UI

**Cons**:
- Depends on SocialMCP exposing list, create, update, and cancel schedule tools to the product gateway
- Profile tasks stay blocked if Feature 7 never lands on the build branch

### Option 2: Copy schedules into product Postgres

Mirror MCP schedules into Neon for fast calendar queries.

**Pros**:
- Simpler multi filter queries later

**Cons**:
- Breaks AC-6 from 0001 and the master plan ownership split
- Creates sync drift with the worker that actually publishes

### Option 3: Standalone approval queue plus chat only scheduling

Build `/app/approvals` as a primary surface and leave schedule creation to future chat allowlists only.

**Pros**:
- Familiar queue metaphor

**Cons**:
- Duplicates 0008 preview aside without proving it insufficient
- Leaves the calendar empty until chat gains schedule tools, which weakens Feature 10’s at a glance job

## Decision

**Chosen option**: Option 1: Product calendar over SocialMCP schedules, Feature 7 settings reuse, no standalone queue.

v1 ships one calendar surface, trusted schedule mutations, timezone preference, and a pending review list. Profile settings are Feature 7 completion and nav wiring, not a new data model. Autonomous multi day planning stays SOC-39.

**Automation note**: This run had no interactive engineer interview. Requirements come from Linear SOC-14, `docs/scope/scope.md` Feature 10, and locked master plan stack rules. Load bearing picks below (timezone source, SocialMCP as sole schedule store, no standalone queue, trusted schedule from draft) are Staff recommendations for PR review. Change them in this spec before `/develop` if product wants a different timezone or queue policy.

**Implementation skills**: `hono` (`.agents/skills/hono/`) · `drizzle-orm-patterns` (`.agents/skills/drizzle-orm-patterns/`) · `postgres-drizzle` (`.agents/skills/postgres-drizzle/`) · `auth-implementation-patterns` (`.agents/skills/auth-implementation-patterns/`)

## Rationale

The operator job is “see everything at a glance and fix timing,” not “own a second copy of the worker’s schedule rows.” Reading SocialMCP preserves the split that keeps tokens and publish execution out of the SaaS DB. A trusted schedule from draft path is the thin Tracer Bullet that fills the calendar before the autonomous planner exists, while keeping model tools dry of schedule power. Reusing Feature 7 for profile settings prevents a duplicate category design. Declining a standalone queue matches Linear’s default and 0008’s conversation scoped review UI.

## Feature design

**Build approach**: Tracer Bullet. First vertical slice: timezone column → list schedules API → calendar month page with empty and error states → cancel. Then thicken with reschedule, schedule from draft, pending review list, week/day views, and Feature 7 settings gap wiring.

**Data model sketch**:

Product Postgres (new):
- `users.timezone` text null: IANA name such as `Africa/Lagos`. Nullable until the user saves a preference. No other schedule tables.

Product Postgres (existing, read for overlays and schedule from draft):
- `drafts`, `draft_publish_attempts`, review group fields as in 0005 / 0006
- Feature 7 profile category tables when present (owned by SOC-12 / SOC-13; not redesigned here)

SocialMCP execution DB (external, not migrated here):
- Schedule rows, posts, tokens, worker state. Product never mirrors these tables.

In memory / API DTO only:
- `CalendarItem`: `source` (`mcp_schedule` | `product_draft`), `id`, `platform`, `bodyPreview`, `runAt` (ISO timestamptz, null for unscheduled drafts), `status`, optional `draftId` / `reviewGroupId` / `conversationId`, optional `mcpScheduleId`

**State transitions**:
- MCP schedule (external, product reflects): `scheduled` → `canceled` | `published` | `failed` (exact MCP labels mapped in the adapter; unknown labels shown as safe `unknown`)
- Product draft overlay: unchanged 0005 statuses; calendar does not invent draft states
- Trusted schedule from draft: eligible review draft/group → SocialMCP schedule create → calendar shows `mcp_schedule` item; draft remains the product review record until publish completes per existing review rules

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/schedules` | GET | `from` ISO (req), `to` ISO (req), `timezone` IANA (opt, required when user has no saved TZ) | `{ items, timezoneUsed, pendingReview[] }` paginated (`cursor` or limit+offset) | session | 401, 422 invalid range/TZ, 502 SocialMCP |
| `/schedules/:scheduleId` | PATCH | `runAt` ISO (req), `expectedRevision` or etag if MCP provides one (opt), `idempotencyKey` (req) | updated item | session | 401, 404, 409 conflict, 422, 502 |
| `/schedules/:scheduleId/cancel` | POST | `idempotencyKey` (req) | `{ ok: true, item }` | session | 401, 404, 409, 502 |
| `/schedules` | POST | `draftId` or `reviewGroupId` (req one), `runAt` ISO (req), `idempotencyKey` (req) | created item | session + review action headers | 401, 403, 404, 422 ineligible, 502 |
| `/auth/me` or `/settings/timezone` | GET/PATCH | `timezone` IANA (PATCH req) | user including `timezone` | session | 401, 422 invalid IANA |
| Feature 7 profile routes | GET/PATCH | as Feature 7 spec | categories | session | as Feature 7 |

Chat orchestration allowlist stays `list_connected_accounts`, `validate_post`, `publish_now` (dry run for model), `prepare_review`. Schedule tool names are callable only from `ScheduleService` via a trusted MCP gateway path (separate from `AllowedToolName` used by the model loop).

**SocialMCP tool contract** (adapter maps actual MCP names if they differ):
- `list_schedules` `{ from, to }` → schedule rows for JWT `sub`
- `schedule_post` (or create) `{ …post fields or mcp post/draft ref, runAt, idempotencyKey }`
- `update_schedule` `{ scheduleId, runAt, idempotencyKey }`
- `cancel_schedule` `{ scheduleId, idempotencyKey }`

If cloud SocialMCP lacks any of these at build time, `/develop` stops on calendar mutations and comments on SOC-14 with the missing tool names rather than inventing a product schedule store.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Resolve tenant | `userId` | Product session (`validateSessionToken`) |
| MCP auth | Bearer JWT `sub` | `mintMcpJwt(userId)` (0002) |
| Calendar range bounds | `from` / `to` UTC instants | Request query, interpreted with `timezoneUsed` |
| `timezoneUsed` | IANA string for day grid | `users.timezone` if set; else request `timezone`; reject if both missing |
| Grid day label / placement | Local date and hour | Derived from item `runAt` + `timezoneUsed` via a named TZ library already acceptable in the stack (or `Temporal` / `Intl` as implemented) |
| Scheduled items | list of calendar cards | SocialMCP `list_schedules` mapped through `ScheduleService` |
| Pending review list | draft cards | Product `drafts` for `userId` in reviewable statuses from 0005 |
| Body preview | short text | MCP schedule payload text/body fields, or product `drafts.body` |
| Platform chrome | platform id | MCP account/platform field or draft.platform |
| Cancel / reschedule result | updated status / `runAt` | SocialMCP mutation response |
| Schedule from draft content | platforms, body, media | Owned product draft/group rows; media via existing review media rules |
| Schedule from draft `runAt` | future instant | Request body; must be strictly after server now |
| Idempotency | dedupe mutations | Client `idempotencyKey` + SocialMCP idempotency behavior; product may also record last key in memory for the request only (no new schedule table) |
| Profile category values | settings fields | Feature 7 Neon category rows and APIs |
| Empty calendar copy | UI string | Product owned copy in web calendar page |
| SocialMCP down message | UI string | Product owned copy; API `502` / `SOCIALMCP_UNAVAILABLE` |

**Key invariants**:
- No product table stores MCP schedule rows, tokens, or publish logs.
- Chat model tool allowlist never gains schedule tools in this feature.
- Trusted schedule mutations require session ownership of the draft or schedule.
- `runAt` for create/reschedule must be in the future at validation time.
- Calendar never shows another user’s items.
- Profile Feature 10 work cannot create categories outside the Feature 7 model.

**Security model**:
- Session cookie auth on all new routes (same pattern as connectors and review).
- Schedule from draft uses the same trusted review action header pattern as publish (0005), not a model tool call.
- MCP JWT scopes every SocialMCP call to `userId`.
- Timezone is not a secret; still validate against a known IANA set to avoid injection into formatters.
- No new public unauthenticated endpoints.

**Configuration required**:
- Reuse `SOCIALMCP_MCP_URL`, `JWT_SECRET` (MCP mint), existing session secrets.
- No new third party calendar provider.
- Optional: none for timezone (IANA validation is local).
- Prerequisite: cloud SocialMCP must expose the schedule tool contract above to product JWT callers.

**UX surface** (requirements only; visual system follows existing workspace UI):
- Route: `/app/calendar` (Scheduled Posts nav uses the same route with optional `?view=list` if useful).
- Default month composition: month grid, selected day summary, pending review list in one workspace layout (not a marketing hero).
- Item click: scheduled item opens detail sheet with reschedule/cancel; draft item opens existing review/preview path.
- Settings: timezone field; profile categories via Feature 7 settings entry in the settings area (beside connectors).
- Design source: existing product workspace UI / current patterns (no new brand direction).

**Critical test scenarios**:
- Happy path: list schedules in range places items on the correct local day for `Africa/Lagos`, verifies **AC-1**, **AC-2**, **AC-6**
- Happy path: cancel then idempotent cancel replay succeeds without double side effects, verifies **AC-3**
- Happy path: schedule from owned eligible draft creates MCP schedule and returns calendar item, verifies **AC-4**
- Failure: SocialMCP unavailable on list returns 502 and calendar error state, verifies **AC-1**, **AC-2**
- Authz: user B cannot cancel user A schedule id, verifies **AC-9**
- Authz: chat allowlist rejects schedule tool names, verifies **AC-4**, **AC-10**
- Overlay: pending review list shows only owned reviewable drafts, verifies **AC-5**
- Profile: settings PATCH hits Feature 7 API (or build documents blocked dependency), verifies **AC-7**, **AC-10**

## Build plan

1. **Timezone preference**: migrate `users.timezone` (nullable IANA text); PATCH/GET via settings or `/auth/me` extension; validate IANA. Satisfies **AC-6**.
2. **ScheduleService + MCP adapter**: trusted gateway methods for list/create/update/cancel; map DTO; keep chat `ALLOWED_TOOL_NAMES` unchanged. Satisfies **AC-2**, **AC-4**, **AC-9**.
3. **Read API**: `GET /schedules` with range, timezone rules, pagination, pending review overlay from product drafts. Satisfies **AC-2**, **AC-5**, **AC-6**, **AC-9**.
4. **Calendar Tracer Bullet UI**: `/app/calendar` month view; wire side nav Calendar and Scheduled Posts; loading/empty/error; consume GET. Satisfies **AC-1**, **AC-8**.
5. **Cancel + reschedule APIs and UI**: PATCH/cancel with idempotency; detail sheet actions. Satisfies **AC-3**.
6. **Schedule from draft**: trusted POST `/schedules` from draft/group; wire from pending list action. Satisfies **AC-4**, **AC-5**.
7. **Week/day views**: thicken calendar navigation without new data sources. Satisfies **AC-1**.
8. **Profile settings gap**: wire Settings nav to Feature 7 profile editor; only add missing edit affordances against Feature 7 APIs; if Feature 7 absent, stop this task and flag SOC-13 / `0009`. Satisfies **AC-7**.
9. **Automated tests**: service, API, allowlist, timezone placement, UI smoke as practical in Vitest. Satisfies **AC-10**.

## Consequences

**Positive**:
- Operators get the at a glance surface the vision promised
- Ownership boundaries stay clean for a future open SocialMCP
- Review before publish remains intact

**Negative**:
- Calendar quality depends on SocialMCP schedule tool availability and latency
- Until Feature 7 code is on the build branch, profile AC-7 cannot fully close

**Neutral**:
- Autonomous planning still needs SOC-39 to fill many slots without manual schedule from draft
- Analytics and brand asset nav remain Soon

## Follow-up

- Confirm cloud SocialMCP schedule tool names and payloads against this contract before `/develop` mutations land
- Land or restore Feature 7 (`0009` + Neon profile + settings) on `main` so AC-7 is buildable
- Sync `sochestral-master-plan.md` Slice 2 status with Linear sequencing (Feature 10 unblocked while SOC-8 / SOC-9 still open)
- SOC-39 planner should write into these same SocialMCP schedules and this calendar read path
- `/sync` after build to refresh scope Feature 10 pointers

## References

**Project sources**:
- `sochestral-master-plan.md` locked repo split and calendar vision
- `docs/scope/scope.md` Feature 10 Done when
- Specs 0001, 0003, 0004, 0005, 0008
- Linear SOC-14, SOC-12, SOC-13, SOC-39
)
