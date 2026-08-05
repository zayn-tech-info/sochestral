# 0003. Orchestration backend skeleton

**Date**: 2026-07-25
**Status**: In Progress

## Summary

This feature adds the first safe conversation path from an authenticated product user to SocialMCP. A Thesean Anthropic model may choose from three approved tools, but Sochestral validates and executes every call. Feature 3 can inspect accounts, validate content, and preview a publish. It cannot publish live, schedule work, or create approval drafts. The browser may receive ordered safe progress while a turn runs, while the final persisted response remains authoritative.

## Requirements

**User stories**:

- As a signed in product user, I want to describe a social post in plain language and receive a useful response that reflects my connected accounts and platform rules.
- As a product engineer, I want every model selected action checked and executed by trusted code so the model cannot run arbitrary tools or publish live.
- As a support operator, I want durable, redacted conversation and run history so failures can be understood without exposing secrets.

**Acceptance criteria**:

- **AC-1**: An authenticated user can create a conversation with a natural language message, safely retry the request with the same request id, add later messages, and read the resulting ordered conversation history. Every read and write is scoped to the session user.
- **AC-2**: A message that requests social action must name one or more supported platforms explicitly. Supported names are Threads, LinkedIn, and Instagram. Missing, unknown, or ambiguous platform wording returns a stored assistant clarification without calling Thesean or SocialMCP.
- **AC-3**: When a message has enough context, Sochestral calls Thesean through a provider interface and runs a bounded Anthropic tool loop. SocialMCP model execution remains limited to `list_connected_accounts`, `validate_post`, and preview only `publish_now`. Feature 5 may add the product local `prepare_review` persistence tool without expanding the MCP execution allowlist. Sochestral validates every tool name and argument with local Zod schemas before execution.
- **AC-4**: Sochestral calls an authenticated Streamable HTTP SocialMCP endpoint with a fresh 15 minute Bearer JWT minted from the validated session user. SocialMCP verifies the JWT on every request and creates tool context only from JWT `sub`.
- **AC-5**: Feature 3 never performs a live social action. Every `publish_now` call has `dryRun: true` forced by Sochestral, and any model supplied `confirm` or live publish value is rejected or replaced before execution. The feature does not create product `drafts` rows.
- **AC-6**: Postgres stores conversations, ordered messages, model runs, and tool calls as separate related records. Stored user and assistant content, tool arguments, tool results, and errors are redacted. Deleting a conversation permanently cascades through all four record types.
- **AC-7**: A transient Thesean or SocialMCP failure is retried exactly once, then the run is stored as failed and the user receives a safe explanation. If a provider retry follows visible text, the stream resets that transient model step before replacement text is sent so the browser never appends a duplicate response. Invalid tool names, invalid arguments, authentication failures, and user errors are never retried.
- **AC-8**: One conversation can have only one running model run. A concurrent message receives `409`. Each user can start at most 50 model runs in any rolling 24 hour window. Model context uses only the newest messages that fit a fixed 6000 token input budget.
- **AC-9**: Conversation list and message history endpoints use cursor pagination. API responses contain public conversation, message, run, and safe tool summary fields only. Raw provider payloads, prompts, tokens, tool payloads, and internal errors are never returned.
- **AC-10**: The Thesean integration uses the official `@anthropic-ai/sdk` against `https://api.thesean.ai`, defaults to configurable model `ship-like/claude-sonnet-5`, caps user messages at 8000 characters, caps model output at 1500 tokens, and allows at most four model tool loop steps.
- **AC-11**: Contract tests compare the three local tool definitions with SocialMCP `tools/list`, and an end to end test proves that one product session user can reach SocialMCP dry run while a different user cannot read the conversation or reuse its tenant context.
- **AC-12**: Authenticated create and message stream routes emit monotonically ordered safe NDJSON events for turn start, assistant text, validated tool status, optional provider step reset, and terminal completion or failure. Partial text is not persisted. A disconnect stops response writes but does not cancel the in process turn. The terminal event contains the canonical persisted response. Raw provider events, tool arguments, secrets, and unredacted errors never appear. Sanitized model thinking and product owned step labels are allowed only under [0007](../0007-intent-clarify-thinking-ui/index.md).
- **AC-13**: Every conversation read and completed turn identifies activity by its own request and assistant response. Tool summaries and review groups appear only in the activity entry for the run that created them. A request with no tool call and no review group has no activity entry.

