import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mintMcpJwt } from "@sochestral/auth";

import {
  CONNECTOR_PLATFORMS,
  createConnectorService,
  type ConnectorPlatform,
  type ConnectorService,
  type PublicConnectorAccount,
} from "./connectors.js";

export type CalendarStatusBucket =
  | "Scheduled"
  | "Done"
  | "Failed"
  | "Canceled";

export type CalendarAccount = {
  id: string;
  platform: ConnectorPlatform;
  label: string;
  username: string | null;
  avatarHint: string | null;
};

export type CalendarSlot = {
  scheduleId: string;
  platform: ConnectorPlatform;
  accountId: string;
  accountLabel: string;
  scheduledAt: string;
  statusBucket: CalendarStatusBucket;
  captionPreview: string;
  thumbUrl: string | null;
};

export type ScheduleDetail = CalendarSlot & {
  caption: string;
  media: string[];
  conversationId: string | null;
  draftId: string | null;
  canReschedule: boolean;
  canCancel: boolean;
};

export class CalendarError extends Error {
  constructor(
    readonly code:
      | "INVALID_RANGE"
      | "INVALID_TIMEZONE"
      | "INVALID_SORT"
      | "INVALID_STATUS"
      | "INVALID_SCHEDULE_RESPONSE"
      | "SCHEDULE_NOT_FOUND"
      | "PUBLISHED_IMMUTABLE"
      | "MUTATION_UNSUPPORTED"
      | "SOCIALMCP_UNAVAILABLE",
    readonly status: 404 | 409 | 422 | 502,
  ) {
    super(code);
    this.name = "CalendarError";
  }
}

export interface CalendarGateway {
  callTool(input: {
    userId: string;
    name: "get_scheduled_posts" | "cancel_scheduled_post";
    arguments: Record<string, unknown>;
  }): Promise<unknown>;
}

function parseToolResult(result: unknown): unknown {
  if (
    typeof result === "object" &&
    result !== null &&
    "content" in result &&
    Array.isArray(result.content)
  ) {
    const text = result.content.find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "type" in item &&
        item.type === "text" &&
        "text" in item &&
        typeof item.text === "string",
    ) as { text: string } | undefined;

    if (text) {
      try {
        return JSON.parse(text.text);
      } catch {
        throw new CalendarError("INVALID_SCHEDULE_RESPONSE", 502);
      }
    }
  }

  throw new CalendarError("INVALID_SCHEDULE_RESPONSE", 502);
}

export class StreamableHttpCalendarGateway implements CalendarGateway {
  constructor(
    private readonly url: string,
    private readonly timeoutMs: number,
  ) {}

  async callTool(input: {
    userId: string;
    name: "get_scheduled_posts" | "cancel_scheduled_post";
    arguments: Record<string, unknown>;
  }): Promise<unknown> {
    const { token } = await mintMcpJwt(input.userId);
    const client = new Client({
      name: "sochestral-calendar",
      version: "0.0.1",
    });
    const transport = new StreamableHTTPClientTransport(new URL(this.url), {
      requestInit: {
        headers: { Authorization: `Bearer ${token}` },
      },
      fetch: (url, init) =>
        fetch(url, {
          ...init,
          signal: AbortSignal.timeout(this.timeoutMs),
        }),
    });

    try {
      await client.connect(transport);
      const result = await client.callTool({
        name: input.name,
        arguments: input.arguments,
      });
      return parseToolResult(result);
    } catch (error) {
      if (error instanceof CalendarError) throw error;
      throw new CalendarError("SOCIALMCP_UNAVAILABLE", 502);
    } finally {
      await client.close().catch(() => undefined);
    }
  }
}

