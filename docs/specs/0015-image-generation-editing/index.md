# 0015. Image generation and editing

**Date**: 2026-08-12
**Status**: In Progress

## Summary

Sochestral adds still image generate and edit so operators can make publish ready visuals for chat, review, and schedule flows. Brand Assets live under Settings. Paid OpenAI `gpt-image-2` calls run only after an explicit Generate or Apply click. Results reuse Feature 12 `media_assets` and R2. Video, remove background, upscale, and the full credit usage dashboard wait.

## Requirements

**User stories**:

- As a business owner, I want a Brand Assets library so flyers and posters can use my logo, colors, and references when I opt in.
- As a business owner, I want to generate or edit images from chat and schedule flows with a clear cost confirm so I do not burn credits by accident.
- As a product operator, I want every paid job logged with cost fields and a kill switch so beta spend stays bounded until billing ships.

**Acceptance criteria**:

- **AC-1**: User can open Settings → Brand Assets, upload and manage logos, colors or design notes, and reference images. Library is tenant owned only.
- **AC-2**: Chat supports a `/brand-asset` picker that loads owned library items. Selected ids attach to the pending generate proposal. Slash text alone is not authority.
- **AC-3**: Brand context applies only when the user opts in (`/brand-asset` or clear “use my brand”), or after a product owned clarify turn (same family as spec 0007) when the ask looks like branded marketing creative and intent is unclear. “Don’t use brand” or “random” never applies brand. Subject only generates stay brand free. No confirm strip until clarify is answered when required.
- **AC-4**: Every paid generate or edit needs an explicit Generate or Apply click on a proposal strip that shows size preset, credit cost estimate, and selected references or brand picks. No provider call before that click.
- **AC-5**: Size presets are `square` (1:1), `portrait_4_5` (4:5, default), `story_9_16` (9:16), and `linkedin_landscape` (~1.91:1) with the pixel map in Feature design. Size is chosen on the proposal strip, not by regex on chat text.
- **AC-6**: Quick actions on an owned ready asset in v1: Reframe to preset (local `sharp` crop when the source is large enough), Vary, and prompt edit. Each opens a proposal and spends only on Apply. Remove background and Upscale are out of this slice.
- **AC-7**: User may generate from prompt, edit an upload, or pass up to the effective reference cap (beta env default 5; later plan limits). Over cap refuses closed.
- **AC-8**: Jobs are async, one queued or running job per user. Progress and failure show in chat or review. Success creates a Feature 12 style ready `media_assets` row in R2, attachable to drafts and schedule modals.
- **AC-9**: Brand Assets shows a thin Recent generations list. Generations are not mixed into the curated brand library.
- **AC-10**: Exhausted monthly credit budget or `IMAGE_GENERATION_ENABLED=false`: no provider call; clear refuse; CTA copy for Add credit or Upgrade to the next higher plan (billing UI may be stub).
- **AC-11**: Each job row stores provider, model, estimated cost cents, credits charged, user id, status, and outcome. Full credit usage dashboard (user and admin, all AI spend) is out of this slice.
- **AC-12**: Image tools stay model proposes, code executes: allowlisted actions, validated args, tenant scoped. Video generation is out of scope.

## Decision

**Chosen option**: OpenAI `gpt-image-2` behind a product `ImageProvider`, Postgres backed `image_jobs` worker, Brand Assets library, confirm before spend

Still images only. Brand injection is opt in or clarify based. Binary storage and publish stay on Feature 12 media. Beta spend uses an env monthly credit budget and a fixed credit price table until Feature 6.

**Implementation skills**: `postgres-drizzle` (`ccheney/robust-skills`, `.agents/skills/postgres-drizzle/`) · `drizzle-orm-patterns` (`giuseppe-trisciuoglio/developer-kit`, `.agents/skills/drizzle-orm-patterns/`) · `hono` (`yusukebe/hono-skill`, `.agents/skills/hono/`)

## Rationale

Reasoning and options: see [rationale.md](./rationale.md).

## Feature design

**Data model sketch**:

