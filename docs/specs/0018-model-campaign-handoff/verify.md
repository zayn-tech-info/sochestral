# Verify: model and campaign handoff · spec 0018 · updated 2026-08-14
_Steps derived from spec 0018 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] In chat, give a complete lock (themes or direction, platforms, cadence, start date) then say go. Chat returns at once with "Booking started. Day 1 of {horizon}. Watch the Schedule tab." Stream label is "Booking your campaign". → AC-4
- [ ] Open Schedule. Banner shows Day N and X of 30 queued. Rows appear as the worker books. → AC-8
- [ ] Pause shows "Pause stops new days. Posts already on your calendar stay. You can resume later." Confirm is required. Resume later continues. → AC-7
- [ ] Stop shows "Stop ends this campaign. Posts already on your calendar stay. You can cancel those on the list if you want." Confirm is required. Booked rows stay. → AC-7
- [ ] Start date already stored. A later turn does not ask for it again. → AC-2
- [ ] Ask for two or more posts with a complete lock. Chat does not fire many `schedule_post` calls. A campaign job is queued instead. → AC-3
- [ ] Ask for one concrete post. Chat uses `schedule_post` once. → AC-3
- [ ] Second go while a job is queued, running, or paused is refused in chat. → AC-6
- [ ] A lock that would need more than 30 posts succeeds with notice "Queued 30 posts. The rest of the lock was not booked." → AC-5
- [ ] Day captions read on brand (voice bible present) and are not a generic dump. → AC-10, AC-11

## Commands
- [ ] `pnpm --filter @sochestral/database test -- src/content-plan.test.ts src/campaign-job.test.ts` → lock columns, one in flight, pause/resume/stop → AC-2, AC-6, AC-7
- [ ] `pnpm --filter @sochestral/orchestration test -- src/clerk-lock.test.ts src/campaign-day.test.ts src/config.test.ts` → clerk merge, fail closed, Luna default, occupancy slots → AC-1, AC-2, AC-9, AC-13
- [ ] `pnpm --filter @sochestral/api test -- src/campaign-routes.test.ts` → GET current owner only, pause without confirm is 400 → AC-7, AC-8
- [ ] `npm test -- src/components/app/campaign-banner.test.tsx` from `web/` → Day N, X of 30, pause warn → AC-7, AC-8
- [ ] Confirm tables `campaign_jobs` and `voice_bibles` exist, and `conversation_content_plans` has `start_date`, `timezone`, `cadence`, `time_mode`, `locked_at`. → AC-2, AC-4, AC-10

## Value sourcing
- [ ] Clerk JSON comes from Luna structured output (`THESEAN_INTENT_MODEL`, default `ship-like/gpt-5.6-luna`). Junk or timeout → chat only, no live, no job. → AC-1, AC-13
- [ ] Timezone when omitted is the profile timezone, else `UTC`. → AC-9
- [ ] Clock times for a day come from 0013 playbook hours in trusted code, not from the model. → AC-9
- [ ] Relative "today" / "tomorrow" resolve in the lock timezone. Past dates bump to today. → AC-2
- [ ] Cap is `CAMPAIGN_QUEUE_CAP` default 30. `bookedCount` never exceeds cap. → AC-5
- [ ] Day N is 1 plus calendar days from plan `startDate` to `nextDate`. → AC-8
- [ ] Voice `sourceHash` is sha256 of tone, audience, do_not, brand_fact entries plus brand colors and notes. Compile uses `THESEAN_VOICE_MODEL` default `ship-like/claude-opus-5`. → AC-10, AC-13
- [ ] Day write uses `THESEAN_MODEL` (Sonnet). Grade uses `THESEAN_INTENT_MODEL` (Luna). One rewrite on fail, then book anyway. → AC-11
- [ ] Same day fails twice → job `failed`. Partial bookings stay. → AC-12
- [ ] Foreign user GET `/campaigns/current` is 404. → AC-8

## Acceptance-criteria coverage
- AC-1 covered by clerk fail closed command and chat only manual
- AC-2 covered by re ask manual, merge unit, lock columns
- AC-3 covered by two post vs one post manual and cap 1 in chat
- AC-4 covered by go returns at once manual and worker tick
- AC-5 covered by overflow notice manual and cap config
- AC-6 covered by second go manual and in flight unique
- AC-7 covered by pause/stop warn UI and confirm 400
- AC-8 covered by banner UI and GET current isolation
- AC-9 covered by occupancy slot unit and timezone source
- AC-10 covered by voice compile trigger and day inject
- AC-11 covered by Sonnet write plus Luna grade
- AC-12 covered by retry once then fail
- AC-13 covered by config defaults (Luna clerk, Sonnet operator, Opus voice)
- AC-14 covered by dropping the 14 same turn cap and routing volume through the job