export interface CalendarService {
  listAccounts(userId: string): Promise<{ accounts: CalendarAccount[] }>;
  listSlots(
    userId: string,
    query: {
      from: string;
      to: string;
      timeZone: string;
      accountId?: string;
      platform?: string;
    },
  ): Promise<{ slots: CalendarSlot[]; timeZone: string }>;
  listPosts(
    userId: string,
    query: {
      from: string;
      to: string;
      timeZone: string;
      accountId?: string;
      platform?: string;
      status?: string;
      sort?: string;
    },
  ): Promise<{
    posts: CalendarSlot[];
    timeZone: string;
    from: string;
    to: string;
    sort: "scheduledAt:asc" | "scheduledAt:desc";
    hasOlder: boolean;
    hasNewer: boolean;
  }>;
  getSlot(userId: string, scheduleId: string): Promise<ScheduleDetail>;
  reschedule(
    userId: string,
    scheduleId: string,
    scheduledAt: string,
  ): Promise<ScheduleDetail>;
  cancel(userId: string, scheduleId: string): Promise<{ ok: true; scheduleId: string }>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isPlatform(value: string): value is ConnectorPlatform {
  return CONNECTOR_PLATFORMS.some((platform) => platform === value);
}

const MAX_WEEK_RANGE_MS = 8 * 24 * 60 * 60 * 1000;
const MAX_LIST_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

export const STATUS_BUCKETS = [
  "Scheduled",
  "Done",
  "Failed",
  "Canceled",
] as const;

export type ScheduledPostsSort = "scheduledAt:asc" | "scheduledAt:desc";

export function mapStatusBucket(raw: string | null | undefined): CalendarStatusBucket {
  const value = (raw ?? "").toLowerCase();
  if (value === "published") return "Done";
  if (value === "failed") return "Failed";
  if (value === "cancelled" || value === "canceled") return "Canceled";
  return "Scheduled";
}

export function isSafeMediaUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function assertRange(
  from: string,
  to: string,
  timeZone: string,
  maxMs: number,
) {
  if (!timeZone.trim()) {
    throw new CalendarError("INVALID_TIMEZONE", 422);
  }
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    throw new CalendarError("INVALID_RANGE", 422);
  }
  if (toMs - fromMs > maxMs) {
    throw new CalendarError("INVALID_RANGE", 422);
  }
}

function parseSort(raw: string | undefined): ScheduledPostsSort {
  if (!raw || raw === "scheduledAt:asc") return "scheduledAt:asc";
  if (raw === "scheduledAt:desc") return "scheduledAt:desc";
  throw new CalendarError("INVALID_SORT", 422);
}

function parseStatus(raw: string | undefined): CalendarStatusBucket | undefined {
  if (!raw) return undefined;
  if ((STATUS_BUCKETS as readonly string[]).includes(raw)) {
    return raw as CalendarStatusBucket;
  }
  throw new CalendarError("INVALID_STATUS", 422);
}

function compareSlots(
  a: CalendarSlot,
  b: CalendarSlot,
  sort: ScheduledPostsSort,
): number {
  const byTime =
    sort === "scheduledAt:asc"
      ? a.scheduledAt.localeCompare(b.scheduledAt)
      : b.scheduledAt.localeCompare(a.scheduledAt);
  if (byTime !== 0) return byTime;
  return a.scheduleId.localeCompare(b.scheduleId);
}

function accountLabel(account: PublicConnectorAccount): string {
  return account.displayName?.trim() || account.username?.trim() || account.id;
}

type RawSchedule = {
  id: string;
  platform: ConnectorPlatform;
  connectedAccountId: string;
  publishAt: string;
  status: string;
  captionPreview?: string | null;
  contentText?: string | null;
  mediaUrls?: unknown;
};

function readSchedules(payload: unknown): RawSchedule[] {
  const root = asRecord(payload);
  if (!root || !Array.isArray(root.scheduled)) {
    throw new CalendarError("INVALID_SCHEDULE_RESPONSE", 502);
  }

  const rows: RawSchedule[] = [];
  for (const item of root.scheduled) {
    const row = asRecord(item);
    const platform = row?.platform;
    if (
      !row ||
      typeof row.id !== "string" ||
      typeof platform !== "string" ||
      !isPlatform(platform) ||
      typeof row.connectedAccountId !== "string" ||
      typeof row.publishAt !== "string"
    ) {
      continue;
    }
    rows.push({
      id: row.id,
      platform,
      connectedAccountId: row.connectedAccountId,
      publishAt: row.publishAt,
      status: typeof row.status === "string" ? row.status : "scheduled",
      captionPreview: nullableString(row.captionPreview ?? row.contentText),
      contentText: nullableString(row.contentText ?? row.captionPreview),
      mediaUrls: row.mediaUrls ?? row.media,
    });
  }
  return rows;
}

