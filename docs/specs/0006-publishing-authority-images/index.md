# 0006. Configurable publishing authority and image uploads

**Date**: 2026-08-01
**Status**: In Progress

## Summary

Sochestral adds three account wide publishing modes while keeping the trusted review service as the only path to live social accounts. Users can also attach owned, sanitized images to chat messages and review drafts. A feature flag keeps the effective mode at Always draft until storage and SocialMCP prerequisites are ready.

## Requirements

**User stories**:

- As a business owner, I want one publishing preference across conversations so that Sochestral follows my chosen approval level consistently.
- As a business owner, I want to attach images in chat and edit them during review so that image posts use the same safe publishing flow as text posts.
- As a product engineer, I want every automatic publish tied to explicit live intent, a persisted authority snapshot, and the existing idempotent review service so that model output cannot grant itself authority.

**Acceptance criteria**:

- **AC-1**: Every user defaults to `always_draft`. A revision checked preference mutation can select `always_draft`, `approve_for_me`, or `full_access`, and every change creates a content free authority audit event.
- **AC-2**: Enabling Full access requires the current consent version, an explicit acknowledgement checkbox, and confirmation. Leaving Full access clears consent. An outdated consent makes the effective mode Always draft and records one reset audit event.
- **AC-3**: Each orchestration run snapshots effective mode, consent version, authority event, and a conservative product owned explicit live intent result before chat model execution. Later preference changes cannot affect that run. Chat model output and chat model tools cannot authorize live publishing.
- **AC-4**: Draft, write, preview, edit, validate, questions, negation, and ambiguous wording never publish automatically. Clear affirmative live publish intent may publish automatically only after `prepare_review` creates the matching review set and trusted whole set preflight passes.
- **AC-5**: Always draft and draft only requests open review. Approve for me publishes automatically only with no warning or blocking error. Full access permits warnings but not blocking errors. Any blocking error publishes nothing and opens review.
- **AC-6**: Automatic publishing uses the existing trusted review service, immutable attempts, rate limit, ownership checks, idempotency keys, partial result handling, and unknown recovery. It selects the newest active connected account by `connectedAt`, with stable account ID ordering for timestamp ties.
- **AC-7**: A compact launcher remains beneath the owning assistant response. Its label is `Published social set` for automatic success, `Review social set` for drafts or blocked sets, and `Social set needs attention` for partial or unknown outcomes.
- **AC-8**: The product can issue up to five private Cloudflare R2 upload tickets per request for JPEG, PNG, or WebP images, with a 10 MB limit per image, a rolling limit of 50 uploads per user per hour, and a 1 GB stored media limit per user.
- **AC-9**: Upload completion verifies stored bytes, rejects MIME spoofing, animated or multipage files, and images above 40 megapixels, then uses `sharp` to normalize orientation and remove metadata before the asset becomes ready.
- **AC-10**: Conversation creation and message mutation atomically attach up to five owned ready assets. Sent messages return ordered safe attachment metadata and fresh preview URLs without exposing storage keys. Foreign or incomplete assets are rejected.
- **AC-11**: Pending unattached assets expire after 24 hours. Attached assets remain until conversation deletion. Conversation deletion removes R2 objects first, and a storage failure leaves product rows intact with a safe retryable error.
- **AC-12**: Review drafts accept a combined ordered list of owned assets and legacy public HTTPS URLs, with at most five items. Publish attempts snapshot immutable ordered media. SocialMCP receives only two hour signed media URLs and never receives R2 keys.
- **AC-13**: The composer shows a compact authority selector and paperclip control, upload progress, thumbnails, retry, removal, and image count. Sending is blocked while selected media is incomplete or failed. Settings shows all modes and current consent state. Full access uses an accessible warning dialog.
- **AC-14**: Thesean receives at most the five newest relevant sanitized images as Anthropic image content blocks. A configured vision failure retries safely with text attachment metadata, tells the model not to invent visual details, and keeps images publishable.
- **AC-15**: A rollout flag forces effective Always draft and disables the selector until product migrations, R2 configuration, SocialMCP `connectedAt`, and live smoke checks are complete.

## Decision

