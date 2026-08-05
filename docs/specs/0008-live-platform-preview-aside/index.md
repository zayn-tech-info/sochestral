# 0008. Live platform preview aside

**Date**: 2026-08-05
**Status**: In Progress

## Summary

Sochestral stops putting a draft log and review modal under chat messages. When a draft or published result exists, a right hand aside opens and shows a faithful light mode preview of how the post will look on Threads, LinkedIn Personal, or Instagram. Users switch platforms with icons, edit text and images in that preview, pick the destination account, and approve or retry from the aside footer. Publishing authority and trusted review APIs stay the same. After a live post succeeds, the aside shows a Live state and keeps the preview of what went live.

## Requirements

**User stories**:

- As a business owner, I want to see a live looking preview of my draft on each connected platform so that I know the end result before it goes out.
- As a business owner, I want to edit the post and images in that preview and approve from the same place so that I am not hunting a draft log in the chat.
- As a business owner, I want a clear Live preview after publish so that I can see what actually went live.

**Acceptance criteria**:

- **AC-1**: Chat no longer shows a View review launcher, draft log card, or review modal under assistant messages. Review and publish actions live only in the aside (and existing Settings publishing mode controls).
- **AC-2**: When the open conversation has at least one review draft or published review outcome, the right aside opens automatically and stays available while the user switches platforms. When there is no draft or live outcome, the aside stays closed.
- **AC-3**: The aside shows a platform icon strip for Threads, LinkedIn Personal, and Instagram that exist in the review set (and connect prompts for requested platforms that lack a connector). Exactly one platform preview is visible at a time.
- **AC-4**: Each platform preview is a faithful single post frame matched to the checked in reference screenshots under `docs/specs/0008-live-platform-preview-aside/references/` (Threads header with avatar, handle, time, overflow; body; media; heart, reply, repost, share row. LinkedIn header with avatar, name, headline, time; body; media; reaction row. Instagram header with avatar, username, time; media with carousel dots when multiple images; like and comment row). Non functional chrome only. v1 ships the product light shell; Threads reference shots include dark examples used for layout fidelity, with light Tokens for the product until system dark lands.
- **AC-5**: Users can edit post text in place in the preview, and add, remove, or reorder images from controls on that same preview. Videos are out of scope for attach and publish in this slice (video frames in the reference screenshots are layout reference only). A dirty draft still requires an explicit Save before Approve, with the same revision rules as today.
- **AC-6**: Destination account selection lives in the aside. If only one eligible connected account exists it is selected automatically. Several accounts require an explicit choice before Approve.
- **AC-7**: Aside footer holds Save, Approve and publish (or retry failed platforms), Check status for unknown attempts, and safe progress or error copy. Group publish rules from specs 0005 and 0006 stay in force (whole set preflight, idempotency, no model authorized live publish).
- **AC-8**: Publishing authority modes are unchanged. Clear live intent may still go live without an extra ask when the effective mode allows it. After success, the aside shows a Live state for published platforms with a non editable preview of what went live, while failed platforms in the same set remain actionable.
- **AC-9**: On narrow viewports the aside becomes a full height sheet over chat when a draft or live outcome exists, with the same preview and actions as desktop.
- **AC-10**: This slice ships light mode only. Styles are structured so a later system dark mode can theme both the Sochestral shell and platform chrome without a redesign.
- **AC-11**: No new review tables or publish APIs. The aside consumes existing conversation review activity, draft PATCH, approve, attempt check, and media routes. Mutations keep session ownership, configured web origin, JSON body, and `X-Sochestral-Request: review-action`.
- **AC-12**: Blocking validation errors, warnings, and missing connector states render in the aside under or beside the preview. Approve stays disabled while any draft in the set is blocking or the set is dirty unsaved.

## Decision

**Chosen option**: Replace the modal review shell with a live platform preview aside over the existing trusted review backend.

**Implementation skills**: `hono` (`.agents/skills/hono/`) · `postgres-drizzle` (`.agents/skills/postgres-drizzle/`) · `drizzle-orm-patterns` (`.agents/skills/drizzle-orm-patterns/`)

## Feature design

**Data model sketch**:

No schema migration. Reuse:

- `review_groups` (conversation scoped set)
- `review_drafts` (per platform body, media, selected account, revision, validation, status)
- `review_attempts` (immutable outcomes)
- Connector account summaries from existing connectors API (preview avatar, display name, handle, account picker)

**State transitions**:

