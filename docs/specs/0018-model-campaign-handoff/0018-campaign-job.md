# 0018 campaign job

## Summary

When the lock is complete and the user says go, chat inserts a campaign job and returns. A poll loop in `sochestral-api` writes one day, grades it, and books through existing `schedule_post`. The Schedule tab shows counts and can pause or stop.

## Requirements

**User stories**:

- As a business owner, I want go to return at once so that I am not stuck in chat while 30 posts book.
- As a business owner, I want to pause or stop on the Schedule tab so that I can halt new days without losing what already booked.

**Acceptance criteria** (this child owns the umbrella IDs below):

- **AC-3**: More than one post uses a campaign job. One concrete post uses chat `schedule_post`.
- **AC-4**: Go on a complete lock enqueues a job. Chat returns one line. The worker books one day at a time.
- **AC-5**: Cap 30. Extra planned posts are not queued. Job succeeds with a notice.
- **AC-6**: One in flight per user. Second go is refused.
- **AC-7**: Pause, resume, stop with warn and `confirm: true` on pause and stop.
- **AC-8**: Schedule tab banner: Day N, X of 30, Pause, Stop. Rows appear as they book.
- **AC-9**: Times from 0013 occupancy code. Timezone profile then UTC.
- **AC-11**: Sonnet writes the day. Luna grades. One rewrite if generic or duplicate.
- **AC-12**: Retry a failed day once, keep partial bookings, then continue. Fail the job only after two failures on the same day.

## Decision

New `campaign_jobs` row. Worker in the same process as the image worker (`startCampaignWorker` next to `startImageWorker`). Occupancy code from 0013 places clocks. Sonnet writes captions for that day only. Luna grades. `schedule_post` writes SocialMCP.

Short rationale: image jobs already prove Postgres plus a Fly poll loop. A second Fly app is extra ops. Storing captions on the job would fork Calendar.

## Feature design

**Enqueue** (orchestration, after clerk gates):

- Require complete lock and `isGo` / accept
- Require more than one planned post (cadence times remaining days, or user named several items)
- If a row exists for this user in queued, running, or paused → refuse in chat, no insert
- Insert `queued` with `cap` from `CAMPAIGN_QUEUE_CAP`, `bookedCount` 0, `nextDate` = plan `startDate`, `dayAttempts` 0
- DeepSeek search: enqueue first so chat returns. If `researchSummary` is empty, the first worker day runs existing 0017 search (fail open, no fake citations)
- Assistant text: "Booking started. Day 1 of {horizonDays}. Watch the Schedule tab."
- Stream label: "Booking your campaign"
- No media on campaign days in v1. Platform and account follow 0013 (connected account for each plan platform)

**Worker tick** (`CAMPAIGN_WORKER_POLL_MS`, default 2000):

1. Claim oldest `queued` row → `running` (compare and set)
2. If `bookedCount` >= `cap` → `succeeded`, notice already stored or write lastError null, stop
3. Re read status. If paused or stopped, exit the tick without booking
4. Build occupancy candidates for `nextDate` in plan timezone (0013). Count = daily cadence totals. Skip `publishAt` values already in `bookedPublishAts`
5. If no new slots remain on that date (occupancy full or date past horizon) → advance `nextDate` by one day. If `nextDate` is past startDate + horizonDays − 1 → `succeeded`
6. Sonnet day write: plan, research, voice bible, yesterday captions from this job only (`bookedPublishAts`), occupancy `publishAt` list. Output one caption per slot. No extra slots
7. Luna grade: JSON `{ fail, reasons: generic|duplicate|length[] }`. Length from 0013 playbooks. Duplicate vs this job's prior captions. On fail, Sonnet rewrites only those items once. If still fail, book the rewrite anyway (taste fail does not fail the day)
8. For each item, re read status, then `schedule_post` with idempotency key `campaign:{jobId}:{publishAt}`. On success append `publishAt` to `bookedPublishAts` and increment `bookedCount` in the same DB write. Stop once `bookedCount` hits `cap` (set `notice` if later days remain)
9. If MCP succeeds and the DB write fails, the next tick reconciles from `bookedPublishAts` plus SocialMCP rows with that idempotency prefix
10. On full day success (every remaining slot booked or skipped as already booked): `dayAttempts` = 0, `nextDate` += 1 day, status `queued`, unless cap or horizon ended (`succeeded`)
11. Day failure (occupancy empty while dailyTotal > 0, or Sonnet call fails, or every `schedule_post` that day fails): increment `dayAttempts`. If < 2, return to `queued` for the same `nextDate`. If 2, set `failed` and `lastError`. Keep partial `bookedCount`
12. `running` with `startedAt` older than `CAMPAIGN_LEASE_MS` → `queued` (crash reclaim)

**Pause / resume / stop**:

- Pause: from `queued` or `running`. Status `paused`. Worker skips paused rows and re checks before each `schedule_post`.
- Resume: `paused` → `queued`
- Stop: `queued` | `running` | `paused` → `stopped`. Worker does not cancel SocialMCP rows
- POST pause and stop require `confirm: true`

**Schedule tab**:

- Existing `GET /scheduled/posts` keeps listing SocialMCP rows as they appear
- Banner from `GET /campaigns/current` (in flight, else latest job)
- In flight: Day N, `{bookedCount} of {cap} queued`, Pause, Stop
- Terminal: hide Pause and Stop, show `notice` or `lastError`
- Pause and Stop open the product owned warn, then POST with confirm
- Resume shows when status is paused

**Value sourcing**: see umbrella table. Day captions from Sonnet. Times from 0013. Counts from `campaign_jobs`.

**Key invariants**:

- Worker never live publishes.
- `bookedCount` <= `cap`.
- One in flight per user (partial unique).
- Chat turn after enqueue must not call `schedule_post` for the campaign run.

**Critical test scenarios**:

- Go → job row → worker books 5 Threads + 1 LinkedIn on day 1 → list has 6 new rows, verifies **AC-4**, **AC-8**, **AC-9**
- Cap 30 mid horizon → succeeded, no 31st `schedule_post`, verifies **AC-5**
- Second go → chat refuse, one job row, verifies **AC-6**
- Pause with confirm false → 400, verifies **AC-7**
- First day provider error, second try success → not `failed`, verifies **AC-12**
- Grade fail then rewrite pass → one rewrite call, then schedule, verifies **AC-11**

## Build notes

`packages/database` job helpers, `packages/api` routes and `campaign-worker.ts`, `packages/orchestration` enqueue, `web/` Schedule tab banner on the existing scheduled posts surface (0011). No `/develop` work in the architect pass.
