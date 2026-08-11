# 0010 SocialMCP schedule contract

Recorded 2026-08-09 against SocialMCP (`all-social-mcp` MCP server tools). Updated 2026-08-10 for `reschedule_scheduled_post` and `update_scheduled_post_content`. Updated 2026-08-11 for multi-account filter and same-platform multi-account mirror.

## Tools used by product calendar

| Product need | MCP tool | Available | Notes |
|---|---|---|---|
| List schedules | `get_scheduled_posts` | yes | Optional `platform`, `status`. No date range filter; product filters `publishAt` by `from`/`to`. Product may further filter by one or more `accountId`s (`accountIds` query / `accountId` alias). |
| Get one schedule | (derive from list) | yes via list | No dedicated get by id. Product loads list (or caches) and selects `scheduled[].id`. |
| Reschedule | `reschedule_scheduled_post` | yes | Requires `confirm: true` (or `dryRun: true`). Args: `scheduledPostId`, `publishAt` (future ISO). Allowed for `status=scheduled` or `cancelled` (cancelled reactivates to `scheduled`). |
| Update caption/media | `update_scheduled_post_content` | yes | Requires `confirm: true` (or `dryRun: true`). Args: `scheduledPostId`, optional `text`, optional HTTPS `mediaUrls` (at least one of text/mediaUrls). Allowed for `status=scheduled` or `cancelled`. |
| Cancel | `cancel_scheduled_post` | yes | Requires `confirm: true` (or `dryRun: true`). Args: `scheduledPostId`. |
| Create schedule | `schedule_post` | yes | Modal mirror only: `POST /calendar/slots/:id/mirror` calls once per **account** target (same platform allowed when `accountId`s differ). Chat/orchestration still owns planner create. |

Also used for sidebar accounts: `list_connected_accounts` (existing connectors path).

## List payload (mapped fields)

`get_scheduled_posts` returns `{ ok, scheduled: [...] }` where each row includes at least:

- `id` → product `scheduleId`
- `platform`
- `connectedAccountId` → product `accountId`
- `publishAt` → product `scheduledAt` (UTC ISO)
- `status` (`scheduled` \| `cancelled` \| `published` \| `failed`)
- `timezone` (optional, MCP row timezone; display still uses client IANA)
- `lastError` (never shown raw; informs Failed bucket only)
- `postVariantId` (internal; not required on cards)

**Caption and media:** `get_scheduled_posts` returns `contentText`, `captionPreview` (first 80 chars), and HTTPS `mediaUrls` from the linked post variant. Product maps these to list/detail captions. Content edits go through `update_scheduled_post_content` and re-read the list projection.

## Status buckets (product)

| MCP `status` | Product bucket |
|---|---|
| `scheduled` | Scheduled |
| `published` | Done |
| `failed` | Failed |
| `cancelled` / `canceled` | Canceled |
| anything else | Scheduled |

## Mutation flags

For `status=scheduled` (product bucket Scheduled):

```ts
{ canReschedule: true, canCancel: true, canEditContent: true }
```

For `status=cancelled` (product bucket Canceled):

```ts
{ canReschedule: true, canCancel: false, canEditContent: true }
```

Rescheduling a canceled post reactivates it to Scheduled at the new time (drag or modal). Published (`Done`) remains immutable. Failed stays view-oriented for mutations in v1.

## Product routes beyond MCP

| Product need | Route | Notes |
|---|---|---|
| List week slots | `GET /calendar/slots` | Query: `from`, `to`, `timeZone`, optional `platform`, optional `accountId` and/or comma-separated `accountIds`. Empty filter = all accounts. |
| List scheduled posts | `GET /scheduled/posts` | Same account filter params as slots. |
| Patch time | `PATCH /calendar/slots/:id` | Body: `{ scheduledAt }` (UTC ISO). Time only — no caption/media. |
| Patch content | `PATCH /calendar/slots/:id/content` | Body: `{ caption? }` and/or `{ media? }` (HTTPS). Content only — rejects `scheduledAt`. |
| Mirror to accounts | `POST /calendar/slots/:id/mirror` | Body `{ targets: [{ platform, accountId, scheduledAt }], caption?, media? }` → `{ created: ScheduleDetail[] }`. One SocialMCP `schedule_post` per target account. Same platform allowed when account ids differ; source `accountId` rejected. |
| Selection rewrite chips | `POST /calendar/slots/:id/rewrite-selection` | Body `{ selection, action: "regenerate"\|"tweak"\|"comment", instruction? }` → `{ suggestion }`. `regenerate` needs no instruction; tweak/comment ≤40 words. Soft-fails `REWRITE_UNAVAILABLE` when Thesean is down; does not mutate MCP. |