- Aside: closed (no draft) → open draft (editable) → open live (published platforms locked) → open mixed (some live, some failed or draft)
- Draft edit: clean → dirty → saved (revision bump when content or account changes) → validated
- Publish: unchanged group approve path from 0005 and 0006

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| existing conversation detail (activities) | GET | conversation id | turnActivities with reviewGroups | session | 401, 404 |
| `/review/drafts/:id` | PATCH | body, media, account, expected revision | draft projection | session + review-action | 409, 422 |
| existing approve / publish group route | POST | request id, expected revisions | group outcomes | session + review-action | 409, 422, 429 |
| `/review/attempts/:id/check` | POST | none | attempt state | session + review-action | 404 |
| existing media upload routes | POST | image file | asset id / preview URL | session | 413, 415 |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Open aside | whether aside is shown | presence of review groups or published outcomes on conversation detail `turnActivities` |
| Platform strip | which icons appear | draft platforms in the active review group |
| Post body in preview | editable text | `review_drafts.body` |
| Images in preview | ordered media | draft media items / owned asset preview URLs from conversation attachments and review media |
| Avatar and name chrome | account presentation | selected connector account `displayName`, `username`, and any avatar URL the connectors summary already exposes; product placeholder if missing |
| Account picker options | eligible accounts | connectors API accounts for that platform with connected state |
| Live vs draft chrome | editable or locked, Live badge | draft `status` and latest attempt state |
| Approve enabled | boolean | not dirty, no blocking validation, account chosen, connectors ok, group not fully published |
| Validation messages | errors and warnings | `draft.validation` on each draft |
| Assistant chat text | summary / live copy | orchestration assistant message content (unchanged); no review launcher |

**Key invariants**:

- Chat model tools never authorize live publish.
- Aside edits go through the same revision and validation rules as the old modal.
- One visible platform preview at a time; group approve still covers the whole set.
- Videos are never accepted as new media in this slice.
- Non functional platform action icons must not navigate away or call platform APIs.

**Security model**:

- Session owner only.
- Review mutations require configured web origin, JSON content type, and `X-Sochestral-Request: review-action`.
- Browser never receives MCP credentials, OAuth tokens, raw provider payloads, or unredacted errors.

**Configuration required**:

None new.

**Critical test scenarios**:

- Happy path: draft appears, aside opens, switch platforms, edit text and image, save, approve, Live preview shows, verifies **AC-2**, **AC-3**, **AC-5**, **AC-7**, **AC-8**
- No launcher: conversation with review activity renders no View review control or dialog, verifies **AC-1**
- Blocking validation: errors in aside and Approve disabled, verifies **AC-12**
- Empty conversation: aside closed, verifies **AC-2**
- Auth: review mutation without review-action header is rejected, verifies **AC-11**
- Narrow viewport: aside presents as full height sheet with same actions, verifies **AC-9**
- Video rejected: video file cannot be attached through aside media controls, verifies **AC-5**

## Build plan

Tracer Bullet: ship one end to end path (Threads draft → aside preview → edit → save → approve → Live) then widen platforms and polish chrome.

1. [x] Add the chat layout right aside shell (auto open when review activity exists, closed otherwise, narrow sheet behavior), satisfies **AC-2**, **AC-9**
2. [x] Remove transcript review launcher and modal wiring; keep data loading from conversation activities, satisfies **AC-1**, **AC-11**
3. [x] Build platform strip and Threads light mode single post preview bound to draft body, media, and account chrome, satisfies **AC-3**, **AC-4**
4. [x] Add in place text edit, image add/remove/reorder, account picker, Save, and dirty revision behavior on existing PATCH, satisfies **AC-5**, **AC-6**, **AC-11**
5. [x] Move Approve, retry, check status, validation, and connector prompts into the aside footer, satisfies **AC-7**, **AC-12**
6. [x] Add Live locked preview state after successful publish (and mixed set behavior), satisfies **AC-8**
7. [x] Widen LinkedIn Personal and Instagram light mode chrome to the same fidelity, satisfies **AC-3**, **AC-4**
8. [x] Structure light mode tokens so system dark can follow later without redesign, satisfies **AC-10**

## Migration plan

**Strategy**: UI strangler with no data migration

**Phases**:

1. Ship the aside beside chat using the same review APIs.
2. Remove the modal and launcher in the same change set once the aside covers edit, save, approve, retry, and Live.
3. Leave backend review tables and routes untouched.

**Rollback**: Revert the web UI change; backend state remains valid for the previous modal if revived.

**Risks**: Platform chrome will drift from real apps over time; treat fidelity as best effort and refresh when platforms change. Narrow sheet focus management must stay accessible.

## Consequences

**Positive**:

- Users see the end result instead of a draft log.
- Edit and approve sit next to the preview.
- Trusted publish path stays intact.

**Negative / tradeoffs**:

- Hand built platform chrome will need occasional visual refresh.
- Chat loses a persistent review entry point; the aside becomes the only surface.
- Desktop chat width shrinks when the aside is open.

**Neutral**:

- Specs 0005 and 0004 describe a modal review shell; their UI acceptance criteria should be amended after this ships so they point here for presentation.
- Tool activity remains hidden from chat per product direction; Thinking disclosure stays separate.

## Follow-up

- [ ] After `/develop`, amend 0005 AC-11 (and any 0004 review launcher wording) to point at this aside as the review presentation.
- [ ] Enroll system dark mode (product shell + platform chrome) when the product is ready.
- [ ] Video engine and video preview remain deferred.
- [ ] Optional: deep link from a short chat status chip into the aside without bringing back a modal.

## Rationale

Reasoning and options: see [rationale.md](./rationale.md).
