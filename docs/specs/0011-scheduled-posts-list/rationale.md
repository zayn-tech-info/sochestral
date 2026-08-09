# 0011 Rationale: Scheduled posts list

## Context

Feature 10 shipped a week calendar (spec 0010) so owners see schedules on a time grid. Operators also asked for a Scheduled Posts section where they can view all schedules and sort or filter easily. Pointing both Calendar and Scheduled Posts at `/app/calendar` felt wrong in the product rail. The list is a different job: inventory and search, not week layout.

SocialMCP remains the schedule store. Product Neon must not grow a second schedule table. The calendar API caps reads at 8 days for week cells; a list of “everything upcoming” needs a different product contract with an honest page size. Create by form is desired later; chat remains the create path for now.

## Options considered

### Option 1: Alias Scheduled Posts to the week calendar

One route, two nav labels.

**Pros**:
- No new page or API rules.

**Cons**:
- Fails the inventory job; confusing duplicate nav.

### Option 2: Dedicated list at `/app/scheduled` with 30 day window paging (chosen)

Separate rail item, table UI, new list endpoint, shared detail with 0010.

**Pros**:
- Clear jobs for Calendar vs Scheduled Posts.
- Keeps week 8 day cap honest.
- Reuses detail, accounts, and SocialMCP projections.

**Cons**:
- Extra surface to build and verify.
- Long history needs multiple hops.

### Option 3: Mirror schedules into Neon for rich query

Product DB becomes the list source of truth.

**Pros**:
- Fast local sort/filter and long history.

**Cons**:
- Dual write and sync risk with SocialMCP.
- Contradicts the 0010 invariant and repo split.

### Option 4: One parent schedule hub with Week and List tabs

Single `/app/schedule` with tab chrome.

**Pros**:
- One mental parent for schedule.

**Cons**:
- Heavier IA change now; engineer preferred separate rail routes.

## Rationale

Option 2 matches the product ask: a real Scheduled Posts section with sort and filter, without pretending the week grid is a list and without copying SocialMCP into Neon. A fixed 30 day request window (client shifts the window; `hasOlder` / `hasNewer` gate the controls) is the pagination story while MCP list tools lack date filters and cursors. Product applies the 0010 status bucket map in process so Canceled covers both spellings and unknown MCP statuses stay honest. Shared detail avoids two mutation UIs. Workspace links for Chat and Create keep empty states useful until a manual form ships.

Design direction is a calm operator table on existing Sochestral tokens, not a second dark SaaS clone.

Cross check (2026-08-09) locked default window length, status driven window reset for past buckets, product side status filtering, response booleans for range controls, 422 codes, tie break, empty branching, and AC-14 on MCP fetch cost.