function mediaList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item : nullableString(asRecord(item)?.url)))
    .filter((url): url is string => isSafeMediaUrl(url));
}

function toSlot(
  row: RawSchedule,
  labels: Map<string, string>,
): CalendarSlot {
  const caption = row.contentText ?? row.captionPreview ?? "";
  const media = mediaList(row.mediaUrls);
  return {
    scheduleId: row.id,
    platform: row.platform,
    accountId: row.connectedAccountId,
    accountLabel: labels.get(row.connectedAccountId) ?? row.connectedAccountId,
    scheduledAt: row.publishAt,
    statusBucket: mapStatusBucket(row.status),
    captionPreview: caption.slice(0, 80),
    thumbUrl: media[0] ?? null,
  };
}

function toDetail(row: RawSchedule, labels: Map<string, string>): ScheduleDetail {
  const slot = toSlot(row, labels);
  const caption = row.contentText ?? row.captionPreview ?? "";
  return {
    ...slot,
    caption,
    media: mediaList(row.mediaUrls),
    conversationId: null,
    draftId: null,
    canReschedule: false,
    canCancel: mapStatusBucket(row.status) === "Scheduled",
  };
}

export class DefaultCalendarService implements CalendarService {
  constructor(
    private readonly gateway: CalendarGateway,
    private readonly connectors: ConnectorService,
  ) {}

  async listAccounts(userId: string): Promise<{ accounts: CalendarAccount[] }> {
    const { connectors } = await this.connectors.list(userId);
    const accounts: CalendarAccount[] = [];
    for (const connector of connectors) {
      for (const account of connector.accounts) {
        accounts.push({
          id: account.id,
          platform: connector.platform,
          label: accountLabel(account),
          username: account.username,
          avatarHint: null,
        });
      }
    }
    return { accounts };
  }

  private async labelMap(userId: string): Promise<Map<string, string>> {
    const { accounts } = await this.listAccounts(userId);
    return new Map(accounts.map((account) => [account.id, account.label]));
  }

  private async loadRaw(userId: string, platform?: string): Promise<RawSchedule[]> {
    const args: Record<string, unknown> = {};
    if (platform && isPlatform(platform)) args.platform = platform;
    const payload = await this.gateway.callTool({
      userId,
      name: "get_scheduled_posts",
      arguments: args,
    });
    return readSchedules(payload);
  }

  async listSlots(
    userId: string,
    query: {
      from: string;
      to: string;
      timeZone: string;
      accountId?: string;
      platform?: string;
    },
  ): Promise<{ slots: CalendarSlot[]; timeZone: string }> {
    assertRange(query.from, query.to, query.timeZone, MAX_WEEK_RANGE_MS);
    if (query.platform && !isPlatform(query.platform)) {
      throw new CalendarError("INVALID_RANGE", 422);
    }

    const fromMs = Date.parse(query.from);
    const toMs = Date.parse(query.to);
    const [rows, labels] = await Promise.all([
      this.loadRaw(userId, query.platform),
      this.labelMap(userId),
    ]);

    const slots = rows
      .filter((row) => {
        const at = Date.parse(row.publishAt);
        if (!Number.isFinite(at) || at < fromMs || at > toMs) return false;
        if (query.accountId && row.connectedAccountId !== query.accountId) {
          return false;
        }
        return true;
      })
      .map((row) => toSlot(row, labels))
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

    return { slots, timeZone: query.timeZone };
  }

