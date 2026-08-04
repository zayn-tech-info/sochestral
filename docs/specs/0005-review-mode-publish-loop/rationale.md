# Rationale for review mode publish loop

## Context

The current orchestration slice proves safe previews, but it intentionally forces every model initiated `publish_now` call to dry run. The next product step needs live publishing without weakening that boundary. It must also cope with multiple platforms, multiple accounts, provider timeouts, duplicate browser actions, and partial results while keeping SocialMCP as the execution and token authority.

Review state belongs in product Postgres because it is part of the conversation and user approval experience. Execution reservation belongs in SocialMCP because only that service can prevent duplicate provider calls across product retries, crashes, and future callers. Storing immutable snapshots on both sides gives each result a stable meaning even after a user edits the draft later.

## Options considered

### Model controlled live publishing

Allow the model to set confirmation on the existing MCP tool.

This is compact, but text could become authority and prompt or tool argument failures could publish without a deliberate user action. It does not provide a reliable grouped review contract.

### Product review state with direct provider calls

Persist review in Sochestral and call platform APIs from the product.

This centralizes the user flow, but duplicates account ownership, tokens, adapters, and execution logs that SocialMCP already owns. It violates the repository boundary.

### Modal review with trusted product approval and SocialMCP idempotency

Persist review groups in Sochestral, open the selected group in a focused modal, require an explicit trusted browser action, and execute only through a tenant scoped idempotent SocialMCP contract. Keep a compact transcript launcher so review state remains discoverable after the modal closes.

This preserves the existing security boundary and supports safe grouped recovery. It also keeps the approval controls in view without making the conversation carry a large editing form. It requires careful focus management, but it gives every retry and uncertain result a durable identity without adding a queue or worker.

## Rationale

The modal review option follows the Tracer Bullet approach. It proves the real Threads path across model preparation, product persistence, focused user approval, SocialMCP execution, and restored UI before widening platforms. A compact transcript launcher preserves conversation context and recovery without forcing the full form into the message flow. The whole set preflight rule prevents surprising partial execution caused by invalid input, while independent attempt persistence preserves successful platforms when an external failure occurs during execution.

The launcher belongs to the request that prepared the review, not to the conversation footer. Existing persisted relationships already identify that ownership: the orchestration run points to its triggering user message, the trusted local tool result records the review group id, and the terminal assistant response follows that run. Returning this as request scoped turn activity keeps launchers stable across refresh and pagination, prevents a later plain request from appearing to own earlier work, and avoids a schema migration.

An explicit save separates editing from approval and makes optimistic revisions understandable. Unknown is a first class locked state because retrying an uncertain external call is unsafe. Reconciliation reuses the original idempotency key so SocialMCP can replay or finish the one reserved execution.

## Migration plan

**Strategy**: Additive API projection followed by web placement replacement. No database migration is required.

**Phases**:

1. Return each owned review group inside the request scoped activity derived from its preparing run.
2. Render modal launchers only from the owning assistant message activity.
3. Remove the conversation wide launcher list after request placement and pagination tests pass.

**Rollback**: Restore the existing conversation wide launcher rendering while keeping persisted review data unchanged.

**Risks**: A bad association could hide or duplicate a launcher. The API must reject unowned group ids and the web must key activity only by stable assistant message id.
