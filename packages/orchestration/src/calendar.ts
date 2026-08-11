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
  canReschedule: boolean;
};

export type ScheduleDetail = CalendarSlot & {
  caption: string;
  media: string[];
  conversationId: string | null;
  draftId: string | null;
  canCancel: boolean;
  canEditContent: boolean;
};

export class CalendarError extends Error {
  constructor(
    readonly code:
      | "INVALID_RANGE"
      | "INVALID_TIMEZONE"
      | "INVALID_SORT"
      | "INVALID_STATUS"
      | "INVALID_SCHEDULE_RESPONSE"
      | "INVALID_CONTENT_UPDATE"
      | "ACCOUNT_REQUIRED"
      | "SCHEDULE_NOT_FOUND"
      | "SCHEDULE_TIME_MUST_BE_FUTURE"
      | "PUBLISHED_IMMUTABLE"
      | "MUTATION_UNSUPPORTED"
      | "SOCIALMCP_UNAVAILABLE"
      | "INVALID_REWRITE"
      | "REWRITE_UNAVAILABLE",
    readonly status: 404 | 409 | 422 | 502 | 503,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "CalendarError";
  }
}

export type CalendarToolName =
  | "get_scheduled_posts"
  | "cancel_scheduled_post"
  | "reschedule_scheduled_post"
  | "update_scheduled_post_content"
  | "schedule_post";

export type MirrorTarget = {
  platform: ConnectorPlatform;
  accountId: string;
  scheduledAt: string;
};

export type MirrorInput = {
  targets: MirrorTarget[];
  caption?: string;
  media?: string[];
};

export interface CalendarGateway {
  callTool(input: {
    userId: string;
    name: CalendarToolName;
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
        if (isUnsupportedMcpToolText(text.text)) {
          throw new CalendarError("SOCIALMCP_UNAVAILABLE", 502);
        }
        throw new CalendarError("INVALID_SCHEDULE_RESPONSE", 502);
      }
    }
  }

  throw new CalendarError("INVALID_SCHEDULE_RESPONSE", 502);
}

/**
 * Detect MCP failures that mean a calendar mutation tool is missing/unsupported.
 * Do not treat arbitrary mentions of a tool name in unrelated error text as 502.
 */
export function isUnsupportedMcpToolText(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes("unknown tool") || lower.includes("tool not found")) {
    return true;
  }
  if (!lower.includes("update_scheduled_post_content")) {
    return false;
  }
  return (
    /\b(?:unsupported|not\s+supported|unavailable|not\s+available|not\s+implemented|unknown|not\s+found)\b/.test(
      lower,
    )
  );
}

/** MCP tools often return `{ ok: false, code }` instead of throwing. */
function assertMcpToolOk(payload: unknown, fallbackCode = "INVALID_SCHEDULE_RESPONSE") {
  if (typeof payload !== "object" || payload === null) {
    throw new CalendarError("INVALID_SCHEDULE_RESPONSE", 502);
  }
  const record = payload as Record<string, unknown>;
  if (record.ok === false) {
    const code = typeof record.code === "string" ? record.code : fallbackCode;
    if (
      code === "SCHEDULE_TIME_MUST_BE_FUTURE" ||
      code === "INVALID_SCHEDULE_TIME"
    ) {
      throw new CalendarError("SCHEDULE_TIME_MUST_BE_FUTURE", 422);
    }
    if (code === "SCHEDULED_POST_NOT_FOUND") {
      throw new CalendarError("SCHEDULE_NOT_FOUND", 404);
    }
    if (
      code === "SCHEDULED_POST_NOT_RESCHEDULABLE" ||
      code === "SCHEDULED_POST_NOT_EDITABLE"
    ) {
      throw new CalendarError("MUTATION_UNSUPPORTED", 409);
    }
    if (code === "SCHEDULED_CONTENT_UPDATE_REQUIRED") {
      throw new CalendarError("INVALID_CONTENT_UPDATE", 422);
    }
    if (code === "ACCOUNT_REQUIRED" || code === "POST_CONTENT_REQUIRED") {
      throw new CalendarError(
        code === "ACCOUNT_REQUIRED" ? "ACCOUNT_REQUIRED" : "INVALID_CONTENT_UPDATE",
        422,
      );
    }
    if (code === "MCP_TOOL_ERROR" || code === "CONFIRMATION_REQUIRED") {
      throw new CalendarError("SOCIALMCP_UNAVAILABLE", 502);
    }
    throw new CalendarError("INVALID_SCHEDULE_RESPONSE", 502);
  }
}

