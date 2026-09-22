import {
  getPlan, persistBoardSchedule, markBoardScheduleOperation, PlanWorkflowError, type Database,
} from "@sochestral/database";
import type { ConnectorService } from "./connectors.js";
import type { SocialMcpGateway } from "./mcp.js";
import { platformImageLimits } from "./platform-media-limits.js";
import { resolveScheduleTime } from "./schedule-time.js";

const platforms = ["threads", "instagram", "linkedin_personal"] as const;
type Platform = (typeof platforms)[number];

export type BoardScheduleRow = {
  itemId: string;
  excluded?: boolean;
  localTime?: string;
  accounts?: Partial<Record<Platform, string>>;
};

function isPlatform(value: string): value is Platform {
  return (platforms as readonly string[]).includes(value);
}

export async function confirmBoardSchedule(db: Database["db"], input: {
  userId: string;
  planId: string;
  version: number;
  confirm: boolean;
  rows: BoardScheduleRow[];
  connectors: ConnectorService;
  mcp: SocialMcpGateway;
  resolveMediaUrls?: (assetIds: string[]) => Promise<string[]>;
  now?: Date;
}) {
  if (input.confirm !== true) throw new PlanWorkflowError("INVALID_DOCUMENT");
  const detail = await getPlan(db, input.userId, input.planId, input.version);
  if (detail.plan.currentVersion !== input.version) throw new PlanWorkflowError("STALE_VERSION");
  if (!detail.board.timezoneConfirmed || !detail.board.timezone) throw new PlanWorkflowError("TIMEZONE_NOT_CONFIRMED");
  if (detail.contentJob && (detail.contentJob.status === "submitted" || detail.contentJob.status === "running")) {
    throw new PlanWorkflowError("CONTENT_NOT_READY");
  }
  if (detail.batches.some(batch => batch.kind === "content" && (batch.status === "submitted" || batch.status === "running"))) {
    throw new PlanWorkflowError("CONTENT_NOT_READY");
  }
  const byItem = new Map(detail.contentItems.map(item => [item.id, item]));
  const byRow = new Map(input.rows.map(row => [row.itemId, row]));
  if (byRow.size !== input.rows.length || byRow.size !== byItem.size || input.rows.some(row => !byItem.has(row.itemId))) {
    throw new PlanWorkflowError("INVALID_SCHEDULE");
  }
  const listed = await input.connectors.list(input.userId);
  const owned = new Map<string, { platform: Platform; connected: boolean }>();
  for (const connector of listed.connectors) {
    for (const account of connector.accounts) {
      owned.set(account.id, { platform: connector.platform, connected: account.state === "connected" });
    }
  }
  const excludedItemIds = [...byItem.values()].filter(item => item.excludedAt || byRow.get(item.id)?.excluded).map(item => item.id);
  const skippedItemIds: string[] = [];
  const now = input.now ?? new Date();
  const destinations: Parameters<typeof persistBoardSchedule>[1]["destinations"] = [];
  for (const item of byItem.values()) {
    if (excludedItemIds.includes(item.id)) continue;
    const row = byRow.get(item.id);
    if (item.status !== "ready" || !row?.localTime) {
      skippedItemIds.push(item.id);
      continue;
    }
    let publishAt: string;
    try {
      publishAt = resolveScheduleTime(row.localTime, detail.board.timezone);
    } catch {
      skippedItemIds.push(item.id);
      continue;
    }
    if (Date.parse(publishAt) <= now.getTime()) {
      skippedItemIds.push(item.id);
      continue;
    }
    const chosen = Object.entries(row.accounts ?? {}).filter((entry): entry is [Platform, string] => isPlatform(entry[0]) && Boolean(entry[1]));
    const accepted = chosen.filter(([destination, accountId]) => {
      const account = owned.get(accountId);
      return Boolean(account && account.platform === destination && account.connected);
    });
    if (!accepted.length) {
      skippedItemIds.push(item.id);
      continue;
    }
    for (const [destination, accountId] of accepted) {
      destinations.push({
        itemId: item.id, revisionId: item.revision.id, destination, connectedAccountId: accountId,
        localTime: row.localTime, publishAt: new Date(publishAt), timezone: detail.board.timezone,
      });
    }
  }
  if (!destinations.length) throw new PlanWorkflowError("SCHEDULE_NOT_READY", { itemIds: skippedItemIds });
  const persisted = await persistBoardSchedule(db, {
    userId: input.userId, planId: input.planId, planVersion: input.version,
    timezone: detail.board.timezone, destinations, excludedItemIds,
  });
  const operations = [];
  for (const operation of persisted.operations) {
    if (operation.status === "scheduled") {
      operations.push(operation);
      continue;
    }
    await markBoardScheduleOperation(db, { operationId: operation.id, status: "scheduling" });
    const item = byItem.get(operation.itemId)!;
    try {
      const limits = platformImageLimits(operation.destination);
      let mediaUrls: string[] = [];
      if (item.draftAssetIds?.length) {
        try {
          if (!input.resolveMediaUrls) throw new Error("MEDIA_REQUIRED");
          mediaUrls = (await input.resolveMediaUrls(item.draftAssetIds)).filter(url => url.startsWith("https://")).slice(0, limits.max);
        } catch {
          mediaUrls = [];
        }
        if (!mediaUrls.length || mediaUrls.length < limits.min) {
          operations.push(await markBoardScheduleOperation(db, {
            operationId: operation.id, status: "needs_attention", errorCode: "MEDIA_REQUIRED",
          }));
          continue;
        }
      } else if (limits.min > 0) {
        operations.push(await markBoardScheduleOperation(db, {
          operationId: operation.id, status: "needs_attention", errorCode: "MEDIA_REQUIRED",
        }));
        continue;
      }
      const result = await input.mcp.callTool({
        userId: input.userId,
        name: "schedule_post",
        arguments: {
          platforms: [operation.destination],
          text: item.revision.caption,
          confirm: true,
          connectedAccountId: operation.connectedAccountId,
          scheduledAt: operation.publishAt.toISOString(),
          idempotencyKey: operation.idempotencyKey,
          ...(mediaUrls.length ? { options: { mediaUrls } } : {}),
        },
      });
      const value = result.value && typeof result.value === "object" ? result.value as Record<string, unknown> : { value: result.value };
      if (value.ok === false || !mcpAccepted(value)) {
        const failed = await markBoardScheduleOperation(db, {
          operationId: operation.id, status: "needs_attention", receipt: value,
          errorCode: typeof value.code === "string" ? value.code : "MCP_TOOL_ERROR",
        });
        operations.push(failed);
        continue;
      }
      operations.push(await markBoardScheduleOperation(db, { operationId: operation.id, status: "scheduled", receipt: value }));
    } catch {
      operations.push(await markBoardScheduleOperation(db, { operationId: operation.id, status: "needs_attention", errorCode: "SOCIALMCP_UNAVAILABLE" }));
    }
  }
  return { confirmation: persisted.confirmation, operations, skippedItemIds };
}