## Decision

**Chosen option**: Option 2: Sochestral controlled Thesean Anthropic tool loop over authenticated HTTP MCP, with parallel ordered streaming routes

Sochestral owns platform resolution, context selection, tool allowlisting, argument validation, retries, persistence, and execution. Thesean serves the selected Anthropic model, which chooses what approved tool to request. SocialMCP owns connected accounts, platform validation, dry run preview, and tenant scoped execution.

**Implementation skills**: `hono` (`yusukebe/hono-skill`, `.agents/skills/hono/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.agents/skills/drizzle-orm-patterns/`) · `postgres-drizzle` (`ccheney/robust-skills`, `.agents/skills/postgres-drizzle/`)

## Rationale

Reasoning and options: see [rationale.md](./rationale.md).

## Feature design

**Real user problem**:

The user needs to express a posting request in ordinary language and get a safe, tenant aware preview. They should not need to know MCP tool names or platform limits. The product must preserve enough conversation state to continue naturally while keeping real publish authority outside this feature.

**Consistency requirements**:

- Conversation ownership, message order, run creation, and the active run guard require strong Postgres consistency.
- External Thesean and SocialMCP calls cannot share a database transaction with Postgres.
- The user message and running run row must commit before any external call.
- Tool results and the final assistant message commit as they occur. A failed final write leaves a failed run that can be diagnosed, never an unrecorded external call.

**Data model sketch**:

`orchestration_conversations`

| Column | DB type | Required | Notes |
|---|---|---|---|
| `id` | text PK | yes | `conv_` + nanoid(21) |
| `user_id` | text FK to `users.id` cascade | yes | owner |
| `title` | text | yes | sanitized first 80 characters of first user message |
| `created_at` | timestamptz | yes | DB default now |
| `updated_at` | timestamptz | yes | app updates when a message is stored |

Indexes: `(user_id, updated_at desc, id desc)` for cursor lists.

`orchestration_messages`

| Column | DB type | Required | Notes |
|---|---|---|---|
| `id` | text PK | yes | `msg_` + nanoid(21) |
| `conversation_id` | text FK to conversation cascade | yes | parent |
| `role` | text | yes | check: `user` or `assistant` |
| `content` | text | yes | redacted content |
| `sequence` | integer | yes | monotonic within conversation |
| `request_id` | text | no | required and unique on user messages, null on assistant messages |
| `created_at` | timestamptz | yes | DB default now |

Constraints: unique `(conversation_id, sequence)` and unique `request_id` when present. Index `(conversation_id, sequence desc)`. Request ids use UUID format. A duplicate request id is resolved only through the owning conversation, so it never reveals another user's data.

`orchestration_runs`

| Column | DB type | Required | Notes |
|---|---|---|---|
| `id` | text PK | yes | `run_` + nanoid(21) |
| `conversation_id` | text FK to conversation cascade | yes | parent |
| `trigger_message_id` | text FK to message cascade | yes | user message that started the run |
| `status` | text | yes | check: `running`, `completed`, `failed` |
| `provider` | text | yes | `thesean` |
| `model` | text | yes | configured model used |
| `target_platforms` | text array | yes | resolved explicit supported platform names |
| `model_step_count` | integer | yes | completed Anthropic tool loop steps, maximum 4 |
| `provider_attempt_count` | integer | yes | total Thesean HTTP attempts including retries |
| `input_tokens` | integer | no | provider usage when available |
| `output_tokens` | integer | no | provider usage when available |
| `duration_ms` | integer | no | total run duration |
| `safe_error` | text | no | redacted stable error |
| `created_at` | timestamptz | yes | start time |
| `completed_at` | timestamptz | no | terminal time |

