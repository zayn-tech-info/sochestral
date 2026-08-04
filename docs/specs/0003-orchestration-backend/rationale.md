# 0003 rationale: Orchestration backend skeleton

## Context

> ⚠️ Premise note: The longer term product vision includes schedules, approvals, memory, subscription limits, and autonomous publishing. Building those together with the orchestration skeleton would combine several independent decisions and hide the first security boundary inside a large agent system. This spec narrows feature 3 to conversation state, model selected safe tools, and dry run SocialMCP execution. Later scope features retain the other decisions.

The product already has Postgres users, product sessions, and a helper that mints a short lived SocialMCP JWT whose `sub` is the stable product user id. SocialMCP already owns platform OAuth tokens and the implementations for account inspection, validation, and publishing. The missing product layer must turn natural language into controlled tool requests while preserving tenant identity across the repository boundary.

The current SocialMCP MCP server uses standard input and one process level user id. That transport cannot safely serve many hosted product users because one process context cannot derive a different tenant from each network request. Feature 3 therefore depends on an authenticated request transport in SocialMCP. The transport must reuse the existing tools and must not copy adapters, tokens, schedules, or publish workers into Sochestral.

The first slice needs a model that gives strong Anthropic style output while preserving tool use. Thesean exposes Anthropic compatible requests for Claude models, but its availability, credits, pricing, and model catalog can change independently of product demand. The design needs a narrow provider boundary, recorded usage, bounded context, and a temporary per user limit. It does not need a broad agent framework or a provider routing platform.

Conversation content may contain business information and accidental secrets. The product needs durable history for multi turn behavior and diagnosis, but neither Thesean nor application logs should receive cookies, JWTs, platform tokens, or raw internal errors. Users must be able to permanently delete their conversation history.

## Options considered

### Option 1: Deterministic command parser without an LLM

Application code parses a small command shape and directly calls the approved SocialMCP tools.

**Pros**:

- Few external dependencies and predictable behavior.
- Cheapest and easiest path to test.

**Cons**:

- Does not satisfy the product promise of natural conversation.
- Creates a temporary command language that later work must replace.

### Option 2: Sochestral controlled Thesean Anthropic tool loop over authenticated HTTP MCP

The Thesean Anthropic model chooses among fixed tool definitions. Sochestral validates, persists, and executes each call through a tenant scoped SocialMCP client.

**Pros**:

- Proves the intended natural language product path.
- Keeps execution authority, tenant identity, retries, and redaction in trusted code.
- Reuses SocialMCP tools without importing platform adapters into the product.

**Cons**:

- Requires a new authenticated HTTP transport in SocialMCP.
- Adds external latency and Thesean availability to a synchronous request.
- Requires local schemas and contract tests to detect tool drift.

### Option 3: Give the hosted model direct remote MCP access

The hosted model connects to SocialMCP and performs the tool loop outside Sochestral.

**Pros**:

- Less orchestration loop code in the product.
- Provider can handle tool round trips.

**Cons**:

- Weakens product control over arguments, retries, persistence, tenant tokens, and safe result projection.
- Couples the SocialMCP transport and authentication model to one provider.
- Makes it harder to prove that live publish values were replaced before execution.

### Option 4: Prompt only JSON plan followed by direct internal service calls

The hosted model returns a custom JSON plan. Sochestral interprets it and calls a non MCP SocialMCP API.

**Pros**:

- The plan format can be small and fully owned by the product.
- No MCP client lifecycle in Sochestral.

**Cons**:

- Creates a second public contract beside the existing MCP tools.
- Tool schemas and behavior can drift between MCP and the custom API.
- Adds duplicate transport work to SocialMCP.

## Rationale

Option 2 is the smallest design that proves the actual product promise without giving the model execution authority. The user explicitly wants a real LLM in feature 3, so option 1 would only postpone the core uncertainty. Sochestral must remain the policy boundary because it owns product identity, conversation history, limits, and future subscription rules.

Direct provider managed MCP in option 3 removes code, but it removes the wrong code. The product needs to force dry run, redact records, record every call, and mint tenant tokens from a trusted session. Those controls are easier to audit when Sochestral owns the loop. Option 4 keeps control but invents a duplicate SocialMCP surface when MCP is already the agreed repository contract.

The design uses the official Anthropic SDK with the Thesean base URL behind a small provider interface. `ship-like/claude-sonnet-5` is the default because it gives a better cost and quality balance than Opus for routine orchestration, while `THESEAN_MODEL` keeps the choice configurable. Provider specific content blocks stay inside the adapter so a future provider change does not spread SDK types through the service. The design does not adopt a general agent framework because there is only one provider, one bounded loop, and three tools.

The three tool allowlist preserves the feature boundary. Account inspection and validation are read only. `publish_now` is allowed only because dry run returns the real platform preview without an external social action. Approval drafts, live publish, schedules, memory, tier gates, and autonomy remain separate decisions in their numbered scope features.

Progressive responses use the Anthropic SDK stream rather than revealing a completed response through an artificial typing timer. This gives the user real progress and lets tool status appear in the same order that trusted orchestration reaches it. The API uses newline delimited JSON over POST because the mutation already has a JSON body and credentialed session semantics. EventSource would require a separate setup request or query encoded input, while replacing the existing JSON routes would weaken current idempotent retry compatibility.

The stream is a delivery view, not a second source of truth. Partial text remains in memory, the adapter still assembles the full provider response, and the existing final database write remains authoritative. If the provider retries after visible output, a step reset lets the client discard only that uncommitted text. If the browser disconnects, execution continues in process and the existing request id contract reconciles the result. This keeps the change inside the current Hono, Anthropic SDK, and orchestration boundaries without adding a queue or database migration.

Activity is projected per completed turn instead of returned as one conversation wide bucket. Adding another ownership column would duplicate relationships that already exist. The run already points to its triggering user message, tool calls already point to the run, and the trusted local review result already records its group id. The API derives one safe turn activity from those persisted links and keeps the older flat fields only while the web client moves across.

## References

**Project sources**:

- `packages/orchestration/src/model.ts`, current provider boundary
- `packages/orchestration/src/service.ts`, bounded tool loop and safety controls
- `docs/specs/0003-orchestration-backend/index.md`, feature contract

**Links**:

- Thesean Anthropic SDK integration: https://docs.thesean.ai/integrations/anthropic-sdk
- Thesean authentication: https://docs.thesean.ai/api-reference/authentication
- Thesean endpoints: https://docs.thesean.ai/api-reference/endpoints
- Thesean models: https://docs.thesean.ai/api-reference/models
- Thesean errors: https://docs.thesean.ai/api-reference/errors

## Migration plan

**Strategy**: Additive streaming path with synchronous compatibility routes

**Phases**:

1. Replace Groq configuration, SDK types, tools, and response mapping with the Thesean Anthropic adapter.
2. Run unit, contract, type, and build checks with fixtures before using the configured Thesean key for a live smoke test.
3. Add the two ordered NDJSON mutation routes and provider callbacks while retaining the existing JSON routes.
4. Switch the web client to streaming after route and retry contract tests pass.
5. Add request scoped activity beside the existing flat activity fields, switch the web transcript to the scoped projection, then remove the compatibility fields in a later contract cleanup.

**Rollback**: Switch the web client back to the existing JSON routes and flat activity fields. The additive stream and turn activity projections can then be removed without data migration.

**Risks**: Anthropic content blocks differ from OpenAI chat completion messages. Tool use ids, tool result blocks, finish reasons, usage fields, retryable Thesean errors, fragmented text, client disconnects, and proxy buffering must be mapped explicitly.
