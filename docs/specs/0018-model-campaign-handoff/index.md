# 0018. Model and campaign handoff

**Date**: 2026-08-14
**Status**: In Progress

## Summary

Chat no longer books a large run while the user waits. A cheap clerk model reads the message and fills a lock. Trusted code decides. Claude Sonnet talks, or starts a campaign job and returns. A worker writes one day at a time, grades the copy, and calls the existing schedule tool. The Schedule tab shows progress and can pause or stop the job.

## Structure

- [0018-clerk-lock.md](./0018-clerk-lock.md): Luna clerk JSON, lock columns on the conversation plan, merge rules, fail closed. Supports AC-1, AC-2, AC-13.
- [0018-voice-bible.md](./0018-voice-bible.md): Opus voice bible, one row per user, hash gate on profile or brand kit change. Supports AC-10, AC-11.
- [0018-campaign-job.md](./0018-campaign-job.md): campaign job, api worker, day write, grade, pause and stop, Schedule tab banner. Supports AC-3 through AC-9, AC-11, AC-12.

**Cross child contract**:

- The clerk never enqueues a job and never calls `schedule_post`.
- The operator (Sonnet in chat) may book **one** concrete post via `schedule_post`. Any ask for more than one post uses a campaign job.
- The worker is the only volume path. It calls existing SocialMCP `schedule_post`. There is no second schedule store.
- The day writer reads the voice bible and the locked plan. The clerk does not write captions.
- Filled lock fields on the plan are the source of truth for the worker. Chat must not re ask them.
- Campaign jobs schedule only. They never live publish.

## Requirements

**User stories**:

- As a business owner, I want to lock a plan in a short chat and say go so that the calendar fills without another long thread.
- As a business owner, I want captions that sound like my brand, not generic AI, even when many posts are queued.
- As a business owner, I want to watch and pause or stop a campaign on the Schedule tab so that I stay in control.

**Acceptance criteria**:

- **AC-1**: Luna clerk returns structured intent and lock fields before the operator turn. If the clerk fails or returns junk, treat the turn as chat only. Sonnet talks. No live publish. No campaign start.
- **AC-2**: Filled lock fields persist on the conversation plan and are never re asked.
- **AC-3**: More than one post uses a campaign job. One concrete post uses chat `schedule_post`. Same turn do it all no longer books up to 14 itself.
- **AC-4**: Go on a complete lock enqueues a job. Chat returns one line. The worker books one day at a time through existing `schedule_post`.
- **AC-5**: Cap is 30 queued posts per campaign. Extra planned posts are not queued. The job succeeds with a notice.
- **AC-6**: One in flight job per user (queued, running, or paused). A second go is refused until that job finishes or is stopped.
- **AC-7**: Pause freezes new days (resume later). Stop ends the job. Already booked SocialMCP rows stay unless the user cancels them. Both actions warn, then require `confirm: true`.
- **AC-8**: The Schedule tab shows a top banner (Day N, X of 30 queued, Pause, Stop). Rows appear in the existing scheduled list as they book.
- **AC-9**: Clock times come from the 0013 occupancy brief in trusted code. Timezone is the profile timezone, else UTC, and is not asked again once stored.
- **AC-10**: A voice bible compiles when the profile or brand kit changes (hash plus debounce). The day write uses that text.
- **AC-11**: Sonnet writes the day. Luna grades. One rewrite if the grade marks generic or duplicate copy.
- **AC-12**: If a day fails, retry that day once, keep partial bookings, then continue. The job fails only if a day fails twice.
- **AC-13**: Model env defaults: clerk and grader `ship-like/gpt-5.6-luna`, operator and day writer `ship-like/claude-sonnet-5`, voice bible `ship-like/claude-opus-5`. All overridable.
- **AC-14**: Specs 0013 and 0017 stay in force. Volume after a lock uses this campaign path. 0013 same turn cap 14 is no longer the volume path. 0017 plan snapshot gains lock fields.

## Decision

**Chosen option**: Option 2: Clerk, then code gates, then Sonnet, then a campaign worker

Chat stays short. Volume runs in `sochestral-api` next to the image worker. SocialMCP remains the only schedule store.

**Implementation skills**: `postgres-drizzle` (`ccheney/robust-skills`, `.agents/skills/postgres-drizzle/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.agents/skills/drizzle-orm-patterns/`) · `hono` (`yusukebe/hono-skill`, `.agents/skills/hono/`)