Constraints: a partial unique index on `conversation_id` where status is `running`. Index `(conversation_id, created_at desc)` and an index supporting the rolling usage query through owned conversations.

`orchestration_tool_calls`

| Column | DB type | Required | Notes |
|---|---|---|---|
| `id` | text PK | yes | `toolcall_` + nanoid(21) |
| `run_id` | text FK to run cascade | yes | parent |
| `provider_call_id` | text | yes | Anthropic tool use id from Thesean, unique within a run |
| `tool_name` | text | yes | check against the three allowed names |
| `status` | text | yes | check: `pending`, `succeeded`, `failed` |
| `arguments` | jsonb | yes | validated and redacted |
| `result` | jsonb | no | redacted MCP result |
| `attempt_count` | integer | yes | starts at 1, maximum 2 |
| `duration_ms` | integer | no | tool execution duration |
| `safe_error` | text | no | redacted stable error |
| `created_at` | timestamptz | yes | DB default now |
| `completed_at` | timestamptz | no | terminal time |

Constraints: unique `(run_id, provider_call_id)`. Index `(run_id, created_at)`.

Relationships: user 1 to many conversations, conversation 1 to many messages and runs, run 1 to many tool calls. Conversation deletion hard deletes all children through database cascades.

**State transitions**:

Run: `running` to `completed` or `failed`.

Tool call: `pending` to `succeeded` or `failed`.

