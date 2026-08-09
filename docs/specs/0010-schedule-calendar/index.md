# 0010. Schedule calendar surface

**Date**: 2026-08-09
**Status**: In Progress

## Summary

Sochestral adds an authenticated schedule calendar so a business owner can see SocialMCP scheduled posts week by week, filter by connected account, open a detailed scheduling page with live platform preview, and reschedule or cancel without leaving the web app. Schedule rows stay in SocialMCP. Product Postgres does not grow a second schedule store. Profile settings and autonomous plan generation stay out of this feature.

## Requirements

**User stories**:

- As a business owner, I want a week calendar of my scheduled posts across connected accounts so that I can see everything at a glance.
- As a business owner, I want to filter the calendar by connected account from a sidebar so that I can focus one brand presence at a time.
- As a business owner, I want to open a scheduled post into a detailed page with edit controls and a live looking preview so that I know what will go out.
- As a business owner, I want to reschedule or cancel from that surface so that I am not stuck only in chat.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: Signed in users can open `/app/calendar` from the side nav Calendar item (Scheduled Posts may link to the same page). The page shows a week aligned calendar grid for the visible week (weeks start Monday) with prev, next, and today controls.
- **AC-2**: A left sidebar lists the session user's SocialMCP connected accounts (reuse connectors shapes). Default filter is all accounts. Selecting an account filters slots using the same account id string connectors settings already expose for that row. With zero connected accounts, the sidebar and grid show an empty state with a CTA to Connected Accounts settings.
- **AC-3**: Each visible slot card shows `scheduleId`, platform, account label (and avatar hint when available), scheduled time displayed in the client IANA timezone, a product status bucket (Scheduled, Done, Failed, or Canceled; unknown MCP statuses map into one of these), truncated caption preview, and optional media thumbnail only when a safe HTTPS (or product proxied) image URL exists.
- **AC-4**: The calendar header shows the active IANA timezone used for week bounds and display. List requests send `from`, `to`, `timeZone`, and optional `accountId` / `platform` to the product API. The API rejects ranges longer than 8 days with 422.
- **AC-5**: Opening a slot navigates to `/app/calendar/[scheduleId]` with full caption, media (safe URLs only), platform, account, scheduled time, status bucket, reschedule control, cancel control (when MCP mutations exist), and a live platform preview sidebar using Feature 14 preview chrome patterns. Caption and media are view oriented in v1; calendar does not become a full create composer.
- **AC-6**: When the schedule payload includes a conversation or draft id, the detail page offers a deep link into the existing chat or review surface. If those ids are absent (expected for many MCP schedules), omit the deep link control. Do not invent Neon correlation rows in v1. Missing ids do not block reschedule or cancel.
- **AC-7**: `PATCH` reschedule accepts `{ scheduledAt }` as UTC ISO-8601. Product may reject clearly invalid client input; SocialMCP is source of truth for business rejection. Success returns the updated slot projection. Published posts cannot be rescheduled into a new pending schedule through this API if SocialMCP forbids it. If MCP has no reschedule verb, the control is disabled with product copy (no fake success).
- **AC-8**: Cancel is idempotent for already canceled schedules when SocialMCP reports that state. Published posts cannot be canceled from the calendar. Success removes or marks the slot so the week refresh no longer shows it as pending. If MCP has no cancel verb, the control is disabled with product copy.
- **AC-9**: An empty week shows clear copy and a CTA into AI Workspace. SocialMCP failure shows calendar chrome with a retryable product owned error and no fake slots.
- **AC-10**: Product schema gains no `schedules` (or calendar mirror) table. All schedule reads and mutations go session authenticated product routes → SocialMCP with JWT `sub` = session user id. Cross user schedule ids return 404 or 403. Responses never include OAuth tokens, MCP secrets, or raw provider error bodies.
- **AC-11**: Dense days show at most 3 slot cards, then a "+N more" control so week cells stay readable.
- **AC-12**: Visual layout follows the attached calendar and detail references (account sidebar, week aligned grid, slot cards, detail with preview sidebar) while using Sochestral product chrome and tokens from `web/design.md` (not a full dark third party clone).
- **AC-13**: Before UI polish, build records the live SocialMCP schedule contract (list, get, reschedule, cancel tool or HTTP names) in this spec folder. Read path can ship if list+get exist. Mutation controls ship only for verbs that exist; missing verbs stay disabled, never mocked.

