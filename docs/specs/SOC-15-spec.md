# SOC-15. WhatsApp channel for agent chat

**Date**: 2026-08-09
**Status**: In Progress
**Linear**: [SOC-15](https://linear.app/sochestral/issue/SOC-15/design-feature-8-whatsapp-channel-for-agent-chat)
**Scope**: Feature 8 in `docs/scope/scope.md`
**Related**: [0001 Product database](./0001-product-database.md) · [0002 Auth session and MCP JWT](./0002-auth-session-mcp-jwt/index.md) · [0003 Orchestration backend](./0003-orchestration-backend/index.md) · [0005 Review mode publish loop](./0005-review-mode-publish-loop/index.md) · [0004 Chat connectors UI](./0004-chat-connectors-ui/index.md)

## Summary

This decision adds WhatsApp as an optional messaging channel for the same operator agent already used on the web. The product API owns Meta WhatsApp Cloud API webhooks and outbound replies. A new channel identity table links a WhatsApp sender id to one SaaS `userId`. Linked users can draft, approve, and get publish status in chat without opening the web UI. Platform OAuth connect still uses a browser link sent in the chat. Telegram is not built here, but the identity model leaves room for it.

## Context

Slice 1 proved connect, draft, review, and publish on the web product path. Many target users, especially Nigeria based physical product sellers, live in WhatsApp more than in a browser. Feature 8 is the first messaging add on so those users can run the same operator loop from their phone.

Product Postgres already holds users, sessions, orchestration conversations, drafts, and review state. SocialMCP still owns platform tokens and publish execution. There is no channel identity table and no webhook surface in this repo today. Threads and Instagram webhook patterns live on external SocialMCP, not on the product API. Messaging channels are a product concern (identity, orchestration entry, review), so WhatsApp must land here, not inside SocialMCP.

Without a decision, a later build would invent identity linking, webhook auth, and approve semantics mid flight, or wrongly put WA tokens and webhooks into the MCP execution DB. Linear has Feature 6 tiers deferred and Feature 7 setup profile Done as the prerequisite for a grounded agent. Master plan close out order still lists Feature 6 before channels; this issue is explicitly Ready with tiers deferred, so sequencing follows Linear for this feature while keeping locked stack rules (repo split, review before publish, model decides and code executes).

## Requirements

**User stories**:
- As a linked business owner, I want to message the Sochestral WhatsApp number and get a draft back so I can work from my phone.
- As a linked business owner, I want to approve a pending draft from WhatsApp so the post can publish without opening the web UI.
- As a linked business owner, I want publish success or failure status in WhatsApp so I know what went live.
- As a linked business owner, I want a browser OAuth link in chat when I need to connect Threads, LinkedIn, or Instagram so tokens still land in SocialMCP.
- As a signed in web user, I want to link or unlink my WhatsApp number so only my account can drive my drafts and publishes.
- As the product, I want every WhatsApp turn scoped to one SaaS `userId` so orchestration, review, and MCP JWT minting stay tenant safe.

**Acceptance criteria**:
- **AC-1**: Migrations create a product owned channel identity table that can store a WhatsApp external id uniquely mapped to at most one `users.id`, with channel kind, link status, and timestamps. No platform OAuth tokens are stored in this table.
- **AC-2**: A signed in user can start a WhatsApp link from the product (web Settings entry or equivalent authenticated API), receive a short lived link challenge, and complete binding so inbound messages from that WhatsApp id resolve to their `userId`.
- **AC-3**: Unlinked inbound senders receive a reply that explains how to link, and never reach orchestration, draft creation, or publish.
- **AC-4**: Linked inbound text messages invoke the existing operator orchestration path for that `userId` (same tool allowlist and review rules as web chat), and the product sends the agent reply text back on WhatsApp Cloud API.
- **AC-5**: A linked user can complete draft, approve (trusted publish of an eligible review group), and status check from WhatsApp alone, without using the web UI for those steps.
- **AC-6**: When the user needs platform connect, the channel sends an `https` authorize URL from the existing connectors `startConnect` flow (product starts connect; MCP stores tokens). The chat never collects platform passwords or tokens.
- **AC-7**: Webhook verify (Meta challenge) and inbound delivery authenticate with product configured WhatsApp secrets. Invalid signatures or verify tokens are rejected. Duplicate WhatsApp message ids are ignored (idempotent).
- **AC-8**: Outbound free form replies are sent only inside the user initiated customer care window (Meta 24 hour window after the user messages). v1 does not send business initiated template campaigns. If the window is closed, the product records the need and does not silently drop a publish side effect that already ran; status that could not be delivered is retried only if the user messages again or a later in scope delivery path exists.
- **AC-9**: `WHATSAPP_CHANNEL_ENABLED` defaults false. When false, webhook verify can still succeed for Meta subscription setup if secrets are present, but inbound business handling responds with a clear disabled message and does not orchestrate.
- **AC-10**: Review before publish stays enforced: chat model tools still cannot authorize live publish; approve on WhatsApp calls the same trusted review publish path used by the web API.
- **AC-11**: Automated tests cover at least: identity link and uniqueness; unlinked inbound rejection; signature or verify failure; idempotent duplicate wamid; linked inbound orchestration call with correct `userId`; approve path wired to review publish; flag off behavior; connect link generation uses connectors service.

## Options considered

### Option 1: Product owned WhatsApp Cloud API channel over existing orchestration (recommended)

Add webhook routes and a thin WhatsApp adapter on `sochestral-api`. Persist channel identities in Neon. Resolve `userId`, then call existing `OrchestrationService` and `ReviewService` in process. Outbound text uses Meta Cloud API. Keep OAuth as browser links from connectors.

**Pros**:
- Matches repo split and Tracer Bullet reuse
- One agent brain for web and WhatsApp
- Smallest new surface that still ships phone first draft and approve

**Cons**:
- Product must operate Meta webhook secrets and phone number config
- Text chat UX is weaker than the web preview aside

### Option 2: Put WhatsApp inside SocialMCP

Run WA webhooks and identity in the external MCP execution stack.

**Pros**:
- Keeps Meta credentials near other Meta apps

**Cons**:
- Breaks the locked product versus MCP split (channels and SaaS identity are product owned)
- Couples open execution infra to private channel linking and review UX

### Option 3: Separate WhatsApp bot service with its own agent

New service, new conversation store, custom command parser only.

**Pros**:
- Isolation from web chat

**Cons**:
- Duplicates orchestration, authz, and review rules
- High drift risk versus web behavior
- Slower Slice 2 delivery

## Decision

**Chosen option**: Option 1: Product owned WhatsApp Cloud API channel over existing orchestration.

v1 is text first. Identity lives in product Postgres. Inbound webhooks authenticate, resolve the linked `userId`, and enter the same operator agent. Approve uses trusted review publish. Connect uses browser links. Telegram is a later Feature 9 on the same identity table shape.

**Automation note**: This run had no interactive engineer interview. Requirements come from Linear SOC-15 Done when, `docs/scope/scope.md` Feature 8, and locked master plan stack rules. Load bearing picks below are Staff recommendations for PR review; change them in this spec before `/develop` if product wants a different link UX or message policy.

**Implementation skills**: `hono` (`.agents/skills/hono/`) · `drizzle-orm-patterns` (`.agents/skills/drizzle-orm-patterns/`) · `postgres-drizzle` (`.agents/skills/postgres-drizzle/`) · `auth-implementation-patterns` (`.agents/skills/auth-implementation-patterns/`)

## Rationale

The job is phone access to the proven operator loop, not a second product. Reusing orchestration and review keeps review before publish and tenant scoping intact. Product ownership of channel identity matches 0001 and the master plan repo split. Official WhatsApp Cloud API is the only provider fit for a business strict Meta path already used for Instagram and Threads on the MCP side. Deferring templates and Telegram keeps the first Tracer Bullet thin: link, message, draft, approve, status, connect link.

## Feature design

**Build approach**: Tracer Bullet. First vertical slice is: migrate identity → webhook verify → link challenge → one linked inbound text turn → WhatsApp reply. Then thicken with approve, status, connect links, idempotency hardening, and Settings unlink.

**Data model sketch**:

`channel_identities`
- `id` text PK, app generated `chlink_` + nanoid (same id style as `user_` / `draft_`)
- `userId` text not null FK → `users.id` on delete cascade
- `channel` text not null, check in (`whatsapp`, `telegram`) ; v1 writes only `whatsapp`
- `externalId` text not null (WhatsApp Cloud API `wa_id` / user id string Meta sends)
- `displayKey` text null (E.164 phone for operator display only, never used alone as auth)
- `status` text not null, check in (`pending`, `active`, `revoked`)
- `linkedAt` timestamptz null (set when status becomes `active`)
- `revokedAt` timestamptz null
- `createdAt` / `updatedAt` timestamptz not null
- Unique `(channel, externalId)` where status is not `revoked` (enforce one active or pending owner per WhatsApp id)
- Unique `(userId, channel)` where status is `active` (one active WhatsApp link per user in v1)

`channel_link_challenges`
- `id` text PK `chlchal_` + nanoid
- `userId` text not null FK → `users.id` on delete cascade
- `channel` text not null (`whatsapp`)
- `tokenHash` text not null (store hash only; raw token shown once in web or sent in SMS style copy)
- `expiresAt` timestamptz not null (recommended default 30 minutes)
- `consumedAt` timestamptz null
- `createdAt` timestamptz not null

`whatsapp_inbound_receipts`
- `wamid` text PK (Meta message id)
- `channelIdentityId` text null FK
- `processedAt` timestamptz not null
- Purpose: idempotency for webhook retries

`channel_pending_actions`
- `id` text PK `chpend_` + nanoid
- `channelIdentityId` text not null FK → `channel_identities.id` on delete cascade
- `kind` text not null, check in (`approve_group`)
- `groupId` text not null (review group id the user may approve)
- `summaryText` text not null (last draft summary shown in WhatsApp)
- `expiresAt` timestamptz not null (recommended default 24 hours)
- `consumedAt` timestamptz null
- `createdAt` timestamptz not null
- At most one unconsumed row per `channelIdentityId` (unique partial index where `consumedAt` is null)

Conversation source:
- Find or create one `orchestration_conversations` row per active WhatsApp link.
- Add nullable `source` text on conversations (`web` | `whatsapp`) in the same migration if no equivalent column exists. Do not fork a second message store.

Pending outbound (care window closed):
- `channel_outbound_queue` is not required in v1 if the bridge can recompute status from review tables on the next inbound.
- Recommended: on next inbound after a publish, if the user has not been told the result, send a short status flush derived from the latest `draft_publish_attempts` for that pending group. No durable outbound queue in v1.

**State transitions**:
- Link challenge: created → consumed (success) or expired (ignored)
- Channel identity: `pending` (optional, if precreate) → `active` → `revoked`
- Inbound message receipt: unseen → inserted `wamid` (duplicate insert means skip)
- Review or draft states: unchanged from 0005; WhatsApp does not invent new draft statuses

**Link UX (recommended)**:
1. Signed in user calls `POST /channels/whatsapp/link` (session auth).
2. Product creates `channel_link_challenges` and returns a deep link `https://app.sochestral.shop/settings/channels/whatsapp?token=...` plus short instructions.
3. User opens WhatsApp to the business number (or taps a `wa.me` link that includes the token as the prefilled text, e.g. `LINK <token>`).
4. Inbound webhook sees `LINK <token>` from `wa_id`, validates hash and expiry, writes `channel_identities` active row, consumes challenge, replies “linked”.
5. Unlink: signed in `DELETE /channels/whatsapp` sets status `revoked` and clears future orchestration for that external id.

Runner up link UX: six digit code shown in Settings that the user types to the WA number. Same tables; only challenge formatting changes.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/webhooks/whatsapp` | GET | hub.mode, hub.verify_token, hub.challenge | challenge plain text | Meta verify token match | 403 wrong token |
| `/webhooks/whatsapp` | POST | Meta webhook body + signature header | 200 quickly after enqueue or sync process | HMAC with app secret | 401/403 bad signature |
| `/channels/whatsapp` | GET | none | link status, masked displayKey | session | 401 |
| `/channels/whatsapp/link` | POST | none | deep link URL, expiresAt, instructions | session | 401, 409 already active |
| `/channels/whatsapp` | DELETE | none | ok | session | 401, 404 none active |

Internal (not public HTTP): WhatsApp adapter methods `sendText(waId, body)`, `verifySignature(rawBody, header)`, `parseInbound(payload)`.

Orchestration and review stay on existing services. Channel code must not reimplement publish. For approve from chat, either:
- natural language that ends in the same trusted client side approve action pattern, implemented as a **channel owned** explicit confirm step after the agent presents a draft summary, calling `ReviewService.publishGroup(userId, groupId, …)` only when the user sends a clear confirm (`APPROVE` / `YES` on the pending group id the channel stored), or
- a narrow channel command router for `STATUS` and `APPROVE` that never grants the model tool live publish.

Recommended: hybrid. Free form text goes to orchestration. When a review group is pending for the WhatsApp conversation, the channel tracks `pendingGroupId` in memory table or a small `channel_pending_actions` row; user `APPROVE` / `YES` triggers trusted publish; user free form edit requests go back through orchestration.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Resolve tenant for inbound | `userId` | `channel_identities.userId` where channel=`whatsapp` and externalId=`wa_id` and status=`active` |
| WhatsApp sender id | `externalId` | Meta webhook message `from` / `wa_id` |
| Link challenge token | one time secret | generated at link start; only `tokenHash` persisted |
| Agent reply text | outbound WA body | orchestration turn assistant text (same sanitization or redaction helpers as web where applicable) |
| Draft body shown in chat | text summary | product `drafts` rows for the pending review group |
| Approve effect | publish attempt result | `ReviewService.publishGroup` then SocialMCP `publish_now` via existing path |
| Status text | published URLs or failure codes | `draft_publish_attempts` / review service read models |
| Connect URL | `authorizeUrl` | `ConnectorService.startConnect(userId, platform)` |
| Enable gate | boolean | `WHATSAPP_CHANNEL_ENABLED === "true"` |
| Verify webhook | challenge echo | compare query token to `WHATSAPP_WEBHOOK_VERIFY_TOKEN` |
| Signature check | accept or reject | HMAC SHA256 of raw body with `WHATSAPP_APP_SECRET` (Meta `X-Hub-Signature-256`) |
| Care window allow outbound | boolean | last inbound timestamp on identity or receipt clock + 24h rule |
| Idempotency | process or skip | `whatsapp_inbound_receipts.wamid` |

**Key invariants**:
- One active WhatsApp external id maps to at most one `userId`.
- One user has at most one active WhatsApp link in v1.
- Unlinked or revoked ids never call orchestration or review mutations.
- Model tools cannot publish live; only trusted review publish can.
- Platform tokens never stored in product channel tables.
- Webhook handlers acknowledge Meta quickly; long orchestration may run async in process for v1 as long as the HTTP handler does not time out Fly’s proxy (prefer await with a clear upper bound, or ack then process if the team already has a queue; do not add a new broker in v1 unless required). Recommended default: process inline with a hard time budget and send a “working…” text first for slow turns.
- Duplicate `wamid` never double sends or double publishes.

**Security model**:
- Public: only `/webhooks/whatsapp` with Meta verify and signature checks. Rate limit this route.
- Session cookie auth: link status, create challenge, unlink (same session model as 0002).
- Channel authz for orchestration: possession of linked WhatsApp id after signature verified inbound.
- PII: phone numbers and `wa_id` are personal data; log carefully, mask in admin style responses, encrypt at rest only if the project later adds field encryption (not required for v1 beyond TLS and Neon defaults).
- Secrets in Fly env only, never in repo.

**Message policy (locks Linear manual step 3)**:
- v1 is user initiated. Free form outbound only inside Meta’s customer care window after an inbound user message.
- No marketing template blasts in v1.
- Drafts, approval prompts, and status are session replies in that window.
- If publish finishes after the window closed, persist result in product DB; deliver text on the next user inbound (flush pending outbound).

**Configuration required**:
- `WHATSAPP_CHANNEL_ENABLED`: master flag, default false
- `WHATSAPP_APP_SECRET`: Meta app secret for `X-Hub-Signature-256`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: verify token for GET challenge
- `WHATSAPP_ACCESS_TOKEN`: Cloud API permanent or long lived token for send
- `WHATSAPP_PHONE_NUMBER_ID`: send API phone number id
- `WHATSAPP_BUSINESS_ACCOUNT_ID`: optional, for ops and future template work
- `WHATSAPP_API_VERSION`: Graph version string, default a current stable (pin in code, e.g. `v21.0`, overridable)
- `PUBLIC_WEB_ORIGIN`: used when minting link deep links (may already exist under another name; reuse the existing public web origin config if present)

**Prerequisites (human, not `/develop`)**:
1. Meta WhatsApp Cloud API app and WABA with a send capable number
2. Callback URL `https://api.sochestral.shop/webhooks/whatsapp` subscribed to messages
3. Fly secrets set on `sochestral-api`
4. Flag remains false until smoke on a test number passes

**Critical test scenarios**:
- Happy path: link → inbound draft request → WA reply with draft summary → `APPROVE` → publish → status text, verifies **AC-2**, **AC-4**, **AC-5**
- Unlinked inbound: instructions only, no orchestration, verifies **AC-3**
- Bad signature or wrong verify token: rejected, verifies **AC-7**
- Duplicate `wamid`: second delivery no second publish, verifies **AC-7**
- Flag off: no orchestration, verifies **AC-9**
- Connect ask: outbound contains https authorize URL from connectors, verifies **AC-6**
- Model cannot publish without APPROVE trusted path, verifies **AC-10**

## Build plan

Ordered for Tracer Bullet (thin end to end first, then thicken).

1. [x] **Schema and repos** — Add `channel_identities`, `channel_link_challenges`, `whatsapp_inbound_receipts` (and conversation `source` if needed) in `packages/database` with Drizzle migration and helpers. Satisfies **AC-1**.
2. [x] **Config and WhatsApp client** — Read env vars; implement signature verify, GET challenge, and `sendText` against Cloud API; gate on `WHATSAPP_CHANNEL_ENABLED`. Satisfies **AC-7**, **AC-9**.
3. [x] **Webhook routes** — Mount `GET/POST /webhooks/whatsapp` on the Hono app; parse inbound text; idempotent `wamid`; unlinked reply path. Satisfies **AC-3**, **AC-7**.
4. [x] **Link and unlink APIs** — Session routes to create challenge, read status, revoke; inbound `LINK <token>` consumer. Satisfies **AC-2**.
5. [x] **Orchestration bridge** — For active links, find or create WhatsApp sourced conversation; call existing orchestration message or stream turn with resolved `userId`; send assistant text outbound; respect care window and pending outbound flush. Satisfies **AC-4**, **AC-8**.
6. [x] **Approve and status** — Channel pending action for review group; `APPROVE`/`YES` → `ReviewService.publishGroup`; `STATUS` or natural status ask → read attempt results and reply. Satisfies **AC-5**, **AC-10**.
7. [x] **Connect links in chat** — When user asks to connect a platform (or agent needs it), call `ConnectorService.startConnect` and send the authorize URL. Satisfies **AC-6**.
8. [x] **Minimal web Settings entry** — Small link or unlink UI in existing Settings (reuse current design system; no new marketing page). Satisfies **AC-2** display path.
9. [x] **Tests** — Unit and route tests listed in **AC-11**; keep Meta HTTP mocked at the client boundary.
10. [ ] **Cloud enable checklist** — Document Fly secrets and smoke steps on the Linear issue; leave flag false until human smoke. Does not block code merge.

## Consequences

**Positive**:
- Phone first operators get the real draft and approve loop
- One identity and review model for later Telegram
- Locked repo split preserved

**Negative**:
- Product ops now includes Meta WA webhook and token rotation
- Text channel lacks the live preview aside; users approve from summaries
- Care window limits unsolicited outbound status

**Neutral**:
- Feature 6 tier gates are not applied in v1 (tiers deferred); when tiers land, gate WhatsApp on entitlement in the channel entrypoint
- Feature 9 Telegram should reuse `channel_identities` and the bridge pattern

## Follow-up

- Human: create or confirm WABA, phone number id, permanent token strategy, webhook verify token (Linear manual steps)
- After smoke: set `WHATSAPP_CHANNEL_ENABLED=true` on Fly
- Feature 9: Telegram on the same identity table
- Later: template messages for business initiated reminders, inbound media, group chats (out of scope)
- Sync master plan Slice 2 status row (Feature 7 Done, Feature 6 deferred, Feature 8 designing) via `/sync` or docs issue; do not block this spec
- If business profile tables from Feature 7 are not yet on the branch `/develop` builds against, WhatsApp still ships; grounding improves automatically once profile is loaded by orchestration the same way as web

## References

**Project sources**:
- `docs/scope/scope.md` Feature 8
- `sochestral-master-plan.md` locked repo split and review before publish
- Specs 0001, 0002, 0003, 0004, 0005
- Linear SOC-15

**Practices**:
- Official Meta WhatsApp Cloud API webhooks and messaging
- Idempotent webhook processing
- Trusted publish path separate from model tools

**Links**:
- [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/)
- [WhatsApp Cloud API webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)
- [Customer care windows](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages)