  async listPosts(
    userId: string,
    query: {
      from: string;
      to: string;
      timeZone: string;
      accountId?: string;
      platform?: string;
      status?: string;
      sort?: string;
    },
  ): Promise<{
    posts: CalendarSlot[];
    timeZone: string;
    from: string;
    to: string;
    sort: ScheduledPostsSort;
    hasOlder: boolean;
    hasNewer: boolean;
  }> {
    assertRange(query.from, query.to, query.timeZone, MAX_LIST_RANGE_MS);
    if (query.platform && !isPlatform(query.platform)) {
      throw new CalendarError("INVALID_RANGE", 422);
    }
    const sort = parseSort(query.sort);
    const status = parseStatus(query.status);
    const fromMs = Date.parse(query.from);
    const toMs = Date.parse(query.to);

    const [rows, labels] = await Promise.all([
      this.loadRaw(userId, query.platform),
      this.labelMap(userId),
    ]);

    const matched = rows
      .filter((row) => {
        if (query.accountId && row.connectedAccountId !== query.accountId) {
          return false;
        }
        if (status && mapStatusBucket(row.status) !== status) return false;
        return Number.isFinite(Date.parse(row.publishAt));
      })
      .map((row) => toSlot(row, labels));

    const hasOlder = matched.some(
      (slot) => Date.parse(slot.scheduledAt) < fromMs,
    );
    const hasNewer = matched.some(
      (slot) => Date.parse(slot.scheduledAt) > toMs,
    );

    const posts = matched
      .filter((slot) => {
        const at = Date.parse(slot.scheduledAt);
        return at >= fromMs && at <= toMs;
      })
      .sort((a, b) => compareSlots(a, b, sort));

    return {
      posts,
      timeZone: query.timeZone,
      from: query.from,
      to: query.to,
      sort,
      hasOlder,
      hasNewer,
    };
  }

  async getSlot(userId: string, scheduleId: string): Promise<ScheduleDetail> {
    const [rows, labels] = await Promise.all([
      this.loadRaw(userId),
      this.labelMap(userId),
    ]);
    const row = rows.find((item) => item.id === scheduleId);
    if (!row) throw new CalendarError("SCHEDULE_NOT_FOUND", 404);
    return toDetail(row, labels);
  }

  async reschedule(
    _userId: string,
    _scheduleId: string,
    _scheduledAt: string,
  ): Promise<ScheduleDetail> {
    throw new CalendarError("MUTATION_UNSUPPORTED", 409);
  }

  async cancel(
    userId: string,
    scheduleId: string,
  ): Promise<{ ok: true; scheduleId: string }> {
    const detail = await this.getSlot(userId, scheduleId);
    if (detail.statusBucket === "Done") {
      throw new CalendarError("PUBLISHED_IMMUTABLE", 409);
    }
    if (detail.statusBucket === "Canceled") {
      return { ok: true, scheduleId };
    }
    if (!detail.canCancel) {
      throw new CalendarError("MUTATION_UNSUPPORTED", 409);
    }

    try {
      await this.gateway.callTool({
        userId,
        name: "cancel_scheduled_post",
        arguments: { scheduledPostId: scheduleId, confirm: true },
      });
    } catch (error) {
      if (error instanceof CalendarError) throw error;
      throw new CalendarError("SOCIALMCP_UNAVAILABLE", 502);
    }

    return { ok: true, scheduleId };
  }
}

export function createCalendarService(
  connectors?: ConnectorService,
  gateway?: CalendarGateway,
): CalendarService {
  const url = process.env.SOCIALMCP_MCP_URL?.trim();
  if (!url && !gateway) {
    throw new Error("SOCIALMCP_MCP_URL is required");
  }
  const timeout = Number(process.env.ORCHESTRATION_EXTERNAL_TIMEOUT_MS ?? "15000");
  return new DefaultCalendarService(
    gateway ??
      new StreamableHttpCalendarGateway(
        url!,
        Number.isFinite(timeout) && timeout > 0 ? timeout : 15000,
      ),
    connectors ?? createConnectorService(),
  );
}