**Chosen option**: Feature flagged publishing authority on top of trusted review, with private R2 media assets

The preference controls whether a valid review set needs a human click. It never changes the trusted execution boundary. Images use owned product records and private object storage, while temporary signed URLs are created only at preview and publish boundaries.

**Implementation skills**: `postgres-drizzle` (`ccheney/robust-skills`, `.agents/skills/postgres-drizzle/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.agents/skills/drizzle-orm-patterns/`) · `hono` (`yusukebe/hono-skill`, `.agents/skills/hono/`) · `auth-implementation-patterns` (`wshobson/agents`, `.agents/skills/auth-implementation-patterns/`)

## Rationale

Reasoning and alternatives: see [rationale.md](./rationale.md).

## Feature design

**Data model sketch**:

- `publishing_preferences`: one row per user, mode, positive revision, nullable Full access consent version and time, updated time.
- `publishing_authority_events`: owner, previous mode, next mode, UI source, nullable consent version, event kind, created time. It stores no post content.
- `media_assets`: owner, nullable conversation, storage key, state `pending`, `ready`, or `deleting`, actual MIME type, byte size, width, height, pending expiry, created time, and updated time.
- `orchestration_message_media`: message, asset, zero based position. The pair and the message position are unique.
- `draft_media`: draft, zero based position, exactly one of asset or external HTTPS URL.
- `draft_publish_attempt_media`: attempt, zero based position, immutable asset snapshot or external URL snapshot.
- `orchestration_runs`: publishing mode, nullable consent version, nullable authority event, and explicit live intent boolean.
- `draft_publish_attempts`: authorization kind `manual`, `approve_for_me`, or `full_access`, nullable triggering message, nullable consent version, and existing immutable publish data.

`drafts.media_urls` and `draft_publish_attempts.media_urls` remain during migration. A backfill creates ordered media rows before the application switches reads to normalized media.

**State transitions**:

- Preference: Always draft to Approve for me directly. Any transition into Full access requires current consent. Any transition out clears consent. Expired consent resolves to effective Always draft.
- Asset: pending to ready after byte verification and sanitization. Pending assets may be deleted or expire. Ready assets become durable when attached.
- Publish authority: run snapshot to review or trusted automatic publish. The snapshot is immutable after the run starts.

**Intent resolution**:

