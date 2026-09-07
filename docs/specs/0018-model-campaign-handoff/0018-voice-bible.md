# 0018 voice bible

## Summary

Opus writes one short page of how this brand talks. That compile runs when the profile or brand kit changes, not on every chat turn. The campaign day writer reads the text. This is voice, not the visual brief in 0016.

## Requirements

**User stories**:

- As a business owner, I want queued captions to sound like me so that a 30 post run does not read as generic AI.

**Acceptance criteria** (this child owns the umbrella IDs below):

- **AC-10**: A voice bible compiles when the profile or brand kit changes (hash plus debounce). The day write uses that text.
- **AC-11**: Day write uses the voice bible when status is `current`. (Grade and rewrite stay in the campaign child.)

## Decision

New `voice_bibles` row, one per user. Hash gate and debounce, same idea as `brand_design_briefs`. Opus through Thesean Anthropic (`THESEAN_VOICE_MODEL`). No vision. Text only.

Short rationale: 0016 already stores layout and color. Mixing voice into that row would rebuild vision on every tone edit. A second compile is cheaper and clearer.

## Feature design

**Trigger**: create, update, or delete of business profile entries in categories `tone`, `audience`, `do_not`, `brand_fact`, or brand kit notes and colors (not image pixels). After mutate, compute `sourceHash`. If it differs, set status `compiling`, `pendingAt` = now, `compileHash` = that hash. Worker waits `VOICE_BIBLE_DEBOUNCE_MS` (default 3000) after `pendingAt` then compiles.

**Source hash**: sha256 of UTF-8 lines, sorted: `entry:{id}:{category}:{body}` for those categories, then `color:{id}:{value}`, then `note:{id}:{text}`. Do not include brand image bytes (0016 owns those).

**Compile**:

- Model: `THESEAN_VOICE_MODEL` default `ship-like/claude-opus-5`
- Input: those profile entries, optional ready 0016 `briefText` as extra context, no images
- Output: at most 4000 characters. How they talk, words they never use, four example lines
- Success → write `briefText` and status `current` only if `sourceHash` still equals `compileHash`. If the hash moved, discard this result and compile the new hash
- Fail → retry once on the next worker tick for the same `compileHash`. Then status `failed`, keep prior `briefText` if any. No further retry until `sourceHash` changes

**Read path**:

- Campaign day writer injects `briefText` when status is `current`, or when `failed` / `compiling` but a prior `briefText` exists
- Chat operator may inject the same text next to the profile note (cheap, optional in slice 5)
- Missing row: day write uses the profile note only (0017 AC-6 still applies)

**API surface**: none required for v1. Settings can show a quiet "voice brief updating" later. No user paid credit.

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| sourceHash | sha256 hex | profile entries + brand kit text listed above |
| briefText | voice rules and examples | Opus output, trimmed to 4000 |
| Day write voice context | system text | `voice_bibles.briefText` when present |

**Key invariants**:

- Compile only after hash change and debounce.
- Visual 0016 compile is unchanged.
- Failed compile must not block a campaign. Fall back to the profile note.

**State**: missing → `compiling` on first mutate → `current` or `failed`. New hash while `current` → `compiling` again. Same hash → no op.

**Critical test scenarios**:

- Tone entry change → hash changes → one Opus call after debounce → status `current`, verifies **AC-10**
- Same tone saved again → no compile, verifies **AC-10**
- Day write with `current` brief → prompt contains the bible, verifies **AC-10**, **AC-11**

## Build notes

Mirror `packages/api` brand brief worker shape. New helpers in `packages/database`. Do not fold into `brand_design_briefs`. No `/develop` work in the architect pass.
