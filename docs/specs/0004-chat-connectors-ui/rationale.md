# Rationale for Sochestral chat workspace and connectors

## Context

The product already has tenant sessions, conversation persistence, controlled Thesean Anthropic orchestration, and an authenticated SocialMCP transport. The current web surface is a marketing page plus a temporary login form. Feature 4 needs to prove account connection, but the product also needs a useful place for the existing conversation path.

SocialMCP already owns OAuth sessions, encrypted account tokens, and account state. Copying that data into product Postgres would create two sources of truth and weaken the repository boundary.

The first workspace implementation proved the product path, but its three column shell, large empty state, decorative AI marks, and oversized cards make the conversation feel secondary. The approved direction is a quiet light product interface inspired by the density and hierarchy of Origami, without copying unrelated features. OAuth and connector state belong in Settings rather than the main chat flow. Approval and live publishing remain feature 5.

## Options considered

### Option 1: OAuth only page

Build only a small connector screen.

**Pros**:

1. Smallest initial change.
2. Directly matches the old feature title.

**Cons**:

1. Leaves the existing orchestration path without a product interface.
2. Produces a temporary page that feature 10 would soon replace.

### Option 2: Chat workspace with narrow connector APIs

Build the first authenticated product shell and keep connector access behind two product endpoints.

**Pros**:

1. Proves the real product experience across existing layers.
2. Keeps MCP credentials and flexible MCP calls away from the browser.
3. Creates a stable shell for later product features.

**Cons**:

1. Larger than the original thin OAuth task.
2. Requires coordinated product and SocialMCP callback behavior.

### Option 3: Browser to SocialMCP

Let the browser obtain an MCP token and call SocialMCP directly.

**Pros**:

1. Less product API code.

**Cons**:

1. Exposes a powerful service credential to browser code.
2. Broadens CORS and public attack surface.
3. Couples UI code to MCP transport details.

## Rationale

Option 2 best follows the Tracer Bullet approach. It connects the existing user session, orchestration backend, SocialMCP account truth, and browser interface in one usable path. The two narrow connector endpoints preserve the product as the policy boundary while avoiding a second account database.

The chat shell is intentionally limited to current orchestration authority. It can inspect accounts, validate content, and show dry run previews. It cannot approve or publish live. This keeps the new interface honest about what the current backend can do.

The visual redesign fixes the existing product surfaces in place because their behavior and API boundaries are already correct. A replacement shell or parallel route would add migration work without reducing risk. The compact left navigation, centered conversation area, and Settings only connector state remove duplicated information while preserving the proven path.

The first light redesign left most state changes as instant CSS swaps and set several Motion entrances to `initial={false}`. A shared restrained motion system fixes that gap without introducing decorative movement. Central timing and reduced motion behavior are easier to keep consistent than unrelated animation values inside each component.

Assistant responses should reveal real model progress instead of waiting for the full turn or replaying a completed answer with a fake typewriter timer. Real ordered streaming reduces perceived latency and matches the conversational behavior users expect while preserving the existing orchestration policy boundary. The browser receives projected text and safe tool state only. It never receives provider internals, hidden reasoning, or raw tool input.

The interface keeps one temporary assistant response during delivery and replaces it with the canonical persisted turn at completion. Rendering updates are batched to animation frames so small provider fragments read smoothly without unnecessary React churn. Scroll follows new text only when the reader is already near the bottom. This makes the response feel continuous without taking control away from someone reading earlier messages. Reduced motion removes movement effects, not progressive content.

Conversation wide activity is misleading because a later message can appear to own tools or a review created by an earlier request. The transcript therefore renders from the backend request scoped activity projection. Assistant message ids are stable across refresh and pagination, so they are a safer placement key than array position or timestamps. Empty activity is omitted rather than represented by a placeholder.

## Migration plan

**Strategy**: Add the request scoped activity projection before changing transcript placement.

**Phases**:

1. Add and test the backend `turnActivities` contract while retaining the flat compatibility fields.
2. Switch transcript rendering and pagination merge logic to assistant message keyed activity.
3. Remove the conversation footer rendering for tool activity and review launchers.

**Rollback**: Restore the web client to the flat compatibility fields while leaving the additive backend projection in place.

**Risks**: Incorrect page merging could duplicate or move activity. Contract and pagination tests must prove that assistant message ids remain the only placement key.