## Decision

**Chosen option**: Product calendar surface over SocialMCP schedules (no Neon schedule store), week grid plus account sidebar, detail page with Feature 14 style live preview, reschedule and cancel only.

**Implementation skills**: `hono` (`.agents/skills/hono/`) · `postgres-drizzle` (`.agents/skills/postgres-drizzle/`) · `drizzle-orm-patterns` (`.agents/skills/drizzle-orm-patterns/`)

## Rationale

Reasoning and options: see [rationale.md](./rationale.md).

## Feature design

**Data model sketch**:

No new product tables for schedules.

| Entity | Owner | Key fields | Notes |
|---|---|---|---|
| `users` | product Neon | `id` | Session owner; MCP JWT `sub` |
| `ConnectedAccount` | SocialMCP | platform, account id, display label, avatar hint | Sidebar + filter |
| `CalendarSlot` | SocialMCP projection | `scheduleId`, platform, accountLabel, accountId, `scheduledAt` (UTC), statusBucket, captionPreview, thumbUrl? | Week grid card; thumb only if safe URL |
| `ScheduleDetail` | SocialMCP projection | slot fields + full caption, media[] (safe URLs), optional `conversationId`, optional `draftId`, mutationFlags | Detail page; flags say if reschedule/cancel exist |
| `Conversation` / review draft | product (optional) | ids only when present on payload | Deep link targets |

**State transitions**:

