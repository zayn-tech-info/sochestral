# 0011. Scheduled posts list surface

**Date**: 2026-08-09
**Status**: In Progress

## Summary

Sochestral adds a Scheduled Posts list so a business owner can browse SocialMCP schedules as an inventory, not only on the week calendar. The page lives at `/app/scheduled`, supports time sort and account, platform, and status filters, and pages through exactly 30 day windows. Rows open the same detail page as the calendar. Creating a post by form is follow up; the empty state sends people to chat for now.

## Requirements

**User stories**:

- As a business owner, I want a list of my scheduled posts I can sort and filter so that I can find what goes out without scanning a week grid.
- As a business owner, I want upcoming posts first by default so that I focus on what still needs to publish.
- As a business owner, I want to open a row into the existing schedule detail so that cancel and preview stay in one place.
- As a business owner, when nothing is due, I want a clear empty state with chat and create entry points so that I know what to do next.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: Signed in users open `/app/scheduled` from the side nav item Scheduled Posts. The page is separate from `/app/calendar`.
- **AC-2**: Default view is status Scheduled, window exactly 30 days from now forward (`from` = now UTC ISO, `to` = now + 30 days), sort `scheduledAt` ascending (nearest first). The header shows the active client IANA timezone used for bounds and display. Range controls are labeled with a medium date range in that timezone (example shape: `Aug 9 – Sep 8, 2026` via `Intl`).
- **AC-3**: The user can toggle sort between `scheduledAt` ascending and descending only. No other sort keys in v1. Equal times break ties by `scheduleId` ascending.
- **AC-4**: Filters exist for connected account (`accountId`), platform, and product status bucket (`Scheduled`, `Done`, `Failed`, `Canceled` exact names). Status filtering happens in product after mapping each MCP row with the 0010 bucket map (both `cancelled` and `canceled` → Canceled). Product does not depend on MCP’s optional `status` query alone. When the user selects Done, Failed, or Canceled, the default window resets to the last 30 days ending now; Scheduled keeps now → +30 days. Prev/next still shift whichever window is active.
- **AC-5**: Each list request sends `from`, `to`, and `timeZone`. The product API rejects spans longer than 30 days with 422 `{ error: "INVALID_RANGE" }`. Bad `sort` → 422 `{ error: "INVALID_SORT" }`. Bad `status` → 422 `{ error: "INVALID_STATUS" }`. Allowed `sort` values are only `scheduledAt:asc` and `scheduledAt:desc` (default `scheduledAt:asc` when omitted). The UI pages by shifting the 30 day window; prev/next use `hasOlder` / `hasNewer` from the response and disable when false.
- **AC-6**: The results table shows When, Status, Platform, Account, and Caption preview. Row activation navigates to `/app/calendar/[scheduleId]` (shared with spec 0010). Done, Failed, and Canceled rows still open that detail; mutation controls follow 0010 `canReschedule` / `canCancel` (disabled when unsupported). Caption and media stay view oriented on detail; this list does not edit caption.
- **AC-7**: When accounts exist but the filtered window has no rows: plain “nothing to see” copy, Chat with Soc → `/app/workspace`, Create post → `/app/workspace` (manual create form out of this build).
- **AC-8**: SocialMCP failure shows list chrome with a retryable product owned error and no fake rows.
- **AC-9**: List header links to Week view (`/app/calendar`). Calendar header links to List view (`/app/scheduled`).
- **AC-10**: Product schema gains no `schedules` table. Reads use session authenticated `GET /scheduled/posts` → SocialMCP with JWT `sub` = session user id. Account filter options reuse `GET /calendar/accounts`. Responses never include OAuth tokens, MCP secrets, or raw provider error bodies.
- **AC-11**: When `/calendar/accounts` returns zero accounts: empty state includes Chat with Soc, Create post → Workspace, and a secondary Connect an account link to `/app/settings/connectors`.
- **AC-12**: Visual layout follows the locked direction: toolbar then dense table, Sochestral tokens from `web/design.md`, no dark third party clone, no stock photos. Safe HTTPS thumbs are optional later; not required in v1 columns.
- **AC-13**: Manual schedule create form is explicitly out of scope for this spec. Create post means Workspace until a later feature ships the form.
- **AC-14**: MCP `get_scheduled_posts` has no date filter today. Product may load the MCP schedule set (optional `platform` only), then filter by window, account, status bucket, and sort in product. The 30 day response window is the product contract; it does not prove MCP truncated the fetch. Scale mitigation (shared short TTL cache across calendar and list) is follow up, not a v1 blocker.

