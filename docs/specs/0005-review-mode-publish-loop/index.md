# 0005. Review mode publish loop

**Date**: 2026-08-01
**Status**: In Progress

## Summary

Review mode is the only live publishing mode in this slice. Sochestral opens each review set in a focused modal so the user can edit and approve it without scrolling through the conversation. Trusted product code publishes the validated snapshots through SocialMCP. Chat text and model tool calls can never authorize a live post.

## Requirements

**User stories**:

- As a business owner, I want to edit and approve one coordinated set of platform drafts so that I stay in control of every live post.
- As a business owner, I want each platform result preserved so that a partial failure does not repeat successful posts.
- As a product engineer, I want live execution isolated behind trusted application actions and tenant scoped idempotency so that model output, duplicate clicks, timeouts, and retries cannot create duplicate posts.

**Acceptance criteria**:

- **AC-1**: The product local `prepare_review` tool can create one review group with at most one draft for each explicitly requested supported platform. It may preserve useful invalid drafts, but it cannot execute SocialMCP or authorize live publishing.
- **AC-2**: New review drafts store their conversation and group, ordered media URLs, selected account, positive revision, validation summary, validated revision, and lifecycle state. Legacy draft links remain nullable. Deleting an idle conversation cascades through its review drafts and attempts, while an active publish blocks deletion.
- **AC-3**: A user can explicitly save draft text, ordered media URLs, and account selection with optimistic revision checking. A normalized content or account change increments revision and clears prior validation and approval state. No meaningful change preserves the revision. Published and unknown drafts are locked.
- **AC-4**: Draft text is limited to 8000 characters and media to 10 public HTTPS URLs. Media URLs must have appeared in an owning user message or have been entered in the review card. Invalid platform content is stored with safe warnings and blocking errors.
- **AC-5**: The review set selects the only eligible connected account automatically and requires a choice when several active accounts exist. Full validation and account preflight pass for every draft before any live call, otherwise none publish.
- **AC-6**: One browser generated request id and the expected revision of every draft approve the complete review set. Only the explicit `Approve and publish` action can do this. The server creates immutable attempts before execution and runs no more than three platform calls concurrently.
- **AC-7**: Each live SocialMCP call carries `pub_` plus the SHA 256 digest of user id, approval request id, draft id, and revision. SocialMCP reserves that tenant scoped key before provider execution and replays active or terminal safe state for repeated keys.
- **AC-8**: Group results preserve every platform outcome. A retry creates attempts only for known failed drafts. An unknown draft is locked and offers status reconciliation with the original snapshot and idempotency key, which can never trigger a second provider call.
- **AC-9**: Sochestral waits up to 30 seconds for a publish response and records a still active execution as unknown. SocialMCP treats executions active for three minutes as unknown. Reopening the conversation restores persisted review and attempt state.
- **AC-10**: A rolling limit permits at most 20 actual platform calls per user per hour. Validation, preview, idempotent replay, and status checks do not count. If the full eligible group exceeds the remaining capacity, none publish.
- **AC-11**: Conversation reads and message responses expose safe structured review groups inside the request scoped activity for the run that created them. The newest actionable group opens automatically in one accessible modal with internal scrolling and a visible close control. The transcript keeps a compact summary control directly beneath the owning assistant response. A request that created no review group shows no review launcher. The modal supports edits, ordered media URLs, account choice, character information, warnings, errors, one group action, per platform progress, retry, and status checks. It traps focus while open, closes with Escape or its close control, restores focus to its launcher, and becomes a full height surface on narrow screens. Completed groups do not open automatically when an old conversation is restored.
- **AC-12**: Review mutations require the session owner, the exact configured web origin, JSON content, and `X-Sochestral-Request: review-action`. The browser never receives MCP credentials, OAuth tokens, raw provider payloads, hidden prompts, media fetch results, unredacted errors, post text in logs, or media URLs in logs.
- **AC-13**: SocialMCP `publish_now` requires `idempotencyKey` for confirmed live calls and returns `replayed` plus a safe execution state. Dry run remains compatible without a key. Model execution remains restricted to preview behavior.

