# 0014. Onboarding wizard and settings split

**Date**: 2026-08-11
**Status**: Built (verify/test open)

Supersedes the onboarding path and settings surface of [0009](../0009-setup-agent-business-profile/index.md). Keeps categorized `profile_entries`, compile-at-read note injection, and tenancy from 0009.

## Summary

New users complete a multi-step web wizard (business details, who they are, skills, primary platforms, attribution) before AI Workspace unlocks. Settings splits into Personal information (wizard identity fields) and Memory (agent-learned entries). Operator chat still injects a compiled profile note after setup is complete. The conversational setup agent is no longer the default incomplete-profile path.

## Requirements

**User stories**:

- As a new user, I want a clear wizard that asks who I am and what I do so Sochestral can personalize drafts without a chat interview.
- As a user, I want to edit my identity fields in Settings Personal information so I can fix mistakes without chat.
- As a user, I want Memory settings for tone, competitors, and do-not rules the agent learned so those stay separate from my identity form.
- As a product engineer, I want incomplete profiles blocked from operator chat until the wizard finishes so generation never runs blind.

**Acceptance criteria**:

- **AC-1**: Migration extends `business_profiles` with `persona_role`, `persona_role_other`, `primary_platforms` (jsonb array), `attribution_source`, `attribution_other`. Existing rows remain valid; already-`complete` users stay unlocked.
- **AC-2**: Wizard steps in order: business details → who you are → skills → platforms → attribution. Progress persists via `setup_step` and PATCH `/profile`. Description requires ≥30 words. Website optional. At least one skill, one platform, and an attribution choice (Other requires text).
- **AC-3**: Finishing the wizard sets `setup_status` to `complete` when minimum identity fields are satisfied. Skills are active `profile_entries` with `category=skill` and `source=setup`.
- **AC-4**: Web hard gate: authenticated users with `setup_status !== complete` are redirected to `/app/onboarding` and cannot use AI Workspace chat. Onboarding itself is reachable.
- **AC-5**: Operator turn API refuses incomplete profiles with a product error (does not start the conversational setup agent by default). When complete, every operator turn still injects `compileProfileNote` (AC-6 from 0009, retained).
- **AC-6**: Settings hub lists Personal information and Memory (plus existing Connected Accounts / Brand Assets). `/app/settings/profile` redirects to Personal information. Memory keeps entry CRUD for tone, do_not, cadence, competitor, audience, brand_fact and shows the compiled note.
- **AC-7**: Minimum complete for new completions: business name, description (≥30 words), persona role (+ other text when Other), ≥1 active skill, ≥1 primary platform, attribution source (+ other text when Other). Tone and competitor are not required for the gate.
- **AC-8**: Personal information can redo wizard (`setup_status` → `in_progress`) without wiping Memory unless the user confirms reset.

## Decision

**Chosen option**: Post-login multi-step wizard with hard workspace gate; Settings split into Personal information + Memory; soft-deprecate chat setup agent as the incomplete path.

**Implementation skills**: `postgres-drizzle` · `drizzle-orm-patterns` · `hono`

## Feature design

**Wizard step ids** (`setup_step`): `business_details` | `who_you_are` | `skills` | `platforms` | `attribution` | `done`

**Persona roles**: `student` | `content_creator` | `business_owner` | `entrepreneur` | `freelancer` | `other`

**Attribution sources**: `twitter` | `instagram` | `linkedin` | `friend` | `other`

**Primary platforms**: subset of `threads` | `linkedin_personal` | `instagram`

**Preset skills** (multi-select, stored as skill entries): Content writing, Brand design, Product marketing, Community, Ads, Founder storytelling, Short-form video, SEO content.

**API**:

| Endpoint | Method | Notes |
|---|---|---|
| `/profile` | GET | Includes new identity fields + `minimumComplete` + sections |
| `/profile` | PATCH | Identity fields, `setupStep`, `skills` (string[] replace active setup skills), `primaryPlatforms`, `redoSetup` / `confirmReset`, `completeSetup: true` to finish when valid |
| `/profile/entries` | CRUD | Memory categories unchanged |

**Web routes**: `/app/onboarding`, `/app/settings/personal`, `/app/settings/memory`

## Build plan

1. Migration + profile helpers + compile note + API projection/patch.
2. Onboarding wizard UI + workspace hard gate.
3. Settings Personal information + Memory pages; hub + nav updates.
4. Orchestration: incomplete → refuse operator turn (no setup-agent route by default).
5. Tests for completeness, routes, wizard gate, settings.

## Consequences

- Existing complete users keep access without re-wizard.
- Incomplete users mid chat-setup must finish the web wizard.
- Competitor research / tone sample posts leave the forced onboarding path; Memory can still hold those entries later.

## Follow-up

- Optional Memory deep-link to competitor research.
- Goal stage for ICP personalization (deferred).
- Update scope Feature 7 / Feature 10 pointers after ship.

## Rationale

See plan lock: platforms-only extra stage; Gate A hard block until wizard complete. Replaces 0009 forced chat setup as the primary identity capture path while preserving structured entries and note injection.