## Decision

**Chosen option**: Dedicated `/app/scheduled` list over SocialMCP projections, fixed 30 day window paging, shared calendar detail, Workspace CTAs until a create form exists.

**Implementation skills**: `hono` (`.agents/skills/hono/`)

## Rationale

Reasoning and options: see [rationale.md](./rationale.md).

## Feature design

**Data model sketch**:

No new product tables for schedules.

| Entity | Owner | Key fields | Notes |
|---|---|---|---|
| `users` | product Neon | `id` | Session owner; MCP JWT `sub` |
| Connected account | SocialMCP via connectors | `id`, platform, label, username | Filter options via `/calendar/accounts` |
| List row | SocialMCP projection | same fields as 0010 `CalendarSlot` | Table row |
| Schedule detail | SocialMCP projection | 0010 `ScheduleDetail` | Shared `/app/calendar/[scheduleId]` |

**State transitions**:

Status buckets stay as in 0010 (`Scheduled`, `Done`, `Failed`, `Canceled`). The list does not invent new states. Mutations stay on the detail page and honor 0010 flags.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/scheduled/posts` | GET | `from`, `to` (ISO UTC, max 30 day span), `timeZone` (IANA), optional `accountId`, `platform`, `status` (`Scheduled`\|`Done`\|`Failed`\|`Canceled`), `sort` (`scheduledAt:asc`\|`scheduledAt:desc`, default asc) | `{ posts: CalendarSlot[], timeZone, from, to, sort, hasOlder, hasNewer }` | session | 401; 422 `INVALID_RANGE` / `INVALID_SORT` / `INVALID_STATUS`; 502 |
| `/calendar/accounts` | GET | none | connected accounts | session | 401, 502 (reuse 0010) |
| `/calendar/slots/:scheduleId` | GET/PATCH/DELETE | as 0010 | detail / mutations | session | as 0010 |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Default window (Scheduled) | `from` / `to` | Client: `from` = now ISO; `to` = now + exactly 30 days |
| Default window (Done / Failed / Canceled) | `from` / `to` | Client: `to` = now; `from` = now − exactly 30 days |
| Max list window | 30 day cap | Product API validation (this spec) |
| Timezone label and local times | IANA zone + formatted When | Client `timeZone` query + display; MCP stores UTC |
| Range control label | medium date range string | Client `Intl` in `timeZone` (this spec AC-2) |
| Default sort | nearest first | `sort=scheduledAt:asc` when omitted |
| Sort toggle + ties | order of rows | `scheduledAt` then `scheduleId` ascending as tie break |
| Status filter | which rows | Product applies 0010 `mapStatusBucket` then equals selected bucket; MCP `cancelled`/`canceled` both Canceled |
| Account / platform filters | which rows | Query params vs projected fields |
| MCP load | raw schedules | `get_scheduled_posts` with optional `platform` only; product slices by `from`/`to` (AC-14) |
| `hasOlder` / `hasNewer` | booleans | Product: after projecting all MCP rows, true if any row’s `scheduledAt` lies before `from` or after `to` respectively |
| Table rows | When, Status, Platform, Account, Caption | Shared 0010 `CalendarSlot` projection helper (one implementation with calendar) |
| Account filter options | account list | `GET /calendar/accounts` |
| Empty (no accounts) | copy + Connect link | accounts length 0 → `/app/settings/connectors` secondary CTA |
| Empty (filtered) | copy + Chat + Create | accounts exist, `posts` empty → Workspace links |
| Detail navigation | href | `/app/calendar/${scheduleId}` |
| Week / List cross links | hrefs | `/app/calendar` and `/app/scheduled` |
| 422 bodies | `{ error }` | codes named in AC-5 |
| Tenant scope | which posts | session user id → MCP JWT `sub` |

**Key invariants**:

- No product Postgres schedule rows.
- Calendar week list stays capped at 8 days (`/calendar/slots`); this list uses `/scheduled/posts` with a 30 day cap.
- Response window is always ≤ 30 days; the client pages by moving that window.
- List v1 does not create, reschedule, or cancel; those stay on detail (or later create form).
- Missing MCP caption/media still renders the row with empty or placeholder caption preview (same honesty as 0010).
- Status and slot mapping share one orchestration helper with 0010 so calendar and list cannot drift.

**Security model**:

Session cookie on `/scheduled/*`. Ownership via MCP scoping. Safe error codes only. No secrets in JSON.

**Configuration required**:

No new env vars. Reuses `SOCIALMCP_MCP_URL` and existing MCP JWT minting. Schedule tool names stay recorded under 0010 `mcp-contract.md`.

**UX notes** (for `/develop`):

- Page: `/app/scheduled` inside WorkspaceShell.
- Composition: header (title + Week view link) → toolbar (range prev/next disabled from `hasOlder`/`hasNewer`, sort, filters) → table (or empty/error in place).
- Design source: engineer directed clean professional inventory (this spec) + `web/design.md` tokens.
- Wire side nav Scheduled Posts to `/app/scheduled`.
- Add List view link on calendar header; Week view on list header.

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):

- Happy path: open `/app/scheduled`, see upcoming Scheduled rows nearest first in a 30 day forward window, filter one account, sort desc, open detail, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-6**
- Status Done: default window becomes last 30 days; canceled MCP spellings both match Canceled filter, verifies **AC-4**
- Range: request over 30 days → 422 `INVALID_RANGE`; UI prev/next honor `hasOlder`/`hasNewer`, verifies **AC-5**
- Empty accounts: Connect an account + Chat + Create, verifies **AC-11**
- Empty filtered: nothing to see + Chat + Create to Workspace, verifies **AC-7**
- Failure: MCP down → retryable error, no fake rows, verifies **AC-8**
- Detail terminal: open Done row → mutations disabled per 0010 flags, verifies **AC-6**
- Auth: other user’s schedule id on detail still 404 per 0010; list never leaks tokens, verifies **AC-10**
- Cross links: List ↔ Week headers, verifies **AC-9**
- No Neon `schedules` table; product window filter after MCP load, verifies **AC-10**, **AC-14**
- Create form absent; Create post goes to Workspace, verifies **AC-13**

## Build plan

Tracer Bullet: thin list path first (shared projection + API 30 day list → table → nav), then filters, sort, window paging, empty/error, cross links.

1. [x] Extend shared 0010 calendar projection helper for `/scheduled/posts` (30 day cap, product status filter via bucket map, `scheduledAt` + `scheduleId` sort, `hasOlder`/`hasNewer`); no Neon migration, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-10**, **AC-14**
2. [x] Register session authenticated `GET /scheduled/posts` with tests (422 codes, sort/status validation, no secrets), satisfies **AC-5**, **AC-8**, **AC-10**
3. [x] Ship `/app/scheduled` UI (toolbar, table, timezone, 30 day window defaults by status, filters, sort, range labels), satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-12**
4. [x] Empty and error states (accounts vs filtered); wire Scheduled Posts nav; Week/List cross links; web tests including terminal detail from list, satisfies **AC-6**, **AC-7**, **AC-8**, **AC-9**, **AC-11**, **AC-13**

## Consequences

**Positive**:

- Operators get a real inventory surface beside the week calendar.
- Calendar’s 8 day invariant stays intact.
- Detail and mutations stay single sourced with 0010.
- Status and mapping cannot drift if the shared helper is used.

**Negative / tradeoffs**:

- History longer than 30 days needs multiple window hops.
- Create stays chat only until a later form feature.
- Caption/media quality still depends on SocialMCP list payload richness (same as 0010).
- MCP may still return a large unscoped list today; product windows the response only (AC-14).

**Neutral**:

- Spec 0010 calendar stays the week surface; this does not replace it.
- Autonomous planner (SOC-39) can feed rows both surfaces display later.

## Follow-up

- [ ] Manual create post form (empty state Create post stops being Workspace only)
- [ ] Optional thumbnail column when safe HTTPS media exists
- [ ] Shared short TTL cache for MCP schedule list used by calendar and scheduled posts (scale)
- [ ] Month calendar view remains under 0010 follow up, not this list