## Decision

**Chosen option**: Modal grouped review with trusted server side live execution

Sochestral persists editable review state and safe outcomes. The web app presents that state in a focused modal and leaves only a compact review summary in the transcript. SocialMCP remains the source of truth for platform accounts, tokens, external execution, and idempotent publish logs. The model may prepare review data, but a browser action handled by trusted product code is the only live authority.

**Implementation skills**: `postgres-drizzle` (`ccheney/robust-skills`, `.agents/skills/postgres-drizzle/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.agents/skills/drizzle-orm-patterns/`) · `hono` (`yusukebe/hono-skill`, `.agents/skills/hono/`) · `auth-implementation-patterns` (`wshobson/agents`, `.agents/skills/auth-implementation-patterns/`)

## Rationale

Reasoning and alternatives: see [rationale.md](./rationale.md).

## Feature design

**Data model sketch**:

`drafts` keeps its existing primary key and owner. It adds nullable `conversation_id` with cascade deletion, nullable `review_group_id`, nullable `selected_account_id`, positive `revision` defaulting to 1, JSON validation errors and warnings, nullable `validated_revision`, and lifecycle state `draft`, `approved`, `publish_requested`, `published`, `failed`, or `unknown`. `media_urls` becomes a required ordered text array with an empty array default. New review creation requires conversation and group links in application code. A partial unique constraint permits one platform draft per nonnull group.

`draft_publish_attempts` stores `id`, `draft_id`, `user_id`, `approval_request_id`, globally unique `idempotency_key`, immutable platform, body, ordered media URLs, selected account, revision, state, safe error code and message, MCP post id, created time, updated time, and completion time. State is `publishing`, `succeeded`, `failed`, or `unknown`. Foreign keys and rate queries are indexed. A partial unique index permits only one `publishing` attempt per draft.

**State transitions**:

- Draft: `draft` to `approved` to `publish_requested` to `published`, `failed`, or `unknown`.
- Editing a failed draft returns it to `draft`. Published is terminal. Unknown can change only through status reconciliation.
- Attempt: `publishing` to `succeeded`, `failed`, or `unknown`. Unknown can reconcile to succeeded or failed with the same key.

**Web interaction**:

