# Verify: Chat schedule loop · spec 0012

## Commands

- [x] `pnpm --filter @sochestral/orchestration test` → 200 passed → AC-1, AC-2, AC-3, AC-6, AC-7, AC-9
- [x] Migration `0011_chat_schedule_loop` applied on test DB → AC-8

## UI / manual (cloud or local with SocialMCP)

- [ ] Sign in → ask chat to schedule a post with a concrete UTC time and platform → preview/prepare when content is new → confirmation includes Calendar / Scheduled Posts links → row appears on `/app/calendar` or `/app/scheduled` → AC-1, AC-3, AC-7
- [ ] Ambiguous clarify → choose Schedule a post → turn continues with `liveIntentKind` schedule, not live → AC-2, AC-6
- [ ] Force MCP schedule failure → assistant must not claim scheduled → AC-3
- [ ] Ask for more than five images → agent states the cap → AC-4
- [ ] Multi day series without acceptance → agent proposes a plan, does not fan out N `schedule_post` calls → AC-5

## Acceptance criteria coverage

- AC-1 · Zod + allowlist + service MCP call with `publishAt` (unit proven; live SocialMCP smoke pending)
- AC-2 · schedule intent + clarify goal option (unit proven)
- AC-3 · SYSTEM_MESSAGE + never claim success without tool ok (unit + prompt; live smoke pending)
- AC-4 · media max 5 (schema unit proven; chat wording pending live)
- AC-5 · multi post plan (prompt contract; live smoke pending)
- AC-6 · schedule under always_draft without explicitLiveIntent (unit proven)
- AC-7 · safe summary + deep links (unit + UI)
- AC-8 · DB checks (migration + schema)
- AC-9 · tests landed