Terminal states do not reopen. A user retry creates a new run from a new message.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/orchestration/conversations` | POST | `message: string`, `requestId: UUID` required | conversation, user message, assistant message, run summary, nullable turn activity | session | `401`, `422`, `429`, `502`, `503` |
| `/orchestration/conversations/stream` | POST | `message: string`, `requestId: UUID` required | ordered NDJSON progress events and canonical terminal response | session | terminal safe event for existing create errors |
| `/orchestration/conversations` | GET | `cursor?: string`, `limit?: number` | conversation page, next cursor | session | `401`, `422` |
| `/orchestration/conversations/:id/messages` | POST | `message: string`, `requestId: UUID` required | user message, assistant message, run summary, nullable turn activity | owner session | `401`, `404`, `409`, `422`, `429`, `502`, `503` |
| `/orchestration/conversations/:id/messages/stream` | POST | `message: string`, `requestId: UUID` required | ordered NDJSON progress events and canonical terminal response | owner session | terminal safe event for existing message errors |
| `/orchestration/conversations/:id` | GET | `cursor?: string`, `limit?: number` | conversation, message page, request scoped turn activities | owner session | `401`, `404`, `422` |
| `/orchestration/conversations/:id` | DELETE | none | empty response | owner session | `401`, `404`, `409` |

The existing create and message calls keep their normal synchronous JSON contracts for compatibility and retry recovery. Parallel POST streaming routes use `application/x-ndjson`, one JSON object per line, `Cache-Control: no-store, no-transform`, and `X-Accel-Buffering: no`. They do not create background jobs. Authentication, ownership, and request validation errors discovered before streaming starts use the existing HTTP status and safe JSON error. After `turn_started`, the HTTP status remains `200` and any terminal failure is represented by `turn_failed`.

Every event has a monotonically increasing `sequence` and one of these safe public shapes:

| Kind | Additional fields | Meaning |
|---|---|---|
| `turn_started` | `conversation`, `userMessage`, nullable `run` | the user mutation and any model run are persisted |
| `assistant_delta` | `step`, `delta` | projected text for one transient model step |
| `step_reset` | `step` | discard text already shown for the retried or nonterminal step |
| `tool_started` | `toolCall` | validated public tool identity and persisted pending state |
| `tool_completed` | `toolSummary` | persisted allowlisted tool outcome |
| `review_groups` | `reviewGroups` | current safe public review groups after local preparation |
| `turn_completed` | `response` | canonical persisted `TurnResponse`, identical in shape to the JSON route |
| `turn_failed` | `error`, optional `conversationId`, `runId`, and `assistantMessage` | stable safe code and persisted failure fields when available |

One encoded line may not exceed 64 KiB. The browser allows at most 128 KiB of unparsed buffered input and treats an oversized, malformed, unknown, duplicate, or nonmonotonic event as an uncertain transport result. It does not render that frame and recovers through the original request id.

The model adapter uses the installed Anthropic SDK streaming interface, assembles the complete final message and tool calls for the existing orchestration loop, and reports only safe text deltas through provider neutral callbacks. Tool input deltas and hidden reasoning never cross the adapter boundary. A transient retry after visible output emits `step_reset` for the current model step before replacement deltas. A step that ends in tool use also resets its transient text before validated tool status appears because only the final no tool step becomes the persisted assistant response. Partial text stays in memory and is never written to Postgres.

Client disconnect or navigation stops stream writes only. The already started in process execution continues to its persisted terminal state. A later request with the same request id returns the stored terminal result or `409` while the run remains active. Process crash behavior remains unchanged because this feature adds no queue or worker. Repeating a terminal request id returns the original stored result. A terminal external failure remains recoverable through its stable safe response. List endpoints default to 25 rows and allow at most 50. Cursors are opaque base64url encoded versioned JSON containing the ordering columns. Delete returns `204` after the client has shown its confirmation warning. A running conversation cannot be deleted and returns `409`. The API does not accept `userId`.

Conversation reads return `turnActivities` only for assistant messages present in that message page. Each entry contains `requestMessageId`, `assistantMessageId`, `runId`, ordered safe `toolSummaries`, and owned public `reviewGroups`. The service derives the request from `orchestration_runs.trigger_message_id`, pairs it with the terminal assistant message stored immediately after that request, groups tool calls by `run_id`, and resolves a local `prepare_review` group only from its persisted trusted `reviewGroupId` result. Empty activity is omitted. Existing conversation wide `toolSummaries` and `reviewGroups` fields remain temporarily for compatibility, but new web rendering uses only `turnActivities`.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Create conversation | owner | validated product session user |
| Create conversation | title | first user message after secret redaction, first 80 characters |
| Store message | content | request or generated response after secret redaction |
| Store message | sequence | next sequence allocated inside the conversation transaction |
| Deduplicate mutation | original result | unique request UUID on the triggering user message |
| Resolve targets | target platforms | explicit supported platform names in the user message |
| Ask clarification | assistant content | fixed safe application text for missing or ambiguous target |
| Start model run | provider and model | `thesean` and `THESEAN_MODEL` |
| Build model context | messages | newest stored messages fitting the context estimator and 6000 token budget |
| Execute MCP | tenant id | `users.id` from the validated session, placed in fresh JWT `sub` |
| Execute tool | tool name and arguments | Anthropic tool use block checked against local allowlist and Zod schema |
| Preview publish | dry run flag | forced `true` by Sochestral, never trusted from model |
| Complete run | token usage | Anthropic response usage fields when available |
| Complete run | duration | monotonic application timer |
| Order stream events | sequence | per response counter allocated by trusted API code |
| Stream assistant text | step and delta | orchestration step counter plus Anthropic text delta projected by the model adapter |
| Reset a retried step | step id | trusted orchestration model step identifier after visible transient output |
| Stream tool state | public tool name and safe status | validated persisted tool call and allowlisted safe summary |
| Reconcile browser state | canonical turn response | persisted terminal orchestration result |
| Associate activity | request and assistant message ids | persisted run trigger message and its terminal assistant message sequence |
| Associate tool summaries | run id | persisted orchestration tool call foreign key |
| Associate review group | review group id | trusted persisted `prepare_review` tool result, checked against an owned conversation group |
| Return tool summary | safe status and preview facts | allowlisted projection of redacted MCP result |
| Apply daily limit | count | runs created through conversations owned by user in previous 24 hours |
| Paginate | next cursor | base64url encoded version 1 JSON from last returned `(updated_at, id)` or `(sequence, id)` values |

**Tool contract**:

- `list_connected_accounts` is read only.
- `validate_post` checks content and platform rules.
- `publish_now` is preview only. Sochestral overwrites `dryRun` with `true` and removes or rejects `confirm`.
- Feature 5 may expose `prepare_review` as a product local persistence tool. It is not sent to SocialMCP and does not expand this model execution allowlist. Any model initiated SocialMCP `publish_now` remains preview only.
- Platform resolution happens before Thesean. `Threads` maps to `threads`, `LinkedIn` and `LinkedIn Personal` map to `linkedin_personal`, and `Instagram` maps to `instagram`. Multiple explicit supported platforms are allowed. Missing, unknown, or unclear platform wording asks for clarification.
- Local Zod schemas are the enforcement boundary. Prompt instructions are guidance only.
- MCP results are untrusted data. They are never appended as system instructions.
- A contract test compares names and relevant input fields with SocialMCP `tools/list`.

**Safe tool summaries**:

- `list_connected_accounts` may expose platform, connected state, and public platform username. It omits account ids, access tokens, refresh tokens, token metadata, and raw payloads.
- `validate_post` may expose valid state, platform, character counts, warnings, and user correctable validation errors.
- Dry run `publish_now` may expose platform, preview text, media item count, warnings, and validation state. It omits raw media URLs, signed URLs, account ids, internal post ids, and raw payloads.

**Context sizing**:

- The budget includes the system instruction, tool definitions, recent messages, and tool summaries.
- The estimator uses `ceil(UTF8 byte length / 3)` for each text value and reserves the configured 1500 output tokens before selecting history.
- Messages are selected newest first, then restored to chronological order. The triggering user message is always included.
- If fixed instructions plus the triggering message exceed the budget, the request fails with `422 INVALID_MESSAGE`.

**Tool loop**:

1. Validate session, ownership, message length, active run guard, platform names, and rolling limit.
2. Store the user message and running run in a transaction.
3. Select the newest redacted messages that fit the context budget.
4. Ask the configured Thesean Anthropic model for a response with the fixed tool definitions.
5. For a tool call, reject an unknown name. Validate arguments locally. Store the pending call.
6. Mint a fresh MCP JWT and call SocialMCP. Store the redacted result.
7. Return the safe tool result to the model as an Anthropic `tool_result` content block and continue, up to four loop steps.
8. Store the final assistant message and mark the run completed. On terminal failure, store a safe assistant explanation and mark the run failed.

**Failure policy**:

- Retry exactly once for a network timeout, Thesean `429` while respecting `Retry-After`, Thesean `500` or `503`, SocialMCP `5xx`, or MCP transport timeout.
- Do not retry invalid input, unsupported tool, invalid tool arguments, `401`, `403`, or deterministic platform validation errors.
- One invalid model argument set may be returned to the model for correction within the four step loop. SocialMCP is not called until local validation succeeds.
- A database failure before run commit prevents any external call.
- No connected account and platform validation failures become safe assistant explanations.
- Stable API mappings: `401 UNAUTHORIZED`, `404 CONVERSATION_NOT_FOUND`, `409 RUN_IN_PROGRESS`, `422 INVALID_MESSAGE` or `INVALID_TOOL_ARGUMENTS`, `429 DAILY_RUN_LIMIT` or provider rate limit, `502 SOCIALMCP_UNAVAILABLE`, `503 MODEL_UNAVAILABLE`, `500 INTERNAL_ERROR`.

**Key invariants**:

- A conversation, message, run, and tool call is readable only through its owning session user.
- A model run never trusts a request body `userId`.
- A user message request id identifies at most one persisted mutation and safe retry result.
- At most one run is `running` per conversation.
- A run has one trigger user message and zero or more tool calls.
- Message sequence is unique and monotonic inside one conversation.
- Stream event sequence is unique and monotonic inside one response.
- Partial assistant text is transient. Only the final redacted assistant message is persisted and authoritative.
- A stream exposes only projected assistant text, validated public tool state, safe review groups, and terminal public response fields.
- A tool summary or review group belongs to exactly one returned turn activity.
- A turn activity is omitted when its run created no tool call and no review group.
- Pagination returns activity only for assistant messages in the current message page.
- Only the three fixed tool names can cross the MCP boundary.
- `publish_now` always reaches SocialMCP with `dryRun: true`.
- No feature 3 path writes `drafts`, schedules, platform tokens, posts, or publish logs in product Postgres.
- Known credential fields and credential shaped values are removed at every boundary. Cookies, JWTs, API keys, platform tokens, raw provider payloads, and raw internal errors are never stored, logged, sent to Thesean, or returned to the browser.

**Security model**:

- Every endpoint requires the existing HttpOnly product session.
- Ownership is checked in the database query, not after loading an unscoped row.
- Sochestral mints the MCP JWT in process. The browser never receives it for orchestration and never calls SocialMCP directly.
- Recent conversation content may be sent to Thesean after a shared redactor removes structured fields named `authorization`, `cookie`, `token`, `access_token`, `refresh_token`, `api_key`, `client_secret`, or `password`, plus Bearer JWT and known API key patterns. Arbitrary secrets written as ordinary prose cannot be identified reliably, so the product must not claim that guarantee.
- Application logs contain request id, run id, a safe user id, provider, model, timing, token counts, tool name, status, and stable error code. They do not contain message content or tool payloads.
- SocialMCP must verify HS256 signature, expiry, and nonempty `sub` on every Streamable HTTP request. Production traffic requires TLS.

**Configuration required**:

- `THESEAN_API_KEY`: Thesean server API key.
- `THESEAN_MODEL`: optional Anthropic model id, default `ship-like/claude-sonnet-5`.
- `SOCIALMCP_MCP_URL`: authenticated Streamable HTTP endpoint, such as `/mcp`.
- `JWT_SECRET`: existing shared HS256 secret used to mint the 15 minute caller token.
- `ORCHESTRATION_CONTEXT_TOKEN_LIMIT`: optional, default `6000`.
- `ORCHESTRATION_OUTPUT_TOKEN_LIMIT`: optional, default `1500`.
- `ORCHESTRATION_MAX_TOOL_STEPS`: optional, default `4`.
- `ORCHESTRATION_DAILY_RUN_LIMIT`: optional temporary guard, default `50`.

**Critical test scenarios**:

- Happy path: signed in user says “Post this launch update on Threads”, the Thesean model requests validation and preview, SocialMCP sees the same user id in JWT `sub`, and history returns the safe result, verifies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-10**, **AC-11**.
- Clarification: a message says “Post this everywhere” with no explicit supported platform, stores a fixed clarification and calls neither external service, verifies **AC-2**.
- Failure case: SocialMCP times out twice, one retry is recorded, the run becomes failed, and the user sees a safe message, verifies **AC-7**.
- Concurrency and usage: a second message during a running run receives `409`, and the fifty first run in a rolling day receives `429`, verifies **AC-8**.
- Auth and permission: another session user receives `404` for conversation read, write, and delete, and cannot cause a JWT for the owner, verifies **AC-1**, **AC-4**, **AC-11**.
- Safety: the Thesean model requests an unknown tool or live `publish_now`; no unsafe MCP call occurs and no raw payload appears in API or logs, verifies **AC-3**, **AC-5**, **AC-9**.
- Deletion: deleting an idle conversation removes its messages, runs, and tool calls permanently, verifies **AC-6**.
- Streaming: fragmented assistant deltas arrive in order, a transient retry resets only its current step, validated tool state follows text without leaking arguments, and the terminal event matches persisted history, verifies **AC-7**, **AC-9**, and **AC-12**.
- Disconnect recovery: closing the response does not cancel the turn, and retrying the same request id returns the terminal result or the active conflict without starting a second run, verifies **AC-1**, **AC-8**, and **AC-12**.
- Activity ownership: two requests with different tool behavior return separate activity entries beneath their own assistant messages, while a request that calls no tool returns none, verifies **AC-9** and **AC-13**.
- Activity pagination: loading an older message page returns only activities associated with assistant messages on that page and does not repeat newer activity, verifies **AC-1**, **AC-9**, and **AC-13**.

## Build plan

Approach: Tracer Bullet. First prove one authenticated message through persistence, Thesean, JWT, SocialMCP validation, and dry run preview. Then widen history, limits, retries, deletion, and contract hardening.

1. Create the Postgres migration, id helpers, relations, repositories, indexes, constraints, and cascade deletion for conversations, messages, runs, and tool calls, satisfies **AC-1**, **AC-6**, **AC-8**, **AC-9**.
2. Add the authenticated stateless Streamable HTTP endpoint to SocialMCP using its current MCP SDK line, verify Bearer JWT per request, derive tool context from `sub`, and expose the existing tool registry without changing adapter or token ownership, satisfies **AC-4**, **AC-5**, **AC-11**.
3. Add a Sochestral MCP client that mints a fresh JWT, restricts tools to the three allowed names, validates local schemas, forces dry run, redacts payloads, and proves the contract against `tools/list`, satisfies **AC-3**, **AC-4**, **AC-5**, **AC-9**, **AC-11**.
4. Add the Thesean provider adapter with official `@anthropic-ai/sdk`, provider neutral internal types, explicit platform resolution, bounded context selection, bounded tool loop, and one full authenticated conversation path, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-10**, **AC-11**.
5. Add chained Hono conversation routes with session ownership, synchronous responses, cursor pagination, active run conflict handling, and permanent cascade delete, satisfies **AC-1**, **AC-6**, **AC-8**, **AC-9**.
6. Add rolling usage protection, transient retry policy, stable errors, safe tool summaries, and content and log redaction, satisfies **AC-7**, **AC-8**, **AC-9**, **AC-10**.
7. Add database, route, provider, MCP contract, cross tenant, failure, concurrency, and end to end dry run tests, satisfies **AC-1** through **AC-11**.
8. [ ] Add provider stream callbacks, ordered Hono NDJSON routes, retry step reset, disconnect safe execution, and contract tests, satisfies **AC-1**, **AC-3**, **AC-7**, **AC-9**, and **AC-12**.
9. [ ] Add request scoped turn activity projections for JSON reads, message responses, and streaming completion, with page correct repository queries and contract tests, satisfies **AC-1**, **AC-6**, **AC-9**, and **AC-13**.

## Consequences

**Positive**:

- Proves the real product boundary from session identity through LLM reasoning to tenant scoped SocialMCP execution.
- Keeps model authority narrow and testable.
- Creates durable conversation and operational history for later channels and user interfaces.
- Leaves provider replacement possible without abstracting the rest of orchestration.

**Negative and tradeoffs**:

- One turn may still be slow because it can include several external calls, but ordered progress is visible while it runs.
- The product and SocialMCP deployments must share one JWT secret and compatible tool schemas.
- Full redacted history increases Postgres storage until user deletion.
- A temporary fixed daily limit is less flexible than the later subscription tier model.
- Transient streamed state adds reconciliation and retry reset complexity even though persistence remains final only.
- Request scoped activity adds a derived response projection, but needs no database migration because run and tool ownership are already persisted.

**Neutral**:

- SocialMCP gains a network transport, but its platform adapters, OAuth tokens, schedules, worker, and existing tool implementations remain in that repository.
- Thesean pricing, credits, and rate limits are operational constraints, not product entitlements.
- Feature 5 will reuse the orchestration boundary but add product draft approval and live publish authority.

## Follow-up

- [ ] Feature 4 should use `list_connected_accounts` for the account connection view.
- [ ] Feature 5 should define approval state, idempotency for live publish, and which reviewed draft content may reach `publish_now` without `dryRun`.
- [ ] Feature 6 should replace the temporary 50 run limit with subscription tier gates.
- [ ] Feature 11 should define structured memory separately from raw conversation history.
- [ ] Feature 12 should define trust and explicit opt in before any autonomous live publish.
- [ ] Root `AGENTS.md` should be reconciled because it still describes the SocialMCP repository instead of this Postgres SaaS repository.
- [ ] Hono, Drizzle, and Postgres conventions that shape this whole repository should be recorded in root `AGENTS.md`.
