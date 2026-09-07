# 0017. Content planning and conversation context

**Date**: 2026-08-13
**Status**: In Progress
**Amended**: 2026-08-14 — plan snapshot gains lock fields. After accept, volume uses the campaign job in [0018](../0018-model-campaign-handoff/index.md). Discuss first, DeepSeek search, and one plan per conversation stay here.

## Summary

Chat can plan content with the operator before it schedules. Ideas, research, and follow ups stay in conversation. A stored plan snapshot keeps the mission and the agreed direction when later turns schedule. Web research always goes through DeepSeek, including when the operator asks the agent to do it all.

## Requirements

**User stories**:

- As a business owner, I want to brainstorm content ideas in chat so that Sochestral learns what I want before it books the calendar.
- As a business owner, I want the agent to search the web for related trends and how people actually post so that captions sound human, not generic AI.
- As a business owner, I want a short brief only when I ask the agent to do it all, then I want it to research and schedule from that brief.

**Acceptance criteria**:

- **AC-1**: Planning-together asks (schedule some content for the next days, plan with me, help me with posts this week, and similar meaning) resolve as chat or draft. They never open the publish confirm carousel. A specific post or time (`Schedule this for Friday at 3pm`) still schedules.
- **AC-2**: Discuss first turns stay in idea collection until the operator gives a handful of ideas (direction, topics, or audience) or clearly wants the agent to do it all. They may call `research_web`. They do not invent a day-by-day plan from the brand profile, and they do not call `prepare_review` or `schedule_post` until the user accepts specific items.
- **AC-3**: Autonomy (do it all) asks only for missing content type, direction, and platform. After those answers, trusted code runs DeepSeek web search before any `schedule_post`.
- **AC-4**: `research_web` uses DeepSeek Responses API `web_search` with the existing `DEEPSEEK_API_KEY`. Missing key or provider error fails open with no fake citations.
- **AC-5**: Each conversation has at most one plan snapshot (horizon, platforms, content type, direction, themes, accepted items, research summary). Later turns inject it next to the profile note.
- **AC-6**: Scheduled captions must follow the research and plan. The model is told to write like a person in that niche, not generic AI posts.
- **AC-7**: After the user accepts a stored plan, existing `schedule_post` plus the 0013 occupancy brief create SocialMCP schedules. No second schedule store.
- **AC-8**: Stream label for `research_web` is Searching the web. Unit tests cover planning intent, DeepSeek fail open, plan upsert, and autonomy brief questions.

## Decision

**Chosen option**: Discuss first planning with a conversation plan snapshot and DeepSeek Responses web search on both discuss and do it all paths.

**Implementation skills**: `postgres-drizzle` (`.agents/skills/postgres-drizzle/`) · `drizzle-orm-patterns` (`.agents/skills/drizzle-orm-patterns/`) · `hono` (`.agents/skills/hono/`)

## Feature design

**Data model sketch**:

`conversation_content_plans` one row per conversation.

| Column | Required | Notes |
|---|---|---|
| `id` | yes | `cplan_` + nanoid(21) |
| `conversation_id` | yes | unique FK, cascade |
| `user_id` | yes | FK, cascade |
| `horizon_days` | yes | default 14, 1 to 30 |
| `platforms` | yes | jsonb string array |
| `content_type` | no | educational, product, founder, mixed, custom |
| `direction` | no | short operator direction |
| `themes` | yes | jsonb string array |
| `accepted_items` | yes | jsonb objects |
| `research_summary` | no | DeepSeek search notes |
| `updated_at` | yes | |

**State transitions**: empty plan → brief or discuss fills fields → research summary set → user accepts items → `schedule_post`.

**API surface**:

| Surface | Change |
|---|---|
| Model tool `research_web` | query + why; orchestration calls DeepSeek |
| Model tool `save_content_plan` | upsert conversation plan |
| Intent | `localPlanningIntent` → draft |
| Autonomy questions | `content_type`, `direction`, optional `platform` |
| Stream | `research_web` → Searching the web |

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| Planning vs publish | draft | local planning cues |
| Mission | compiled note | existing profile compile |
| Working plan | snapshot row | `save_content_plan` or brief answers |
| Search notes | research_summary | DeepSeek Responses `web_search` |
| Occupancy | candidates | 0013 brief builder |
| Schedules | SocialMCP rows | existing `schedule_post` |

**Key invariants**:

- Do it all still searches before scheduling.
- No fake citations when DeepSeek is down.
- Plan rows are conversation scoped and user owned.
- Live publish stays gated by existing authority.

**Security model**: Session user owns the conversation and the plan. Search queries send business name, industry, and the ask. No tokens.

**Configuration required**:

- `DEEPSEEK_API_KEY`: already used for setup research; now also Responses web search

**Critical test scenarios**:

- Plan-together asks (schedule some content for the next days, help me with posts this week) → draft / idea collection, no invented Day 1 plan, verifies **AC-1**, **AC-2**
- Do it all without type → content questions, verifies **AC-3**
- Do it all with answers → DeepSeek called then schedule path, verifies **AC-3**, **AC-4**, **AC-6**
- Missing DeepSeek key → fail open, verifies **AC-4**
- Plan upsert then inject, verifies **AC-5**, **AC-7**, **AC-8**

## Build plan

1. [ ] Schema, migration, plan helpers (**AC-5**)
2. [ ] DeepSeek Responses search client + `research_web` (**AC-4**, **AC-8**)
3. [ ] Planning intent, SYSTEM_MESSAGE, autonomy questions (**AC-1**, **AC-2**, **AC-3**, **AC-6**)
4. [ ] Inject plan + research into autonomy brief, then `schedule_post` (**AC-3**, **AC-6**, **AC-7**)
5. [ ] Stream label + tests (**AC-8**)

## Consequences

**Positive**: Planning talks stay talks. Do it all still grounds posts in real search.

**Negative / tradeoffs**: DeepSeek search adds latency on autonomy turns. Research quality depends on that provider.

**Neutral**: 0012 concrete time schedule and 0013 occupancy heuristics stay. Feature 11 memory waits.

## Follow-up

- Agent owned Threads or social lookup
- Feature 11 lasting correction rules
- Image generate and deleted chat data loss (parked)

## Rationale

See [rationale.md](./rationale.md).
