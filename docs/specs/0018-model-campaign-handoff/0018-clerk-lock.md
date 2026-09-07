# 0018 clerk and plan lock

## Summary

Before Sonnet talks, Luna reads the user message and returns a small JSON object. Trusted code merges that object onto the conversation plan. Filled fields stick. Junk or a failed call means chat only.

## Requirements

**User stories**:

- As a business owner, I want the product to remember my start date and cadence so that I am not asked again after I already answered.
- As a product engineer, I want classify and extract off the operator model so that Sonnet cannot invent a book from a vague follow up.

**Acceptance criteria** (this child owns the umbrella IDs below):

- **AC-1**: Luna clerk returns structured intent and lock fields before the operator turn. If the clerk fails or returns junk, treat the turn as chat only. Sonnet talks. No live publish. No campaign start.
- **AC-2**: Filled lock fields persist on the conversation plan and are never re asked.
- **AC-13**: `THESEAN_INTENT_MODEL` defaults to `ship-like/gpt-5.6-luna`.

## Decision

Luna via the existing Thesean OpenAI provider (same family as vision). Forced structured output, not free text. Code validates with Zod before merge.

Short rationale: classify and extract are cheap, gradable jobs. Sonnet remains the talker. Sharing `THESEAN_INTENT_MODEL` with live vs draft classify (0007) keeps one clerk call per turn.

## Feature design

**Clerk input**:

- Current user message (delimiter isolated, same family as 0006 live classify)
- Prior user messages (short window, same as intent today)
- Existing plan lock fields (so the model can leave them null)
- Effective publish mode (always draft, approve for me, full access)

**Clerk output** (Zod, extra keys stripped):

| Field | Type | Meaning |
|---|---|---|
| `intent` | `chat` \| `plan` \| `accept` \| `live` \| `draft` \| `schedule_one` | What this turn is |
| `startDate` | string \| null | ISO date `YYYY-MM-DD` only |
| `timezone` | string \| null | IANA name |
| `cadence` | object \| null | `{ threadsPerDay?, linkedinPerDay?, instagramPerDay? }`, each 0..8 integer |
| `platforms` | string[] \| null | `threads`, `linkedin`, `instagram` only |
| `timeMode` | `spread` \| `windows` \| null | How code should place clocks |
| `isGo` | boolean | User accepted the lock and wants booking to start |
| `isIncomplete` | boolean | Utterance is cut off or not a real ask |
| `isConversationMeta` | boolean | Talk about the chat itself, not a post |

Junk means parse fail, schema fail, or provider error. One call, no retry. Fail closed.

**Code gates after a valid clerk object**:

1. If `isIncomplete` or `isConversationMeta` → chat only. Force non live.
2. If `intent` is `live` → existing 0006 / 0007 live path. Clerk does not publish.
3. Merge lock fields onto the plan. Never write null over a filled column.
4. If timezone still empty after merge, set profile timezone, else `UTC`.
5. If lock is complete and `isGo` or `intent` is `accept` → campaign enqueue (campaign child). Operator says the one line, does not book the run.
6. If `intent` is `schedule_one` and umbrella `plannedPosts` <= 1 → chat `schedule_post` once. Concrete time uses existing `hasConcretePublishAt`. If that is missing, occupancy places exactly one slot. Platform is clerk `platforms[0]` or the platform named in the message.
7. If `plannedPosts` > 1 → campaign path, even when `intent` is `schedule_one` (treat as accept if lock complete, else plan).
8. Otherwise Sonnet talks (plan, missing fields only, or ordinary chat).

**Lock merge**:

- Any non null clerk field **replaces** the stored value (explicit correction). Null never erases a stored field.
- `startDate`: clerk may only send `YYYY-MM-DD`. Code resolves "today" and "tomorrow" in the lock timezone before merge. If the date is before today in that timezone, bump to today. Reject years before the current UTC year minus 1.
- `cadence`: daily counts only, not per weekday. Merge per key. A zero means skip that platform. Missing keys stay stored, or 0 if never set. `timeMode` null after merge defaults to `spread`.
- `platforms`: replace only when the array is non empty.
- `themes`, `direction`, `horizonDays`: 0017 plan tools only. Clerk does not emit them.
- `lockedAt`: recompute whenever the complete lock rule holds after merge.

**Operator prompt**: inject the merged plan as authoritative. Tell Sonnet not to ask for fields that are filled. Tell Sonnet not to call `schedule_post` more than once, and not at all when a campaign job was just enqueued.

**API surface**: none. Runs inside the existing message turn, before the operator tool loop. Stream step label: "Checking your plan".

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| Clerk JSON | fields above | Luna structured output |
| Plan columns | startDate, timezone, cadence, timeMode, lockedAt | merge of clerk + prior row + profile timezone fallback |
| Fail closed | chat only | provider error, Zod fail, or `isIncomplete` / `isConversationMeta` |
| Model id | string | `THESEAN_INTENT_MODEL` |

**Key invariants**:

- Clerk never executes tools.
- Null does not erase a stored lock field.
- Fail closed never starts a job and never sets live.

**Critical test scenarios**:

- "Aug 14 2026" plus later "go with it" → startDate stored, `isGo` true, no re ask, verifies **AC-2**
- Clerk timeout → no job, Sonnet reply, verifies **AC-1**
- Clerk returns `startDate: null` when the row already has a date → date kept, verifies **AC-2**

## Build notes

Implement in `packages/orchestration` next to `resolveLivePublishIntent`. Reuse `TheseanOpenAIModelProvider` when the intent model id contains `gpt-`. Extend `ContentPlanPatch` and `conversation_content_plans`. Unit tests for Zod, merge, and fail closed. No `/develop` work in the architect pass.
