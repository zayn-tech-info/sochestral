# Verify: Orchestration backend skeleton, spec 0003, updated 2026-07-25

Steps are derived from spec 0003 acceptance criteria. `/check verify` runs these and `/test` locks the durable cases.

## Database

- [ ] Apply the new migration to an empty Postgres database and an existing database from migration 0001.
- [ ] Confirm all four orchestration tables, foreign keys, check constraints, indexes, and the partial active run index exist.
- [ ] Delete a conversation and confirm messages, runs, and tool calls are removed.
- [ ] Attempt two running runs for one conversation and confirm the second insert fails.

## SocialMCP contract

- [ ] Start the authenticated Streamable HTTP MCP endpoint.
- [ ] Call it without a Bearer token, with an expired token, and with a bad signature. Expect authentication failure before tool execution.
- [ ] Call `tools/list` with a valid product minted JWT and compare the three local tool names and relevant input fields.
- [ ] Call `publish_now` through Sochestral with model supplied live values and confirm SocialMCP receives `dryRun: true` and no effective confirmation.
- [ ] Confirm dry run performs no platform API write.

## Product API

- [ ] Create a conversation with an authenticated session and an explicit Threads request. Expect stored user message, run, safe tool history, and assistant response.
- [ ] Repeat the same create or message request id. Expect the original result and no duplicate message, run, or tool call.
- [ ] Add a second message and confirm ordered multi turn history.
- [ ] Send a message with no explicit supported platform. Expect a stored clarification and no Thesean or MCP call.
- [ ] List conversations and history with cursors. Confirm stable order and a next cursor when more rows exist.
- [ ] Read, write, and delete the conversation as a different user. Expect `404`.
- [ ] Send two messages concurrently to one conversation. Expect one accepted request and one `409 RUN_IN_PROGRESS`.
- [ ] Delete an idle conversation. Expect `204` and no remaining child rows.

## Model and safety

- [ ] Confirm the official Anthropic SDK uses `https://api.thesean.ai`, honors `THESEAN_MODEL`, and defaults to `ship-like/claude-sonnet-5`.
- [ ] Confirm Anthropic text, `tool_use`, `tool_result`, stop reason, and token usage fields map to provider neutral orchestration values.
- [ ] Confirm only `list_connected_accounts`, `validate_post`, and `publish_now` are sent as tool definitions.
- [ ] Make the model request an unknown tool and invalid arguments. Confirm no MCP execution.
- [ ] Make the model request more than four steps. Confirm the run stops with a safe failure.
- [ ] Send more than 8000 characters. Expect `422 INVALID_MESSAGE`.
- [ ] Fill history beyond 6000 input tokens. Confirm old messages remain stored but are omitted from the model context.
- [ ] Confirm context estimation includes fixed instructions and tool definitions, reserves output space, and always includes the triggering message.
- [ ] Confirm the fifty first run inside a rolling 24 hour window receives `429 DAILY_RUN_LIMIT`.

## Failure and redaction

- [ ] Make Thesean timeout once then succeed. Confirm one retry and a completed run.
- [ ] Make SocialMCP return `500` twice. Confirm exactly one retry, failed records, and a safe assistant explanation.
- [ ] Return invalid platform content from SocialMCP. Confirm no retry and a safe validation explanation.
- [ ] Force the initial database transaction to fail. Confirm neither Thesean nor SocialMCP is called.
- [ ] Seed cookies, JWTs, API keys, platform tokens, and internal stack text into test inputs and provider fixtures. Confirm none appears in Postgres records, application logs, Thesean content, or API responses.
- [ ] Confirm each tool response is projected to its named safe fields and raw media URLs, account ids, internal ids, and payloads are absent.

## Acceptance criteria coverage

- AC-1: authenticated create, continue, history, ownership.
- AC-2: explicit target and deterministic clarification.
- AC-3: fixed tools and local validation.
- AC-4: authenticated HTTP MCP and JWT tenant.
- AC-5: forced dry run and no product draft write.
- AC-6: four records and cascade deletion.
- AC-7: one retry and safe terminal failure.
- AC-8: active run guard, rolling limit, context budget.
- AC-9: pagination and public response projection.
- AC-10: Thesean Anthropic SDK, model, input, output, and loop caps.
- AC-11: contract and cross tenant end to end proof.
