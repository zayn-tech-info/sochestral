# 0018 rationale

## Context

> Premise note: Raising the chat `schedule_post` cap looks simpler. It recreates the failure we already saw. The operator turn tries to clerk, talk, and book a large run at once. It re asks answered fields, invents times, and keeps the user in the thread. Volume belongs on a worker. Chat belongs to lock and go.

Sochestral is a business strict social operator. Users need a short plan talk, then a large calendar fill (beta 30 queued posts, later 50 or 100 by tier). Today one Thesean chat model does classify, conversation, and `schedule_post` in the same turn. The plan snapshot from 0017 stores themes and research, not start date, timezone, or cadence. 0013 books up to 14 in that same turn. After go, the model often asks again for data the user already gave.

Thesean already exposes Anthropic and OpenAI routes. Sonnet is the operator. Opus is setup. Luna is vision only. DeepSeek is search. SocialMCP `schedule_post` and the image worker loop in `sochestral-api` already exist. Feature 6 tiers are deferred. A second schedule store is out of scope.

Not deciding leaves the product stuck: either a long chat that never books, or one turn that cannot write human copy at volume.

## Options considered

### Option 1: Raise the chat schedule cap

Keep one model loop. Lift `STANDARD_SCHEDULE_POST_CAP` and `AUTONOMY_SCHEDULE_POST_CAP` toward 30 or 100. Widen accept phrases.

**Pros**:
- Smallest code change
- No new table or worker

**Cons**:
- One Thesean turn cannot write 30 human captions and stay inside tool step limits
- The user waits on the whole run
- The same re ask and invented time bugs remain

### Option 2: Clerk, then code gates, then Sonnet, then a campaign worker

Luna extracts intent and lock fields. Code merges and gates. Sonnet talks or enqueues. An api worker writes one day, grades, and calls existing `schedule_post`.

**Pros**:
- Chat returns after go
- Copy quality stays a day sized Sonnet job
- Reuses image worker hosting and SocialMCP schedules

**Cons**:
- More moving parts (clerk schema, job row, poll loop, tab banner)
- First rows appear after a short delay

### Option 3: Sonnet does everything, worker only retries

Keep Sonnet as clerk and operator. Add a job only as a retry queue for `schedule_post` calls the chat already composed.

**Pros**:
- One writer model
- No Luna JSON contract

**Cons**:
- Sonnet still spends the turn classifying and composing many slots
- Does not fix re ask; the lock is still only in chat text
- Cost and latency stay on the user facing turn

### Option 4: Second product schedule store

Persist captions and times in Postgres and let a product worker publish later, bypassing SocialMCP schedules.

**Pros**:
- Full product control of the queue

**Cons**:
- Forks the calendar (0010 / 0011 / 0017 AC-7 forbid this)
- Duplicate cancel, occupancy, and publish paths

## Rationale

Option 2 matches the forces. The user wants a short go, human copy, and a full calendar. Option 1 fails the wait and the quality bar. Option 3 leaves classify and lock on the expensive operator. Option 4 splits the system of record.

Luna is the cheap clerk and grader because those jobs are structured and easy to fail closed. Sonnet stays the person in the chat and the day writer because restraint and voice are the product. Opus writes the voice bible once, the same compile once pattern as 0016. Times stay in 0013 occupancy code because models have already invented past years.

The worker lives in `sochestral-api` because the image worker already polls Postgres on Fly. SocialMCP remains the schedule store so Calendar, cancel, and publish stay one path.

Cap 30 is a product default until Feature 6. Overflow books 30 and tells the truth instead of refusing a valid lock.