- `brand_assets`: `id`, `userId`, `kind` (`logo` | `reference_image` | `color` | `design_note`), `name` (required), `mediaAssetId` (required for logo and reference_image), `colorValue` (nullable), `noteText` (nullable, max 2000), `sortOrder`, `archivedAt` (nullable), `createdAt`, `updatedAt`.
- `image_jobs`: `id`, `userId`, `conversationId` (nullable), `kind` (`generate` | `reframe` | `vary` | `prompt_edit`), `status` (`pending_confirm` | `queued` | `running` | `succeeded` | `failed` | `cancelled`), `prompt` (nullable, max 2000), `sizePreset`, `width`, `height`, `sourceMediaAssetId` (nullable), `resultMediaAssetId` (nullable), `provider` (e.g. `openai`), `model` (e.g. `gpt-image-2`), `estimatedCostCents`, `creditsCharged`, `errorCode`, `errorMessage` (safe), `createdAt`, `startedAt`, `completedAt`.
- `image_job_inputs`: `id`, `jobId`, `position`, exactly one of `mediaAssetId` or `brandAssetId`, `role` (`reference` | `brand`). Unique (`jobId`, `position`).
- `image_credit_wallets`: `userId` + `periodYm` (UTC calendar month as `YYYY-MM`) composite PK, `creditsUsed` (int ≥ 0), `updatedAt`. Remaining = `IMAGE_MONTHLY_CREDIT_BUDGET` − `creditsUsed` (never below 0). Charge and refund adjust `creditsUsed` only. Full ledger UI waits.
- Reuse `media_assets` (Feature 12) for all binaries and publish URLs.
- Optional idempotency: unique (`userId`, `requestId`) on job create/confirm mutations that accept `requestId`.

**Size preset → pixels** (source of `width` / `height`):

| Preset key | Ratio | Width × height |
|---|---|---|
| `square` | 1:1 | 1024 × 1024 |
| `portrait_4_5` (default) | 4:5 | 1080 × 1350 |
| `story_9_16` | 9:16 | 1080 × 1920 |
| `linkedin_landscape` | ~1.91:1 | 1200 × 627 |

**State transitions**:

- Job: `pending_confirm` → `queued` → `running` → `succeeded` | `failed`. Cancel only from `pending_confirm` or `queued`. `pending_confirm` expires after 30 minutes.
- One `queued` or `running` job per user.
- `running` older than `IMAGE_JOB_RECLAIM_MS` (default 10 minutes) → `failed` + credit refund.
- Brand `DELETE` sets `archivedAt` only (no hard delete in v1); hidden from new picks; old job inputs keep ids.
- Local reframe when source is too small for the preset crop: job `failed` with safe code `REFRAME_SOURCE_TOO_SMALL`; no provider call; no charge (or refund if charged).

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/brand-assets` | GET | kind? | items (non archived) | owner session | 401 |
| `/brand-assets` | POST | kind, name, mediaAssetId? colorValue? noteText? | item | owner session + image action | 401, 404, 422 |
| `/brand-assets/:id` | PATCH | name? sortOrder? colorValue? noteText? | item | owner session + image action | 401, 404, 422 |
| `/brand-assets/:id` | DELETE | none | item with `archivedAt` set | owner session + image action | 401, 404 |
| `/image-jobs` | POST | kind, prompt?, sizePreset?, sourceMediaAssetId?, input ids, conversationId?, requestId | job (`pending_confirm`) + estimate | owner session + image action | 401, 404, 409, 422, 429 |
| `/image-jobs` | GET | limit, cursor | recent jobs + result meta | owner session | 401 |
| `/image-jobs/:id` | GET | none | job | owner session | 401, 404 |
| `/image-jobs/:id/confirm` | POST | requestId, sizePreset?, input ids? | job (`queued` or current) | owner session + image action | 401, 404, 409, 422, 429 |
| `/image-jobs/:id/cancel` | POST | requestId? | job cancelled | owner session + image action | 401, 404, 409 |

Logo and reference uploads use existing `/media/uploads` then link `mediaAssetId`. Review and schedule keep existing media attach APIs.

Mutation routes require the configured web origin, JSON, and `X-Sochestral-Request: image-action` (same family as publishing and review action headers).

Chat path: allowlisted orchestration tool `propose_image_job` (model proposes; product validates and `POST`s a `pending_confirm` job). Brand clarify uses a product owned clarify turn in the same family as spec 0007; no confirm strip until the user answers. UI progress: client polls `GET /image-jobs/:id` while status is `queued` or `running` (interval ~2s). Worker: `sochestral-api` loop polls `queued` every `IMAGE_WORKER_POLL_MS` (default 2000).

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| List brand assets | items | owned `brand_assets` where `archivedAt` is null |
| Create brand logo or reference | media link | owned ready `media_assets` id from Feature 12 upload |
| Create color | colorValue | request body hex or css color |
| Create design note | noteText | request body, max 2000 chars |
| `/brand-asset` picker | selectable rows | `GET /brand-assets` in the web composer |
| Brand apply decision | use brand or not | user opt in ids, clear wording, or clarify answer (0007 style turn); never regex |
| Create job proposal | sizePreset | request override, else schedule/chat target platform map (Instagram feed → `portrait_4_5`, story → `story_9_16`, LinkedIn → `linkedin_landscape`, Threads → `square`), else `portrait_4_5` |
| Create job proposal | width, height | preset → pixels table above |
| Create job proposal | credits estimate | `IMAGE_CREDIT_COST_*` for kind; local reframe that will crop = 0 |
| Create job proposal | estimatedCostCents | `creditsEstimate × IMAGE_CREDIT_CENT_VALUE` (env, default 1) |
| Confirm strip | cost number | job `creditsCharged` estimate and `estimatedCostCents` columns |
| Confirm | charge | increment `image_credit_wallets.creditsUsed` for current UTC `periodYm` at `pending_confirm` → `queued` |
| Confirm | remaining | `IMAGE_MONTHLY_CREDIT_BUDGET − creditsUsed` |
| Worker model | model id | `IMAGE_MODEL` env (`gpt-image-2`) |
| Worker result | result asset | download provider bytes → Feature 12 sanitize path → ready `media_assets` |
| Local reframe | result asset | `sharp` center crop of owned source to preset; no OpenAI call when both dims ≥ target |
| Local reframe too small | failure | `REFRAME_SOURCE_TOO_SMALL`; no charge |
| Fail closed budget | refuse copy | remaining ≤ 0 or kill switch; stub Add credit / Upgrade CTAs |
| Recent generations | list | owned succeeded `image_jobs` with `resultMediaAssetId` |
| Idempotent create/confirm | same job | unique (`userId`, `requestId`); second confirm while queued/running/succeeded returns same job, no second charge |

**Key invariants**:

- No OpenAI call before confirm from `pending_confirm`.
- At most one queued or running job per user.
- Confirm only references owned ready media and non archived brand assets.
- Input count ≤ effective reference cap at confirm time.
- Succeeded job always has owned ready `resultMediaAssetId`.
- Provider key never reaches the browser or client logs.
- Model proposes via allowlisted `propose_image_job`; product code creates jobs and calls the provider.
- Credits charge once at confirm; refund on failure or reclaim; wallet keyed by UTC `periodYm`.
- Video tools are not allowlisted.

**Security model**:

Owner session is the only tenant source. Foreign ids return masked 404. Brand notes and prompts are owner private. R2 stays private; preview uses short lived signed URLs per Feature 12. Rate limit confirms (recommended 20 per hour per user) plus monthly credit budget. Provider safety refusals become `failed` with a safe client message.

**Configuration required**:

- `OPENAI_API_KEY`: server side OpenAI key for `gpt-image-2`
- `IMAGE_MODEL`: default `gpt-image-2`
- `IMAGE_GENERATION_ENABLED`: kill switch (false blocks new paid jobs)
- `IMAGE_MONTHLY_CREDIT_BUDGET`: beta per user monthly credits (default 50)
- `IMAGE_CREDIT_COST_GENERATE`, `IMAGE_CREDIT_COST_VARY`, `IMAGE_CREDIT_COST_PROMPT_EDIT`: whole credit costs (defaults 2, 2, 2; local reframe = 0)
- `IMAGE_CREDIT_CENT_VALUE`: cents represented per credit for `estimatedCostCents` (default 1)
- `IMAGE_REFERENCE_CAP`: beta max references per job (default 5)
- `IMAGE_WORKER_POLL_MS`: worker poll interval (default 2000)
- `IMAGE_JOB_RECLAIM_MS`: stuck `running` reclaim (default 600000)
- Existing R2 vars from Feature 12

**Critical test scenarios**:

- Happy path: Brand Assets upload → chat proposal with size 4:5 → confirm → worker → ready asset attach to draft or schedule, verifies **AC-1**, **AC-4**, **AC-5**, **AC-8**
- Brand rules: subject generate without opt in has no brand inputs; flyer with unclear intent asks clarify; “don’t use brand” has none, verifies **AC-3**
- Failure: provider error marks `failed`, refunds credits, no result asset; double confirm does not double charge, verifies **AC-10**, **AC-11** and idempotency
- Auth: user B cannot read or confirm user A job or brand asset (404), verifies tenant scope under **AC-1**, **AC-8**
- Cap: sixth reference at confirm refused when cap is 5, verifies **AC-7**
- Kill switch: confirm refused when `IMAGE_GENERATION_ENABLED=false`, verifies **AC-10**

## Build plan

Tracer Bullet: one paid generate path through schema, API, worker, R2, and chat confirm before widening Brand Assets UI and schedule entry points.

1. [x] Migration for `brand_assets`, `image_jobs`, `image_job_inputs`, and `image_credit_wallets`, satisfies **AC-1**, **AC-8**, **AC-11**
2. [x] Brand Assets CRUD + Feature 12 upload link + Settings Brand Assets page shell (library + recent list placeholder), satisfies **AC-1**, **AC-9**
3. [x] `ImageProvider` (OpenAI `gpt-image-2`) + Postgres worker loop on `sochestral-api` + R2 result ingest via Feature 12 sanitize, satisfies **AC-8**, **AC-11**, **AC-12**
4. [x] Image job create / confirm / cancel / get / list with credit preflight table, monthly budget, kill switch, 1 in flight, idempotent confirm, satisfies **AC-4**, **AC-5**, **AC-7**, **AC-10**, **AC-11**
5. [x] Chat proposal strip + `/brand-asset` picker + clarify brand rules + quick actions (reframe local, vary, prompt edit), satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**
6. [x] Wire ready results into review drafts and schedule modals (existing media attach), satisfies **AC-8**, **AC-9**
7. [x] Unit and API tests for brand rules, confirm gate, budget refuse, idempotency, tenant isolation, satisfies **AC-3**, **AC-4**, **AC-7**, **AC-10**, **AC-12**

## Consequences

**Positive**:

- Publish path stays one media system (Feature 12).
- Confirm before spend and monthly budget protect margin in beta.
- Brand library enables effective flyers without forcing brand on every random generate.

**Negative / tradeoffs**:

- `gpt-image-2` unit cost may be higher than some Flux hosts; revisit if margin hurts.
- Remove background and upscale wait; reframe is crop first, not generative outpaint.
- Postgres worker is enough for early volume; Redis or BullMQ may replace it later.
- Full usage dashboard waits, so users only see refuse or stub CTAs until Feature 6 adjacent work.

**Neutral**:

- Soft wallet is a stand in for real billing credits.
- Higgsfield was considered then dropped when you chose OpenAI.

## Follow-up

- [ ] Feature 6 / billing: real credits, Add credit and Upgrade flows, plan based reference caps
- [ ] Cross product credit usage UI (user + admin), not image only
- [ ] Remove background and Upscale (second provider or later OpenAI capability)
- [ ] Video generation pipeline (separate spec)
- [ ] Replace Postgres poll worker with Redis + BullMQ if queue latency or volume demands it
- [ ] Optional Quality toggle or marketing specific model allowlist if `gpt-image-2` alone underperforms on flyers
- [x] Scope Feature 17 enrolled; video / remove bg / upscale / usage UI deferred from this spec
- [x] Brand design brief compile (spec 0016 / Feature 18)
