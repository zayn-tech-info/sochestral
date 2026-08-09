# 0010 SocialMCP schedule contract

Recorded 2026-08-09 against SocialMCP (`all-social-mcp` MCP server tools).

## Tools used by product calendar

| Product need | MCP tool | Available | Notes |
|---|---|---|---|
| List schedules | `get_scheduled_posts` | yes | Optional `platform`, `status`. No date range filter; product filters `publishAt` by `from`/`to`. |
| Get one schedule | (derive from list) | yes via list | No dedicated get by id. Product loads list (or caches) and selects `scheduled[].id`. |
| Reschedule | — | **no** | No MCP verb. Product `PATCH` returns 409 `MUTATION_UNSUPPORTED`; UI disables reschedule. |
| Cancel | `cancel_scheduled_post` | yes | Requires `confirm: true` (or `dryRun: true`). Args: `scheduledPostId`. |
| Create schedule | `schedule_post` | yes but out of Feature 10 v1 | Calendar does not create. |

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

**Caption and media:** `get_scheduled_posts` returns `contentText`, `captionPreview` (first 80 chars), and HTTPS `mediaUrls` from the linked post variant. Product maps these to list/detail captions.

## Status buckets (product)

| MCP `status` | Product bucket |
|---|---|
| `scheduled` | Scheduled |
| `published` | Done |
| `failed` | Failed |
| `cancelled` / `canceled` | Canceled |
| anything else | Scheduled |

## Mutation flags

```ts
{ canReschedule: false, canCancel: true }
```

until a reschedule tool exists on SocialMCP.