Product code applies a two layer policy before chat model execution when the effective mode is Approve for me or Full access. A deterministic local veto rejects obvious non intent wording such as drafts, previews, validation, edits, questions, negation, and ambiguous follow ups without calling the model. Messages that pass the veto are sent to Thesean in a dedicated classification call with a forced structured tool and delimiter isolated user text. The classifier fails closed on timeout, provider error, missing tool output, or any answer that is not an explicit true. Platform clarify turns skip classification entirely because they cannot auto publish. Phrase matching regex is not the authority gate. `prepare_review` still verifies requested platforms and resolves attachment indexes. Automatic execution requires both the snapshotted explicit live intent and a prepared owned group for the same run. The chat facing `publish_now` remains preview only.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/publishing/preferences` | GET | none | current mode, effective mode, revision, consent, policy version, enabled | owner session | 401 |
| `/publishing/preferences` | PATCH | expectedRevision, mode, consentVersion, acknowledged | updated preference and effective mode | owner session plus publishing action request | 401, 409, 422 |
| `/media/uploads` | POST | up to five name, MIME, and size descriptors | asset ids and signed PUT tickets | owner session plus publishing action request | 401, 413, 415, 429, 502 |
| `/media/uploads/:assetId/complete` | POST | empty JSON | safe asset metadata and preview URL | owner session plus publishing action request | 401, 404, 409, 413, 415, 502 |
| `/media/uploads/:assetId` | DELETE | none | no content | owner session plus publishing action request | 401, 404, 409, 502 |
| `/orchestration/conversations` | POST | message, requestId, up to five mediaAssetIds | conversation turn with ordered attachments | owner session | existing errors plus 404, 409, 422 |
| `/orchestration/conversations/:id/messages` | POST | message, requestId, up to five mediaAssetIds | conversation turn with ordered attachments | owner session | existing errors plus 404, 409, 422 |
| `/review/drafts/:draftId` | PATCH | expectedRevision, body, ordered media items, selectedAccountId | updated draft and validation | owner session plus review action request | existing errors plus 404, 409, 422 |

Publishing preference and upload mutations require the exact configured web origin, JSON, and `X-Sochestral-Request: publishing-action`. Existing review mutations keep `review-action`.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| Read preference | current mode and revision | owned `publishing_preferences` row or default values |
| Read preference | effective mode | rollout flag, stored mode, current consent policy, and consent snapshot |
| Change preference | audit event | session owner, current row, request mode, UI source, and consent fields |
| Start run | authority snapshot | effective preference and the event that established it |
| Start run | explicit live intent | local veto plus product owned Thesean classification over delimiter isolated user message, fail closed |
| Choose account | account ID | newest SocialMCP `connectedAt`, then stable account ID ordering |
| Create upload | object key | owner ID plus generated asset ID, never browser input |
| Complete upload | MIME, size, dimensions | bytes read from the owned R2 object and decoded by `sharp` |
| Display attachment | preview URL | short lived signed GET URL for the owned ready asset |
| Prepare review media | owned assets | attachment indexes resolved against the triggering user message |
| Publish media | temporary HTTPS URLs | two hour signed GET URLs for immutable attempt media |
| Display launcher label | label | latest persisted group and attempt states plus authorization kind |
| Build model context | image blocks | five newest relevant ready message assets after sanitization and resize |

**Key invariants**:

- A preference never bypasses ownership, validation blockers, rate limits, account preflight, idempotency, or unknown recovery.
- Model content cannot create Full access consent or authorize a live call.
- Automatic publishing requires explicit live intent recorded before model execution.
- A run uses one immutable authority snapshot.
- Stored asset keys and signed publish URLs never appear in browser contracts or logs.
- Only owned ready assets can attach to messages or drafts.
- Exactly one ordered media source exists per draft media and attempt media row.
- Deleting a conversation is atomic from the product point of view only after every owned R2 object is removed.

**Security model**:

The product session is the only owner source. Every preference, event, asset, message, draft, and attempt query includes that owner. Foreign IDs return masked not found responses. Full access consent is explicit, versioned, and auditable. R2 is private. Signed URLs are short lived, never logged, and issued only for an owned ready asset. The service validates actual bytes instead of trusting browser MIME metadata.

**Configuration required**:

- `PUBLISHING_AUTHORITY_ENABLED`: permits modes other than Always draft when `true`.
- `PUBLISHING_CONSENT_VERSION`: current Full access policy version.
- `R2_ENDPOINT`: Cloudflare R2 S3 endpoint.
- `R2_REGION`: signing region, default `auto`.
- `R2_ACCESS_KEY_ID`: R2 access key.
- `R2_SECRET_ACCESS_KEY`: R2 secret.
- `R2_BUCKET`: private media bucket.
- `MEDIA_UPLOAD_TICKET_TTL_SECONDS`: signed PUT life, default `600`.
- `MEDIA_PREVIEW_TTL_SECONDS`: browser preview life.
- `MEDIA_PUBLISH_TTL_SECONDS`: SocialMCP GET life, default `7200`.
- `MEDIA_PENDING_TTL_HOURS`: unattached retention, default `24`.
- `MEDIA_UPLOAD_HOURLY_LIMIT`: default `50`.
- `MEDIA_USER_STORAGE_LIMIT_BYTES`: default `1073741824`.
- `THESEAN_VISION_ENABLED`: enables image content blocks after smoke verification.
- `THESEAN_INTENT_MODEL`: optional dedicated classifier model for live publish intent; defaults to `THESEAN_MODEL`.

**Critical test scenarios**:

- Preference lifecycle: default, optimistic conflict, Full access entry and exit, expired policy reset, and concurrent run snapshot, verifies **AC-1**, **AC-2**, **AC-3**, and **AC-15**.
- Intent safety: publish wording, negation, draft wording, ambiguous follow up, and hostile model tool output, verifies **AC-3** and **AC-4**.
- Mode matrix: each mode with safe content, warnings, blockers, missing accounts, grouped sets, partial results, unknown recovery, and duplicate requests, verifies **AC-5**, **AC-6**, and **AC-7**.
- Upload safety: ownership, expiry, spoofed MIME, size, image decode, metadata removal, quotas, cleanup, promotion, and storage failure, verifies **AC-8** through **AC-12**.
- Vision: valid image blocks and text only fallback without invented details, verifies **AC-14**.
- Web: selector, consent dialog, progress, send blocking, image rendering, modal media editing, launchers, keyboard, mobile, and reduced motion, verifies **AC-7**, **AC-13**, and **AC-15**.

## Build plan

Approach: Tracer Bullet. First prove one user preference and one owned Threads image from upload through review and safe publish. Then add automatic authority behavior, all three platforms, normalized media, vision fallback, and rollout controls.

1. [x] Add preference, authority event, media asset, ordered media, run snapshot, and attempt authorization schema with an additive migration and legacy media backfill, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-10**, and **AC-12**.
2. [x] Add feature flagged preference reads and guarded updates with versioned consent and audit tests, satisfies **AC-1**, **AC-2**, and **AC-15**.
3. [x] Add private R2 upload tickets, byte verification, `sharp` sanitization, ownership, quotas, cleanup helpers, and safe preview signing, satisfies **AC-8**, **AC-9**, and **AC-11**.
4. [x] Attach ready images atomically to messages, return safe ordered media, resolve `prepare_review` attachment indexes, and publish with temporary signed URLs, satisfies **AC-10** and **AC-12**.
5. [x] Snapshot authority and product owned explicit live intent at run start, select the newest connected account, and route automatic decisions through the trusted review service, satisfies **AC-3** through **AC-7**.
6. [x] Send sanitized images to Thesean with a bounded vision context and a safe text only retry, satisfies **AC-14**.
7. [x] Add composer and Settings mode controls, consent dialog, upload UI, sent image rendering, review media editing, and outcome launchers, satisfies **AC-7**, **AC-13**, and **AC-15**.
8. [ ] Complete database, API, orchestration, storage, vision, and web tests, then run coordinated SocialMCP and harmless live smoke checks before enabling rollout, satisfies **AC-1** through **AC-15**.

## Consequences

**Positive**:

- Users can choose a stable approval level without weakening the existing publish safety boundary.
- Private owned media makes image posts auditable and safe across chat, review, retry, and deletion.
- Persisted snapshots make preference changes deterministic during active requests.

**Negative / tradeoffs**:

- R2, image processing, cleanup, and signed URL rotation add storage operations that must be monitored.
- Product and SocialMCP deployments must coordinate the `connectedAt` contract before automatic modes can enable.
- Vision support may vary by configured Thesean model, so the product must preserve a lower quality text only path.

**Neutral**:

- External public image URLs remain supported for legacy review drafts.
- Videos, generation, scheduling, mode changes through messaging channels, payments, and autonomous campaigns remain outside this feature.

## Follow-up

- [ ] Extend the external SocialMCP connector contract with safe `connectedAt` and complete coordinated live smoke checks.
- [ ] Replace temporary upload and storage limits with subscription tier gates in feature 6.
- [ ] Run `/check verify configurable publishing authority and image uploads` after implementation.
- [ ] Run `/test configurable publishing authority and image uploads` before closing the medium workflow feature.

## Migration plan

**Strategy**: Feature flagged strangler migration.

**Phases**:

1. Add nullable snapshot fields and normalized media tables while old URL columns remain authoritative.
2. Dual write review and attempt media, backfill old ordered URLs, then switch reads to normalized media.
3. Deploy R2 and SocialMCP `connectedAt`, run smoke checks, then enable the selector.
4. Remove legacy URL columns only in a later proven migration.

**Rollback**: Disable `PUBLISHING_AUTHORITY_ENABLED` to force Always draft. Keep legacy URL columns and current review routes available while normalized writes remain additive.

**Risks**: A partial backfill can reorder media, storage deletion can block conversation deletion, and a mismatched SocialMCP deployment can choose the wrong account. The feature flag prevents automatic authority until these checks pass.