function mcpAccepted(value: Record<string, unknown>) {
  if (value.ok === true) return true;
  const scheduled = Array.isArray(value.scheduled) ? value.scheduled : [];
  return scheduled.some(item => item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string");
}

function localTime(value: unknown) {
  if (typeof value !== "string") return undefined;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return value.slice(0, 16);
  return value;
}

export function parseBoardScheduleRows(value: unknown): BoardScheduleRow[] {
  if (!Array.isArray(value) || !value.length || value.length > 1000) throw new PlanWorkflowError("INVALID_SCHEDULE");
  return value.map(row => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new PlanWorkflowError("INVALID_SCHEDULE");
    const record = row as Record<string, unknown>;
    if (typeof record.itemId !== "string") throw new PlanWorkflowError("INVALID_SCHEDULE");
    const accounts: BoardScheduleRow["accounts"] = {};
    if (record.accounts != null) {
      if (!record.accounts || typeof record.accounts !== "object" || Array.isArray(record.accounts)) throw new PlanWorkflowError("INVALID_SCHEDULE");
      for (const [platform, accountId] of Object.entries(record.accounts as Record<string, unknown>)) {
        if (!isPlatform(platform) || typeof accountId !== "string" || !accountId.trim()) throw new PlanWorkflowError("INVALID_SCHEDULE");
        accounts[platform] = accountId.trim();
      }
    }
    return {
      itemId: record.itemId,
      excluded: record.excluded === true,
      localTime: localTime(record.localTime),
      accounts,
    };
  });
}