export class StreamableHttpCalendarGateway implements CalendarGateway {
  constructor(
    private readonly url: string,
    private readonly timeoutMs: number,
  ) {}

  async callTool(input: {
    userId: string;
    name: CalendarToolName;
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
      accountIds?: string[];
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
      accountIds?: string[];
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
  updateContent(
    userId: string,
    scheduleId: string,
    input: { caption?: string; media?: string[] },
  ): Promise<ScheduleDetail>;
  mirrorToPlatforms(
    userId: string,
    sourceScheduleId: string,
    input: MirrorInput,
  ): Promise<{ created: ScheduleDetail[] }>;
  patch(
    userId: string,
    scheduleId: string,
    input: { scheduledAt?: string; caption?: string; media?: string[] },
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

export function resolveAccountIdFilter(query: {
  accountId?: string;
  accountIds?: string[];
}): Set<string> | null {
  const ids = [
    ...(Array.isArray(query.accountIds) ? query.accountIds : []),
    ...(typeof query.accountId === "string" && query.accountId
      ? [query.accountId]
      : []),
  ].filter((id) => typeof id === "string" && id.length > 0);
  if (ids.length === 0) return null;
  return new Set(ids);
}

export function isSafeMediaUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    // Local product media view proxy: HMAC-stable redirect to fresh R2 GETs.
    // Platforms cannot reach localhost; this is for local calendar UI + MCP round-trip only.
    if (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      /\/media\/assets\/[^/]+\/view$/.test(url.pathname)
    ) {
      return true;
    }
    return false;
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
  const statusBucket = mapStatusBucket(row.status);
  const mutable = statusBucket === "Scheduled" || statusBucket === "Canceled";
  return {
    scheduleId: row.id,
    platform: row.platform,
    accountId: row.connectedAccountId,
    accountLabel: labels.get(row.connectedAccountId) ?? row.connectedAccountId,
    scheduledAt: row.publishAt,
    statusBucket,
    captionPreview: caption.slice(0, 80),
    thumbUrl: media[0] ?? null,
    canReschedule: mutable,
  };
}

function toDetail(row: RawSchedule, labels: Map<string, string>): ScheduleDetail {
  const slot = toSlot(row, labels);
  const caption = row.contentText ?? row.captionPreview ?? "";
  const editable = slot.canReschedule;
  return {
    ...slot,
    caption,
    media: mediaList(row.mediaUrls),
    conversationId: null,
    draftId: null,
    canCancel: slot.statusBucket === "Scheduled",
    canEditContent: editable,
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
          avatarHint:
            account.avatarUrl && isSafeMediaUrl(account.avatarUrl)
              ? account.avatarUrl
              : null,
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
      accountIds?: string[];
      platform?: string;
    },
  ): Promise<{ slots: CalendarSlot[]; timeZone: string }> {
    assertRange(query.from, query.to, query.timeZone, MAX_WEEK_RANGE_MS);
    if (query.platform && !isPlatform(query.platform)) {
      throw new CalendarError("INVALID_RANGE", 422);
    }

    const fromMs = Date.parse(query.from);
    const toMs = Date.parse(query.to);
    const accountFilter = resolveAccountIdFilter(query);
    const [rows, labels] = await Promise.all([
      this.loadRaw(userId, query.platform),
      this.labelMap(userId),
    ]);

    const slots = rows
      .filter((row) => {
        const at = Date.parse(row.publishAt);
        if (!Number.isFinite(at) || at < fromMs || at > toMs) return false;
        if (accountFilter && !accountFilter.has(row.connectedAccountId)) {
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
      accountIds?: string[];
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
    const accountFilter = resolveAccountIdFilter(query);

    const [rows, labels] = await Promise.all([
      this.loadRaw(userId, query.platform),
      this.labelMap(userId),
    ]);

    const matched = rows
      .filter((row) => {
        if (accountFilter && !accountFilter.has(row.connectedAccountId)) {
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
    userId: string,
    scheduleId: string,
    scheduledAt: string,
  ): Promise<ScheduleDetail> {
    const detail = await this.getSlot(userId, scheduleId);
    if (detail.statusBucket === "Done") {
      throw new CalendarError("PUBLISHED_IMMUTABLE", 409);
    }
    if (!detail.canReschedule) {
      throw new CalendarError("MUTATION_UNSUPPORTED", 409);
    }
    if (Number.isNaN(Date.parse(scheduledAt))) {
      throw new CalendarError("INVALID_RANGE", 422);
    }
    if (Date.parse(scheduledAt) <= Date.now()) {
      throw new CalendarError("SCHEDULE_TIME_MUST_BE_FUTURE", 422);
    }

    try {
      const payload = await this.gateway.callTool({
        userId,
        name: "reschedule_scheduled_post",
        arguments: {
          scheduledPostId: scheduleId,
          publishAt: scheduledAt,
          confirm: true,
        },
      });
      assertMcpToolOk(payload);
    } catch (error) {
      if (error instanceof CalendarError) throw error;
      throw new CalendarError("SOCIALMCP_UNAVAILABLE", 502);
    }

    return this.getSlot(userId, scheduleId);
  }

  async updateContent(
    userId: string,
    scheduleId: string,
    input: { caption?: string; media?: string[] },
  ): Promise<ScheduleDetail> {
    const hasCaption = typeof input.caption === "string";
    const caption = hasCaption ? input.caption!.trim() : undefined;
    if (hasCaption && !caption) {
      throw new CalendarError("INVALID_CONTENT_UPDATE", 422);
    }
    const hasMedia = Array.isArray(input.media);
    if (!hasCaption && !hasMedia) {
      throw new CalendarError("INVALID_CONTENT_UPDATE", 422);
    }
    if (hasMedia) {
      const unsafe = input.media!.some((url) => !isSafeMediaUrl(url));
      if (unsafe) {
        throw new CalendarError("INVALID_CONTENT_UPDATE", 422);
      }
    }

    const detail = await this.getSlot(userId, scheduleId);
    if (detail.statusBucket === "Done") {
      throw new CalendarError("PUBLISHED_IMMUTABLE", 409);
    }
    if (!detail.canEditContent) {
      throw new CalendarError("MUTATION_UNSUPPORTED", 409);
    }

    const argumentsPayload: Record<string, unknown> = {
      scheduledPostId: scheduleId,
      confirm: true,
    };
    if (hasCaption) argumentsPayload.text = caption;
    if (hasMedia) argumentsPayload.mediaUrls = input.media;

    try {
      const payload = await this.gateway.callTool({
        userId,
        name: "update_scheduled_post_content",
        arguments: argumentsPayload,
      });
      assertMcpToolOk(payload);
    } catch (error) {
      if (error instanceof CalendarError) throw error;
      throw new CalendarError("SOCIALMCP_UNAVAILABLE", 502);
    }

    return this.getSlot(userId, scheduleId);
  }

  async mirrorToPlatforms(
    userId: string,
    sourceScheduleId: string,
    input: MirrorInput,
  ): Promise<{ created: ScheduleDetail[] }> {
    if (!Array.isArray(input.targets) || input.targets.length === 0) {
      throw new CalendarError("INVALID_CONTENT_UPDATE", 422);
    }

    const source = await this.getSlot(userId, sourceScheduleId);
    if (source.statusBucket === "Done") {
      throw new CalendarError("PUBLISHED_IMMUTABLE", 409);
    }
    if (source.statusBucket !== "Scheduled") {
      throw new CalendarError("MUTATION_UNSUPPORTED", 409);
    }

    const caption =
      typeof input.caption === "string" ? input.caption.trim() : source.caption;
    const media = Array.isArray(input.media)
      ? input.media.filter((url) => isSafeMediaUrl(url))
      : source.media;
    if (Array.isArray(input.media) && input.media.some((url) => !isSafeMediaUrl(url))) {
      throw new CalendarError("INVALID_CONTENT_UPDATE", 422);
    }
    if (typeof input.caption === "string" && !caption) {
      throw new CalendarError("INVALID_CONTENT_UPDATE", 422);
    }
    if (!caption.trim() && media.length === 0) {
      throw new CalendarError("INVALID_CONTENT_UPDATE", 422);
    }

    const accounts = await this.listAccounts(userId);
    const accountById = new Map(
      accounts.accounts.map((account) => [account.id, account]),
    );
    const seenAccountIds = new Set<string>();
    const createdIds: string[] = [];

    const rollbackCreated = async () => {
      for (const id of createdIds) {
        try {
          await this.cancel(userId, id);
        } catch {
          // Best-effort rollback; surface remaining ids on the thrown error.
        }
      }
    };

    for (const target of input.targets) {
      if (!isPlatform(target.platform)) {
        await rollbackCreated();
        throw new CalendarError("INVALID_CONTENT_UPDATE", 422, {
          rolledBackIds: [...createdIds],
        });
      }
      if (target.accountId === source.accountId) {
        await rollbackCreated();
        throw new CalendarError("INVALID_CONTENT_UPDATE", 422, {
          rolledBackIds: [...createdIds],
        });
      }
      if (seenAccountIds.has(target.accountId)) {
        await rollbackCreated();
        throw new CalendarError("INVALID_CONTENT_UPDATE", 422, {
          rolledBackIds: [...createdIds],
        });
      }
      seenAccountIds.add(target.accountId);

      if (Number.isNaN(Date.parse(target.scheduledAt))) {
        await rollbackCreated();
        throw new CalendarError("INVALID_RANGE", 422, {
          rolledBackIds: [...createdIds],
        });
      }
      if (Date.parse(target.scheduledAt) <= Date.now()) {
        await rollbackCreated();
        throw new CalendarError("SCHEDULE_TIME_MUST_BE_FUTURE", 422, {
          rolledBackIds: [...createdIds],
        });
      }

      const account = accountById.get(target.accountId);
      if (!account || account.platform !== target.platform) {
        await rollbackCreated();
        throw new CalendarError("ACCOUNT_REQUIRED", 422, {
          rolledBackIds: [...createdIds],
        });
      }

      if (target.platform === "instagram" && media.length === 0) {
        await rollbackCreated();
        throw new CalendarError("INVALID_CONTENT_UPDATE", 422, {
          rolledBackIds: [...createdIds],
        });
      }

      const argumentsPayload: Record<string, unknown> = {
        platforms: [target.platform],
        text: caption,
        connectedAccountId: target.accountId,
        scheduledAt: target.scheduledAt,
        confirm: true,
      };
      if (media.length > 0) {
        argumentsPayload.options = { mediaUrls: media };
      }

      try {
        const payload = await this.gateway.callTool({
          userId,
          name: "schedule_post",
          arguments: argumentsPayload,
        });
        assertMcpToolOk(payload);
        const root = asRecord(payload);
        const scheduled = Array.isArray(root?.scheduled) ? root.scheduled : [];
        for (const item of scheduled) {
          const row = asRecord(item);
          if (row && typeof row.id === "string") createdIds.push(row.id);
        }
      } catch (error) {
        await rollbackCreated();
        const details =
          createdIds.length > 0
            ? {
                rolledBackIds: [...createdIds],
                partialFailure: true,
              }
            : undefined;
        if (error instanceof CalendarError) {
          throw new CalendarError(error.code, error.status, {
            ...error.details,
            ...details,
          });
        }
        throw new CalendarError("SOCIALMCP_UNAVAILABLE", 502, details);
      }
    }

    const [rows, labels] = await Promise.all([
      this.loadRaw(userId),
      this.labelMap(userId),
    ]);
    const created = createdIds
      .map((id) => {
        const row = rows.find((item) => item.id === id);
        return row ? toDetail(row, labels) : null;
      })
      .filter((item): item is ScheduleDetail => item !== null);

    return { created };
  }

  async patch(
    userId: string,
    scheduleId: string,
    input: { scheduledAt?: string; caption?: string; media?: string[] },
  ): Promise<ScheduleDetail> {
    const hasTime = typeof input.scheduledAt === "string" && input.scheduledAt.trim();
    const hasCaption = typeof input.caption === "string";
    const hasMedia = Array.isArray(input.media);
    if (!hasTime && !hasCaption && !hasMedia) {
      throw new CalendarError("INVALID_CONTENT_UPDATE", 422);
    }

    if (hasCaption || hasMedia) {
      await this.updateContent(userId, scheduleId, {
        ...(hasCaption ? { caption: input.caption } : {}),
        ...(hasMedia ? { media: input.media } : {}),
      });
    }
    if (hasTime) {
      return this.reschedule(userId, scheduleId, input.scheduledAt!);
    }
    return this.getSlot(userId, scheduleId);
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
      const payload = await this.gateway.callTool({
        userId,
        name: "cancel_scheduled_post",
        arguments: { scheduledPostId: scheduleId, confirm: true },
      });
      assertMcpToolOk(payload);
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