## Rationale

Reasoning and options: see [rationale.md](./rationale.md).

## Feature design

**Data model sketch**:

- Extend `conversation_content_plans` (0017): `startDate` (date, null until lock), `timezone` (text, null until lock), `cadence` (jsonb, posts per platform per day, default `{}`), `timeMode` (text, `spread` or `windows`, null until lock), `lockedAt` (timestamptz, null until lock). Existing unique: one plan per conversation.
- `campaign_jobs`: `id` (text PK), `userId` (FK users, required), `conversationId` (FK conversations, required, cascade), `planId` (FK conversation_content_plans, required, cascade), `status` (text, required), `cap` (int, not null, default 30), `bookedCount` (int, not null, default 0), `nextDate` (date, required once queued), `dayAttempts` (int, not null, default 0), `bookedPublishAts` (jsonb string array, not null, default `[]`, ISO times already booked by this job), `notice` (text, nullable, overflow or finish copy), `lastError` (text, nullable), `createdAt`, `startedAt` (nullable), `completedAt` (nullable), `updatedAt`. Partial unique: one row per `userId` where status is `queued`, `running`, or `paused`. Check: `cap` between 1 and 30, `bookedCount` >= 0, `status` in the state list below.
- `voice_bibles`: `userId` (PK, FK users, cascade), `briefText` (text, nullable), `sourceHash` (text, not null), `status` (`current` | `compiling` | `failed`), `pendingAt` (timestamptz, nullable), `compileHash` (text, nullable, hash the in flight compile was started with), `updatedAt`. One row per user. Separate from `brand_design_briefs` (visual).
- Delete conversation deletes the plan and its jobs. SocialMCP schedules stay in the MCP database.
- No caption table. The Schedule tab lists SocialMCP scheduled posts.

**Complete lock** (all required before go can enqueue):

- themes (non empty) or direction (non empty)
- platforms (non empty)
- cadence with at least one platform count > 0
- `startDate`

Timezone may be filled by code (profile, else UTC) during lock merge. `lockedAt` is set when the lock becomes complete, and set again after any merge that still satisfies the complete lock.

**Planned post count** (campaign vs one chat `schedule_post`):

- `dailyTotal` = sum of cadence counts (`threadsPerDay` + `linkedinPerDay` + `instagramPerDay`). Missing keys count as 0.
- `remainingDays` = `horizonDays` from the 0017 plan column (default 14), from `startDate` through `startDate + horizonDays - 1` in the lock timezone.
- `namedItems` = length of plan `acceptedItems` when the user accepted a list.
- `plannedPosts` = max(`namedItems`, `dailyTotal * remainingDays`).
- Campaign if `plannedPosts` > 1. Chat `schedule_post` only if `plannedPosts` <= 1 and clerk `intent` is `schedule_one`.

`themes`, `direction`, and `horizonDays` stay on the 0017 plan tools. The clerk does not emit them.

**State transitions** (`campaign_jobs.status`):

- `queued` → `running` (worker claim)
- `queued` | `running` → `paused` (user pause)
- `paused` → `queued` (user resume)
- `running` older than `CAMPAIGN_LEASE_MS` (default 10 minutes) → `queued` (crash reclaim, same idea as stale image jobs)
- `queued` | `running` | `paused` → `stopped` (user stop)
- `running` → `succeeded` (cap reached or horizon exhausted)
- `running` → `failed` (same day failed twice)
- Terminal: `succeeded`, `stopped`, `failed`. No leave.

**API surface**:

Chat start stays on the existing orchestration message route. Clerk and enqueue are internal.

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/campaigns/current` | GET | none | id, status, bookedCount, cap, nextDate, dayIndex, conversationId, startDate, notice, lastError | owner session | 404 no job ever. Returns the in flight job, else the latest job in any status |
| `/campaigns/:id/pause` | POST | confirm:boolean (req true) | id, status | owner session | 400 confirm missing, 404, 409 terminal |
| `/campaigns/:id/resume` | POST | none | id, status | owner session | 404, 409 not paused |
| `/campaigns/:id/stop` | POST | confirm:boolean (req true) | id, status | owner session | 400 confirm missing, 404, 409 already terminal |

Warn copy is product owned, shown in the tab before POST:

- Pause: "Pause stops new days. Posts already on your calendar stay. You can resume later."
- Stop: "Stop ends this campaign. Posts already on your calendar stay. You can cancel those on the list if you want."

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Clerk intent and lock fields | JSON object | Luna structured output, schema in [0018-clerk-lock.md](./0018-clerk-lock.md) |
| Timezone when user omitted it | IANA name or `UTC` | business profile timezone, else the literal `UTC` |
| Clock times for a day | ISO `publishAt` list | 0013 occupancy brief in trusted code, using plan `cadence`, `timeMode`, `timezone`, calendar occupancy |
| Complete lock | boolean | plan columns: themes or direction, platforms, cadence, startDate |
| Chat one line after go | assistant text | product owned: "Booking started. Day 1 of {horizon}. Watch the Schedule tab." Horizon from plan `horizonDays` |
| Stream label on enqueue | label | product owned: "Booking your campaign" |
| `cap` | 30 | env `CAMPAIGN_QUEUE_CAP`, default 30 |
| `bookedCount` | int | increment after each successful `schedule_post` |
| `nextDate` | date | plan `startDate` on enqueue, then prior `nextDate` plus one day after a finished day |
| Day N on the banner | int | 1 plus the number of calendar days from plan `startDate` to `nextDate` (or last finished day if succeeded) |
| X of 30 | bookedCount, cap | `campaign_jobs` columns |
| Overflow notice | `notice` column plus banner | product owned: "Queued 30 posts. The rest of the lock was not booked." Set when `bookedCount` hits `cap` while later days remain |
| Planned post count | integer | formula above (`dailyTotal`, `remainingDays`, `namedItems`) |
| Relative start date | ISO date | code: "tomorrow" and "today" in the lock timezone. Clerk may only send `YYYY-MM-DD` |
| Past start date | ISO date | if before today in the lock timezone, bump to today |
| Already booked slots | ISO list | `bookedPublishAts`. Retry skips those times. Idempotency key `campaign:{jobId}:{publishAt}` |
| Yesterday captions | text list | SocialMCP (or stored bodies) whose `publishAt` is in this job's `bookedPublishAts` only |
| Target account | connected account id | 0013 rule: connected account for each plan platform. No media on campaign days in v1 |
| Grade | pass or fail | Luna JSON `{ fail, reasons: generic\|duplicate\|length[] }`. Length limits from 0013 playbooks. Duplicate vs yesterday captions from this job. Rewrite once; if still fail, book the rewrite and do not fail the day |
| Day failure | boolean | true only if occupancy returns no slots while `dailyTotal` > 0, or the Sonnet day call fails, or every `schedule_post` that day fails. Partial success is not a day failure |
| Crash reclaim | status `queued` | `running` and `startedAt` older than `CAMPAIGN_LEASE_MS` |
| Voice `sourceHash` | sha256 hex | profile entries (tone, audience, do_not, brand_fact) plus brand kit notes and colors, same family as 0016 hash |
| Voice `briefText` | how they talk | Opus compile, trimmed, max 4000 chars |
| Day captions | 1..N post bodies | Sonnet day write, then optional one rewrite after Luna grade |
| Grade result | pass or fail plus reason | Luna structured output: generic, duplicate of yesterday, wrong length |
| Pause / stop warn | modal text | product owned strings above |
| Tenant | user id | session JWT `sub`, same as 0002 |

**Key invariants**:

- Clerk fail or junk → chat only. No live. No enqueue.
- Lock merge never replaces a filled field with null.
- More than one post → campaign job. Exactly one concrete post → chat `schedule_post`.
- Go without a complete lock → Sonnet asks only the missing lock fields.
- One in flight job per user, enforced in Postgres.
- Worker never calls live publish tools.
- `bookedCount` never exceeds `cap`.
- SocialMCP is the only schedule store.
- Luna is never `THESEAN_MODEL` (the operator).
- Worker re reads job status before each `schedule_post`. Paused or stopped aborts the rest of the day.
- Voice compile writes `current` only if `sourceHash` still equals `compileHash`.

**Security model**:

- All campaign routes require the owner session. Foreign `id` returns 404.
- Clerk output cannot authorize live publish. Existing 0006 / 0007 live gates still apply to the operator turn.
- Campaign path is schedule only.
- Stored assistant text, clerk JSON, and job errors are redacted with the same rules as 0003.
- No new public or unauthenticated routes.

**Configuration required**:

- `THESEAN_INTENT_MODEL`: clerk (and live vs draft classify). Default `ship-like/gpt-5.6-luna`.
- `THESEAN_MODEL`: operator. Default `ship-like/claude-sonnet-5` (unchanged).
- `THESEAN_VOICE_MODEL`: voice bible compile. Default `ship-like/claude-opus-5`.
- `THESEAN_SETUP_MODEL`: setup agent. Default `ship-like/claude-opus-5` (unchanged).
- `THESEAN_VISION_MODEL`: vision. Default `ship-like/gpt-5.6-luna` (unchanged).
- Day writer uses `THESEAN_MODEL`. Grader uses `THESEAN_INTENT_MODEL`.
- `CAMPAIGN_QUEUE_CAP`: max booked posts per job. Default 30.
- `CAMPAIGN_WORKER_POLL_MS`: poll interval. Default 2000.
- `CAMPAIGN_LEASE_MS`: stale `running` reclaim. Default 600000 (10 minutes).
- `VOICE_BIBLE_DEBOUNCE_MS`: compile wait after last profile or brand mutate. Default 3000.

**Critical test scenarios**:

- Happy path: lock complete, user says go, job queued, chat one line, worker books day 1, banner shows counts, verifies **AC-4**, **AC-8**
- Clerk junk: Luna times out, Sonnet talks, no job row, verifies **AC-1**
- Re ask: start date already stored, later turn does not ask for it, verifies **AC-2**
- Two posts in one ask: enqueue, no second `schedule_post` in the chat turn, verifies **AC-3**
- Cap: lock would need 98 posts, job stops at 30 and succeeds with notice, verifies **AC-5**
- Second go while running: refused, verifies **AC-6**
- Pause without confirm: 400, verifies **AC-7**
- Day fail once then success: `dayAttempts` resets, job continues, verifies **AC-12**
- Foreign user GET `/campaigns/current`: empty or 404, never another tenant's job, verifies **AC-8** (auth)

## Build plan

Tracer Bullet. Each slice is a thin path through database, api, orchestration, and the web tab where that slice needs UI.

1. Migration for plan lock columns, `campaign_jobs`, and `voice_bibles`, plus ids and helpers, satisfies **AC-2**, **AC-4**, **AC-6**, **AC-10**
2. Luna clerk, lock merge, persist, env defaults, fail closed, satisfies **AC-1**, **AC-2**, **AC-13**
3. Enqueue on go, chat one line, worker books one day (occupancy times, Sonnet write, Luna grade, `schedule_post`), refuse second go, satisfies **AC-3**, **AC-4**, **AC-6**, **AC-9**, **AC-11**
4. Loop days to cap 30, overflow notice, retry once per day, pause / resume / stop with confirm, Schedule tab banner, satisfies **AC-5**, **AC-7**, **AC-8**, **AC-12**
5. Voice bible compile on profile or brand kit change, inject into the day write, satisfies **AC-10**, **AC-11**
6. Drop same turn autonomy volume (0013 cap 14) and route accepted multi post plans through the job (0017), satisfies **AC-3**, **AC-14**

## Consequences

**Positive**:

- Chat stays short after go.
- Captions stay on brand because Sonnet writes a day, not a hundred posts in one call.
- Calendar remains the system of record.

**Negative / tradeoffs**:

- A campaign is eventually consistent. The first rows can take a poll interval plus one model call to appear.
- Beta hard cap 30 will disappoint a 14 day, many posts per day lock until Feature 6.
- Luna as clerk can miss a rare phrasing. Fail closed means Sonnet must still collect the lock in chat.
- One in flight job per user blocks a second brand campaign until stop or finish.

**Neutral**:

- 0003, 0007, 0013, and 0017 stay in force and gain amend lines pointing here.
- Image jobs and `gpt-image-2` are unchanged.
- Feature 6 later maps Start 30 / Pro 50 / Agency 100 onto `CAMPAIGN_QUEUE_CAP` or a per user setting.

## Follow-up

- [ ] Enroll Feature 20 on the scope when the engineer accepts this spec
- [ ] Feature 6 maps 30 / 50 / 100 when billing reopens
- [ ] `/sync` after the build so AGENTS.md names the clerk and campaign worker
- [ ] If clerk quality and grade quality diverge, add `THESEAN_GRADER_MODEL` instead of sharing `THESEAN_INTENT_MODEL`
- [x] Cross check gaps closed in spec (routing math, dates, retry identity, lease, notice, voice CAS)