Schedule status is owned by SocialMCP. Product treats at least: `pending` → `canceled` (via cancel); `pending` → `published` or `failed` (worker / MCP, read only on calendar). Calendar must not invent statuses MCP does not expose.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/calendar/accounts` | GET | none | connected account list for sidebar | session | 401, 502 MCP down |
| `/calendar/slots` | GET | `from`, `to` (ISO UTC, max 8 day span), `timeZone` (IANA), optional `accountId` (connectors account id string), optional `platform` | `CalendarSlot[]` | session | 401, 422 bad or too long range, 502 |
| `/calendar/slots/:scheduleId` | GET | path id | `ScheduleDetail` | session | 401, 404, 502 |
| `/calendar/slots/:scheduleId` | PATCH | `{ scheduledAt: ISO UTC }` | updated slot or detail | session | 401, 404, 422, 409 published or unsupported, 502 |
| `/calendar/slots/:scheduleId` | DELETE | path id | canceled confirmation | session | 401, 404, 409 published or unsupported, 502 |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Week bounds | `from` / `to` | Client week math (Monday start); query params |
| Max list window | 8 day cap | Product API validation (this spec) |
| Timezone label and local times | IANA zone + formatted times | Client `timeZone` query + display; MCP stores UTC |
| Sidebar accounts | list | SocialMCP connected accounts via product `/calendar/accounts` (same ownership as connectors) |
| Account filter id | `accountId` | Same account id string connectors settings already expose for that connected account |
| Slot cards | card fields | SocialMCP schedule list mapped to `CalendarSlot` |
| Status label | Scheduled / Done / Failed / Canceled | Product bucket map over MCP status; never raw provider strings |
| Thumbnail / preview media | image URL or omit | Safe HTTPS or product proxied URL only; omit if unsafe or missing |
| Detail caption / media / status | detail fields | SocialMCP schedule get |
| Live preview chrome | platform frame | Feature 14 preview components fed by detail payload |
| Deep link href | chat or review URL or omit | optional `conversationId` / `draftId` on MCP payload only; no Neon correlation in v1 |
| Mutation availability | reschedule / cancel enabled | Live MCP contract recorded in build task 1; disable if verb missing |
| Empty / error copy | strings | Product owned UI constants |
| Tenant scope | which schedules | session user id → MCP JWT `sub` |

**Key invariants**:

- No product Postgres schedule rows.
- Every calendar MCP call uses the session user id only.
- List window is required; spans over 8 days are rejected; unpaginated “all schedules ever” is forbidden.
- Published schedules are not cancelable from this API.
- Calendar v1 does not create new schedules (composer / orchestration / later planner own create).
- Missing MCP mutation verbs disable controls; they never fake success.
- Weeks start Monday for product calendar math.

**Security model**:

Session cookie auth on all `/calendar/*` routes. Ownership enforced by MCP scoping and product 404/403 when the schedule is not for this user. No tokens or secrets in JSON. Safe error codes only.

**Configuration required**:

No new env vars. Reuses `SOCIALMCP_MCP_URL` and existing MCP JWT minting. Live schedule tool or HTTP names are recorded under this folder during build task 1 (see **AC-13**).

**UX notes** (for `/develop`):

- Page: `/app/calendar` inside `WorkspaceShell`.
- Detail: canonical `/app/calendar/[scheduleId]` with editor column + live preview column.
- Layout: account sidebar + week grid (Google Calendar style week rows, Monday start). Month grid is follow up.
- Design source: engineer screenshots under the conversation assets (Postiz like layout) + `web/design.md` tokens.
- Wire side nav Calendar (and optionally Scheduled Posts) from Soon to real links.
- Dense day: at most 3 cards, then "+N more".

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):

- Happy path: connected user opens calendar, sees week slots (Monday start), filters one account, opens `/app/calendar/[id]` with preview, reschedules when MCP supports it, refreshes week, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-7**
- Failure case: MCP unavailable on list → retryable error, no fake slots, verifies **AC-9**
- Auth/permission: user B cannot GET or PATCH user A `scheduleId` (404/403), verifies **AC-10**
- Empty accounts: zero connectors → CTA to settings, verifies **AC-2**, **AC-9**
- Cancel published rejected; cancel pending succeeds; second cancel idempotent when MCP says canceled; missing cancel verb disables control, verifies **AC-8**, **AC-13**
- Range over 8 days → 422, verifies **AC-4**
- No Neon `schedules` table in schema tests, verifies **AC-10**
- Unsafe media omitted from cards and detail, verifies **AC-3**, **AC-5**

## Build plan

Tracer Bullet: thin end to end path first (list week → render grid → open detail → reschedule), then thicken cancel, filters, overflow, nav polish.

1. [x] Confirm SocialMCP schedule list / get / reschedule / cancel contract from the live MCP client; write the names into `docs/specs/0010-schedule-calendar/mcp-contract.md`; map safe projections (`CalendarSlot`, `ScheduleDetail`) and status buckets; note which mutations are unavailable, satisfies **AC-3**, **AC-5**, **AC-10**, **AC-13**
2. [x] Add session authenticated Hono `/calendar/accounts` and `/calendar/slots` (Monday week client, max 8 day range, timezone, connectors `accountId` filter) with MCP wiring and tests, satisfies **AC-2**, **AC-4**, **AC-9**, **AC-10**
3. [x] Add `GET/PATCH/DELETE /calendar/slots/:scheduleId` with ownership errors, published guards, and 409 when verb unsupported, satisfies **AC-6**, **AC-7**, **AC-8**, **AC-10**, **AC-13**
4. [x] Ship `/app/calendar` week grid UI (custom grid, date helper, Monday start, timezone header, account sidebar, slot cards, 3 then "+N more"), satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-11**, **AC-12**
5. [x] Ship `/app/calendar/[scheduleId]` detail with Feature 14 style live preview sidebar, safe media only, reschedule and cancel (or disabled), deep link only when ids exist, satisfies **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-12**
6. [x] Wire side nav Calendar (and Scheduled Posts alias) off Soon; empty and error states; web tests, satisfies **AC-1**, **AC-9**
7. [x] Compare any Cursor automation calendar work to this spec; keep matches, rewrite gaps, then verify and test, satisfies **AC-1** through **AC-13**

## Consequences

**Positive**:

- Main web app gains the missing “at a glance” schedule surface without channels.
- Repo split stays intact: SocialMCP owns schedules; product owns UX and auth.
- Detail preview reuses Feature 14 investment.

**Negative / tradeoffs**:

- Calendar depends on cloud SocialMCP schedule APIs; local UI can render empty without MCP.
- No create-from-calendar and no caption edit in v1; users still schedule via chat / later planner.
- Week first; month grid waits.

**Neutral**:

- Feature 7 profile settings already shipped; not rebuilt here.
- SOC-39 autonomous planner writes into this surface later; this feature does not plan posts.
- Brand kit and image gen stay separate.

## Follow-up

- [ ] Month view grid after week path is solid
- [ ] Optional persist timezone on profile when Settings deepen
- [ ] Autonomous schedule planner (SOC-39 / SOC-42) creates slots this calendar displays
- [ ] After `/develop`, diff automation commits against this spec and either improve to match or rewrite