The chat renders one compact launcher for each persisted review group. The newest group with an editable, failed, publishing, or unknown draft opens automatically when it first appears or when its conversation is opened. Closing the modal suppresses automatic reopening for that mounted conversation, while the launcher remains available. A completed group opens only when the user activates its launcher. The native dialog owns focus, Escape handling, backdrop isolation, and focus return. Its content scrolls inside the viewport, while its heading and primary group action remain visible. Publishing continues if the modal closes, and the compact launcher reflects restored status after refresh.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/review/drafts/:draftId` | PATCH | expectedRevision, body, mediaUrls, selectedAccountId | updated draft, safe validation | owner session plus trusted web request | 401, 404, 409, 422 |
| `/review/groups/:groupId/publish` | POST | requestId, expected revision for every draft | group id, per platform results | owner session plus trusted web request | 401, 404, 409, 422, 429, 502 |
| `/review/attempts/:attemptId/check` | POST | empty JSON object | reconciled attempt and draft | owner session plus trusted web request | 401, 404, 409, 502 |
| `/orchestration/conversations/:id` | GET | existing cursor inputs | conversation, messages, request scoped turn activities containing owned review groups | owner session | existing errors |

Review actions require `application/json`, the exact `CORS_ORIGIN`, and `X-Sochestral-Request: review-action`. Ownership failures are masked as `404`. Publish requests are idempotent by owner and request id. A second request with the same request id replays the stored group outcome rather than creating attempts.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Prepare review | owner and conversation | authenticated orchestration run and its conversation |
| Prepare review | requested platforms | explicit platform resolution already persisted on the triggering run |
| Prepare review | text and ordered media | locally validated `prepare_review` model arguments |
| Accept model media | permitted URLs | URLs present in owning user messages for that conversation |
| Save card media | permitted URLs | explicit browser input after trusted request checks |
| Select account | eligible identities | tenant scoped `list_connected_accounts` result from SocialMCP |
| Save draft | next revision | current revision plus one only when normalized body, media, or account changes |
| Validate draft | errors, warnings, character facts | local product limits plus SocialMCP `validate_post` safe projection |
| Approve group | request identity | browser generated UUID |
| Create attempt | immutable snapshot | owned draft columns at the expected revision |
| Create attempt | MCP key | `pub_` plus SHA 256 of owner id, approval request id, draft id, and revision |
| Execute publish | tenant | product session owner encoded in a fresh MCP JWT subject |
| Execute publish | live confirmation | trusted server code after whole set preflight, never request text or model arguments |
| Rate limit | actual call count | nonreplayed attempts created for the owner in the preceding hour |
| Display result | public state, post id, safe error | persisted attempt projection and SocialMCP safe result |
| Restore chat | review cards and latest outcomes | owned drafts and attempts joined to the conversation |
| Open review modal | newest actionable group | persisted review group order and draft lifecycle state |
| Reopen review modal | selected group | compact transcript launcher activated by the user |
| Display launcher summary | platform count and group state | persisted drafts and latest attempts in that review group |
| Place review launcher | owning assistant response | request scoped activity derived from the preparing run and its terminal assistant message |

**Key invariants**:

- Only a trusted review route can submit a confirmed live publish.
- Model exposed SocialMCP tools remain preview only. `prepare_review` is local product persistence, not an MCP allowlist expansion.
- A group makes no live call unless every draft passes validation and account preflight at its expected revision.
- Every confirmed call has a reserved tenant scoped idempotency key before platform execution.
- A replay or status check never consumes rate capacity and never calls the platform again.
- Successful drafts are never included in a retry. Unknown drafts are never retried.
- Only one review dialog is open at a time. Closing it never changes or cancels persisted review or publish state.
- Each review group appears in exactly one request scoped activity and its launcher renders only beneath that activity's assistant response.
- At most one active attempt exists per draft and no more than three new platform calls run concurrently.
- Product ownership is derived only from the session. SocialMCP ownership is derived only from JWT `sub`.
- Logs contain identifiers, platform, state, duration, and replay state only.

**Security model**:

All reads and mutations scope resources in the database query to the session user. The product API rejects absent or mismatched Origin, non JSON bodies, and the missing custom request header for review mutations. The browser sends no user id and never receives an MCP JWT. Sochestral accepts public HTTPS media locations but does not fetch them. SocialMCP validates account ownership and platform rules again before live execution.

**Configuration required**:

- `REVIEW_PUBLISH_HOURLY_LIMIT`: temporary actual call limit, default `20`.
- `REVIEW_PUBLISH_TIMEOUT_MS`: product wait before recording unknown, default `30000`.
- `PUBLISH_IDEMPOTENCY_STALE_MS`: SocialMCP active reservation age before unknown, default `180000`.

**Critical test scenarios**:

- Happy path: prepare, edit, validate, approve, and publish one Threads draft, then restore the result from conversation history, verifies **AC-1**, **AC-3**, **AC-5**, **AC-6**, **AC-7**, **AC-9**, and **AC-11**.
- Multi platform: one set publishes Threads, LinkedIn Personal, and Instagram with at most three concurrent calls and preserves each outcome, verifies **AC-5**, **AC-6**, and **AC-8**.
- Invalid draft: Instagram without media remains editable with a blocking safe error and causes zero group calls, verifies **AC-1**, **AC-4**, and **AC-5**.
- Idempotency: concurrent confirmed calls with the same key reserve once and replay active or terminal safe state, verifies **AC-7** and **AC-13**.
- Recovery: a timed out active call becomes unknown, status check uses the same key, and no second provider call occurs, verifies **AC-8** and **AC-9**.
- Concurrency: stale draft revisions, duplicate clicks, and an active draft attempt return stable conflict or replay behavior, verifies **AC-3**, **AC-6**, and **AC-7**.
- Rate limit: a group exceeding remaining hourly capacity makes no calls, while validation and replay do not count, verifies **AC-10**.
- Ownership and request safety: another tenant, a foreign Origin, non JSON content, and a missing custom header cannot mutate or publish, verifies **AC-12**.
- Deletion: an idle conversation cascades review data while an active attempt returns conflict, verifies **AC-2**.
- Model safety: chat instructions and model generated `publish_now` input never confirm a live call, verifies **AC-1** and **AC-13**.
- Modal behavior: a new actionable review opens without page scrolling, focus stays inside it, close returns focus to the launcher, completed history stays closed, and every group can be reopened from its transcript summary, verifies **AC-11**.
- Request placement: two requests create separate review groups and a later plain request creates none; each launcher remains beneath its owning assistant response through refresh and pagination, and the plain request has no launcher, verifies **AC-1** and **AC-11**.

## Build plan

Approach: Tracer Bullet. First prove one Threads review from model preparation through explicit browser approval and idempotent SocialMCP execution. Then widen the same persisted contracts to LinkedIn Personal, Instagram media URLs, grouped outcomes, and recovery.

1. [x] Migrate product drafts and add immutable publish attempts, repositories, constraints, ownership, cascades, rate queries, and migration tests, satisfies **AC-2**, **AC-3**, **AC-7**, **AC-8**, and **AC-10**.
2. [x] Add the local `prepare_review` tool and structured conversation review reads, with platform matching, media provenance, invalid draft support, and model live publish exclusion, satisfies **AC-1**, **AC-4**, **AC-11**, and **AC-13**.
3. [x] Add trusted review edit, Threads preflight, approve, publish, retry, check, and deletion guard services and Hono routes, satisfies **AC-3**, **AC-5**, **AC-6**, **AC-8**, **AC-9**, **AC-10**, and **AC-12**.
4. [x] Extend SocialMCP `publish_now` and publish logs with idempotency reservation, active and terminal replay, stale unknown state, tenant separation, and mocked provider tests, satisfies **AC-7**, **AC-8**, **AC-9**, and **AC-13**.
5. [x] Widen grouped execution to LinkedIn Personal and Instagram media URLs with independent persisted outcomes and bounded concurrency, satisfies **AC-4**, **AC-5**, **AC-6**, and **AC-8**.
6. [x] Replace inline review forms with a responsive accessible modal and compact transcript launchers. Preserve explicit save, account selection, validation, one group approval, progress, partial results, retry, unknown status checking, restoration, announcements, and reduced motion, satisfies **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-8**, **AC-9**, and **AC-11**.
7. [ ] Return review groups through request scoped turn activity and render each compact launcher beneath its owning assistant response without duplicating conversation wide launchers, satisfies **AC-1**, **AC-9**, and **AC-11**.
8. [ ] Complete contract, security, safe logging, API, database, orchestration, and web tests, then perform harmless manual publishes with test accounts, satisfies **AC-1** through **AC-13**.

## Consequences

**Positive**:

- Live authority is explicit, inspectable, and isolated from model behavior.
- Persisted snapshots and cross repository idempotency make retries and uncertain outcomes safe.
- A focused review does not force the user to find controls below a long conversation.
- Request scoped launchers preserve which prompt produced each review without requiring a database migration.

**Negative / tradeoffs**:

- Sochestral and SocialMCP require coordinated migrations and contract deployment.
- A synchronous 30 second wait can return unknown even while a provider finishes successfully.
- Public URL media entry is less convenient than upload support.
- The modal adds focus management and a compact transcript launcher that must remain synchronized with persisted review state.

**Neutral**:

- The temporary hourly limit is replaced by subscription tier enforcement in feature 6.
- Scheduling, autonomous publishing, hosted media, generation, and a separate review queue remain out of scope.

## Follow-up

- [ ] Run `/check verify review mode publish loop` after implementation.
- [ ] Run `/test review mode publish loop` before closing the medium workflow feature.
