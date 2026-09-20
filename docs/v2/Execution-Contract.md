# V2 execution contract

10 September 2026. Local implementation on `codex/sochestral-v2`. Production behavior is not yet verified.

## Ownership

Sochestral owns user brand context, source provenance, generated revisions, review, schedule confirmation, timezone conversion, credits and submission progress. SocialMCP owns account tokens, schedule receipts and publication when due. JWT `sub` identifies the tenant. One user currently owns one brand. Accounts remain separately identified.

## Scheduling

`schedule_post` accepts `platforms`, explicit destination account IDs, finished text and options/media, UTC `scheduledAt`, display IANA `timezone`, and a stable `idempotencyKey`. It requires `confirm: true` or a nonwriting `dryRun: true`. The product must supply confirmation only after the exact content revision, account and instant have been approved. The execution service does not infer timezone conversion.

Successful creation returns `{ ok: true, postId, scheduled: [{ id, postVariantId, platform, connectedAccountId, publishAt, status }] }`. Store every destination receipt. Creation and receipt persistence occur in one SQLite immediate transaction. An insert failure rolls back parent, variants, schedules and request receipt.

New request keys are scoped to the tenant. Same key and canonical request fingerprint return the original receipt with `replayed: true`, including when the original date is now past. A changed payload returns `IDEMPOTENCY_CONFLICT`. JSON object field order and platform order do not alter the fingerprint; content, media, destination and instant do. Confirmation flags are not content. Explicit keys and receipts are retained with the user; no expiry policy is invented.

`get_schedule_request { idempotencyKey }` returns `{ ok: true, found, receipt }` for exact tenant scoped lookup. A missing receipt means no committed V2 request was found. Legacy rows and hashes are preserved. A matching legacy hash returns `LEGACY_SCHEDULE_REQUIRES_REVIEW` rather than creating a duplicate without trustworthy fingerprint evidence. Legacy keys were global hashes of key plus platform; new keys include tenant and destination. Never claim legacy behavior was exactly once.

## Status and pagination

`get_scheduled_posts` accepts platform/status, inclusive `from` and `to` instants, `limit` (1 to 500, default 100) and opaque `cursor`. It returns `scheduled` and nullable `nextCursor`, ordered by row ID. Tenant and date filters execute in SQL. The product follows every cursor and rejects repeated/invalid cursors. `get_post_status` reads owned schedules and publish logs. Parent post status is not delivery authority.

Delivery states include `scheduled`, `publishing`, `published`, `failed`, `cancelled`, and `outcome_unknown`. Product labels include Scheduled, Publishing, Done, Failed, Canceled, and Checking status. Unknown states never appear as confirmed Scheduled. The initial scheduling receipt remains the receipt of creation; read current status separately.

## Worker and recovery

The worker fetches at most 25 due rows per tick. A conditional database update claims each row with a random token, five minute lease and durable attempt count. Competing connections cannot claim the same row. The process tick also avoids overlapping intervals.

Before provider submission, an attempt is stored in publish logs. Trusted adapter callbacks save parent media container IDs before polling, record the boundary before publication, and save returned post IDs before completion. These callbacks are an application interface, never model supplied options.

A saved Threads/Instagram parent container can resume polling without creating a replacement container. Poll failures with a known container use the existing bounded retry schedule. An expired lease during preparation can be reclaimed. An expired lease with a confirmed saved post receipt settles as published. An uncertain response during publication stays `outcome_unknown`; it is never blindly published again. A crash between remote acceptance and durable receipt still requires status investigation. Partial child container creation, ambiguous LinkedIn outcomes and evidence that cannot be reconciled remain manual review cases. No exactly once platform guarantee is claimed.

The original scheduled instant remains in `originalPublishAt` while retry timing uses `publishAt`. Publication does not invoke a language model or debit AI credits. Entitlement policy remains product controlled and deferred commercial policies remain unset.

## Mutations and validation

Cancellation cannot overwrite publishing, published or uncertain delivery. Conditional writes detect changes between read and mutation. Editing requires a scheduled row and reruns platform/media validation. Rescheduling allows scheduled or canceled rows, with a future instant and confirmation. Editing and schedule state updates share an immediate transaction; a worker claim cannot race past them. In flight mutations return a defined error and require refreshed status instead of reporting a false cancellation.

## Migrations and deployment

Delivery migrations 0006 and 0007 add request receipts and nullable claim/lease/phase fields. Tests apply them to isolated SQLite databases, including an on disk two connection fixture. Existing schedules and tokens remain intact. Generated unrelated analytics reconstruction was excluded from these migrations. Apply migrations before starting the new worker; use one worker version during rollout. Rollback must not restart an old worker against unresolved claims or permit legacy request replay to duplicate V2 requests.

Both repositories now gate deployment with foundation checks. This is local verification, not authorization to deploy. Full product release still requires content approval enforcement, active legacy campaign transition, media availability through due time, provider/reconnect verification, the complete responsive UI and billing acceptance.

## Verification

Real SQLite tests cover replay, tenant collision, concurrent replay, changed content conflict, transaction rollback, exact lookup, bounded pages, guarded mutations, two worker connections, lost response uncertainty, saved container resume and crash after receipt persistence. Adapter suites run against mocked network responses. Product calendar tests verify all pages and nonmutable uncertain statuses. Playwright exercises the real calendar DOM with a local API fixture; no social post is created by that browser test.
