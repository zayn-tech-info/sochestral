# 0016. Brand design brief

**Date**: 2026-08-12
**Status**: In Progress

## Summary

Sochestral compiles a brand style brief once when Brand Assets change. Chat reads that text, not the image gallery. A branded generate still sends the logo plus one or two example images to OpenAI, and only after the user opts in or answers brand clarify.

## Requirements

**User stories**:

- As a business owner, I want generated flyers to follow my design system so they look like my existing work, not a random poster.
- As a product operator, I want Thesean to scan brand images only when the library changes so generate turns stay cheap.

**Acceptance criteria**:

- **AC-1**: After Brand Assets add, replace, archive, or color save, product computes a source hash. If it differs from the stored brief, a compile is scheduled. Same hash skips vision.
- **AC-2**: Compile uses Thesean vision once on a capped pack (logo plus references, max 8). Result is stored on `brand_design_briefs` as `ready` with `briefText` covering layout, logo placement, color roles, type feel, and do or don’t rules.
- **AC-3**: Multi image uploads debounce: compile waits `BRAND_BRIEF_DEBOUNCE_MS` (default 3000) after the last mutate so one pass covers the batch.
- **AC-4**: Chat turns inject the ready brief as text, the same family as the business profile note. Brand gallery pixels are never attached to Thesean on generate turns.
- **AC-5**: Brand still requires opt in or clarify (0015 AC-3). Skip and random stay brand free.
- **AC-6**: When brandIntent is `use`, product (not the model) attaches 1 logo plus up to 2 newest `reference_image` rows as job inputs, and prepends the brief onto the image prompt.
- **AC-7**: Failed or pending compile still allows generate using palette, notes, and logo. Brand Assets shows a quiet “style brief updating” state.
- **AC-8**: `gpt-image-2` branded jobs send at most logo plus 2 brand refs, not the whole library.

## Decision

**Chosen option**: Cached Thesean vision brief plus auto packed logo and 1 or 2 exemplars

Rebuild automatically on library change. Chat stays text. Image API still needs a small reference pack for visual match.

**Implementation skills**: `postgres-drizzle` (`ccheney/robust-skills`, `.agents/skills/postgres-drizzle/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.agents/skills/drizzle-orm-patterns/`) · `hono` (`yusukebe/hono-skill`, `.agents/skills/hono/`)

## Rationale

Reasoning and options: see [rationale.md](./rationale.md).

## Feature design

**Data model sketch**:

- `brand_design_briefs`: `userId` (PK, FK users), `briefText` (nullable text, max 4000), `sourceHash` (text, sha256 hex), `status` (`pending` | `ready` | `failed`), `compiledAt` (nullable timestamptz), `pendingAt` (nullable timestamptz), `errorCode` (nullable), `updatedAt`.
- One row per tenant. Rebuild updates in place. No history in v1.
- Reuse `brand_assets` from spec 0015.

**Source hash**: sha256 of sorted active brand asset rows: `id|kind|updatedAt|colorValue|noteText|mediaAssetId`.

**Compile pack**: logo first (sortOrder, createdAt), then newest reference images, cap 8. Colors and notes go in as text. No images: write a text only brief from palette and notes, no vision call.

**State**: missing → `pending` on first mutate → `ready` or `failed`. New mutate while ready with new hash → `pending` again. Same hash while ready → no op.

**API surface**:

| Endpoint | Method | Key outputs | Auth |
|---|---|---|---|
| `/brand-assets/design-brief` | GET | status, compiledAt, updating (true when pending) | owner session |

Mutations stay on existing Brand Assets routes. Compile is worker side, not a user paid image credit.

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| sourceHash | hash | active `brand_assets` fields listed above |
| briefText | compiled style | Thesean vision output, trimmed to 4000 |
| Chat brand context | system text | `brand_design_briefs.briefText` when status is ready |
| Job brand inputs | logo + 1 or 2 refs | product pick from `brand_assets`, not model ids |
| Job prompt prefix | constraints | ready brief, else palette + notes fallback |
| updating UI | boolean | status === pending |

**Key invariants**:

- Vision compile only when sourceHash changes and debounce elapsed.
- Thesean generate turns never receive Brand Assets image blocks.
- brandIntent skip or unclear never packs brand exemplars.
- Branded OpenAI call: at most 3 brand image refs (1 logo + 2 examples).
- Opt in / clarify from 0015 still gates brand use.

**Security model**:

Owner session only. Brief text is owner private. Provider key stays server side.

**Configuration required**:

- `BRAND_BRIEF_DEBOUNCE_MS` (default 3000)
- `BRAND_BRIEF_COMPILE_CAP` (default 8)
- Existing `THESEAN_API_KEY`, `THESEAN_VISION_MODEL`, `THESEAN_VISION_ENABLED`

**Critical test scenarios**:

- Same library mutate does not call vision (hash skip), verifies **AC-1**
- Two uploads within debounce produce one compile, verifies **AC-3**
- Chat generate with a ready brief sends text and zero brand image blocks, verifies **AC-4**
- brandIntent use packs logo + newest refs and prepends brief, verifies **AC-6**, **AC-8**
- brandIntent skip has no brand inputs, verifies **AC-5**
- Failed compile still creates a confirmable job, verifies **AC-7**

## Build plan

Tracer Bullet: hash gate and stored brief, then chat inject, then auto pack on propose.

1. [x] Migration for `brand_design_briefs` plus hash and pick helpers, satisfies **AC-1**, **AC-2**
2. [x] Schedule compile on Brand Assets mutate with debounce; Thesean vision worker; GET design-brief, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-7**
3. [x] Inject ready brief into orchestration system text; never attach brand gallery pixels, satisfies **AC-4**, **AC-5**
4. [x] Auto pack logo + 1 or 2 refs and prepend brief on `propose_image_job` when brandIntent is use, satisfies **AC-6**, **AC-8**
5. [x] Tests for hash skip, debounce, opt in, ref cap, and no brand vision on chat generate, satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-8**

## Consequences

**Positive**:

- Brand flyers follow a stored design system without scanning the gallery every chat turn.
- OpenAI image cost stays bounded to a small reference pack.

**Negative / tradeoffs**:

- First compile after an upload waits on debounce plus Thesean vision.
- Auto pick may not choose the owner’s favorite exemplar until a later UI exists.

**Neutral**:

- 0015 confirm before spend and credit wallet stay unchanged.

## Follow-up

- [ ] User marked style exemplars in Brand Assets
- [ ] Format specific packs (story vs feed)
- [ ] Plan based compile and reference caps (Feature 6)
