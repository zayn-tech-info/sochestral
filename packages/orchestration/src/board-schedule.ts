import {
  getPlan, persistBoardSchedule, markBoardScheduleOperation, PlanWorkflowError, type Database,
} from "@sochestral/database";
import type { ConnectorService } from "./connectors.js";
import type { SocialMcpGateway } from "./mcp.js";
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
  const blocked = [...byItem.values()].filter(item => !excludedItemIds.includes(item.id) && item.status !== "ready");
  if (blocked.length) throw new PlanWorkflowError("SCHEDULE_NOT_READY", { itemIds: blocked.map(item => item.id) });
  const now = input.now ?? new Date();
  const destinations: Parameters<typeof persistBoardSchedule>[1]["destinations"] = [];
  for (const item of byItem.values()) {
    if (excludedItemIds.includes(item.id)) continue;
    const row = byRow.get(item.id);
    if (!row?.localTime) throw new PlanWorkflowError("INVALID_SCHEDULE", { itemIds: [item.id] });
    let publishAt: string;
    try {
      publishAt = resolveScheduleTime(row.localTime, detail.board.timezone);
    } catch (error) {
      throw new PlanWorkflowError("INVALID_SCHEDULE", { itemIds: [item.id], reason: error instanceof Error ? error.message : "INVALID_LOCAL_TIME" });
    }
    if (Date.parse(publishAt) <= now.getTime()) throw new PlanWorkflowError("INVALID_SCHEDULE", { itemIds: [item.id], reason: "PAST_TIME" });
    for (const destination of item.revision.destinations) {
      const accountId = row.accounts?.[destination];
      const account = accountId ? owned.get(accountId) : undefined;
      if (!accountId || !account || account.platform !== destination || !account.connected) {
        throw new PlanWorkflowError("ACCOUNT_REQUIRED", { itemIds: [item.id], destination });
      }
      destinations.push({
        itemId: item.id, revisionId: item.revision.id, destination, connectedAccountId: accountId,
        localTime: row.localTime, publishAt: new Date(publishAt), timezone: detail.board.timezone,
      });
    }
  }
  if (!destinations.length) throw new PlanWorkflowError("SCHEDULE_NOT_READY", { itemIds: [] });
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
  return { confirmation: persisted.confirmation, operations };
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
