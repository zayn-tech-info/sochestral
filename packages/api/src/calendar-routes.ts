import type { Context, Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import {
  SESSION_COOKIE_NAME,
  validateSessionToken,
} from "@sochestral/auth";
import type { Database } from "@sochestral/database";
import {
  CalendarError,
  composeScheduleCaptions,
  rewriteScheduleSelection,
  type CalendarService,
  type ComposeAssistTarget,
  type CreateScheduleInput,
  type ScheduleRewriteAction,
} from "@sochestral/orchestration";
import { getCompiledProfile } from "@sochestral/database";
import type { Env } from "./app.js";

type ServiceFactory = () => CalendarService;

function safeErrorMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const message = value.trim();
  if (!message || message.length > 240) return undefined;
  if (/https?:\/\/\S+/i.test(message)) return undefined;
  if (/(token|secret|password|authorization|cookie|stack|trace)/i.test(message)) {
    return undefined;
  }
  return message;
}

function safeCalendarDetails(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const safe: Record<string, unknown> = {};
  const message = safeErrorMessage(details.message);
  if (message) safe.message = message;
  for (const key of ["platform", "mediaMin", "mediaMax", "mediaCount"]) {
    const value = details[key];
    if (typeof value === "string" || typeof value === "number") {
      safe[key] = value;
    }
  }
  if (typeof details.partialFailure === "boolean") {
    safe.partialFailure = details.partialFailure;
  }
  if (
    Array.isArray(details.rolledBackIds) &&
    details.rolledBackIds.every((item) => typeof item === "string")
  ) {
    safe.rolledBackIds = details.rolledBackIds;
  }
  return Object.keys(safe).length > 0 ? safe : undefined;
}

function calendarError(error: unknown) {
  if (error instanceof CalendarError) {
    const details = safeCalendarDetails(error.details);
    const message = safeErrorMessage(details?.message);
    return {
      body: {
        error: error.code,
        ...(message ? { message } : {}),
        ...(details ? { details } : {}),
      },
      status: error.status,
    } as const;
  }
  console.error("[sochestral:calendar] request failed", {
    error: "INTERNAL_ERROR",
  });
  return {
    body: { error: "INTERNAL_ERROR" },
    status: 500,
  } as const;
}

const REWRITE_ACTIONS: ScheduleRewriteAction[] = [
  "regenerate",
  "tweak",
  "comment",
];

function parseAccountIds(c: Context): string[] | undefined {
  const multi = c.req.query("accountIds") ?? "";
  const single = c.req.query("accountId") ?? "";
  const ids = [
    ...multi.split(",").map((part) => part.trim()),
    single.trim(),
  ].filter((id) => id.length > 0);
  if (ids.length === 0) return undefined;
  return Array.from(new Set(ids));
}

/** Trimmed caption, undefined when omitted, null when empty/whitespace. */
function parseCaption(value: unknown): string | undefined | null {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const MAX_CALENDAR_TARGETS = 10;
const MAX_CALENDAR_MEDIA = 10;
const MAX_CAPTION_CHARS = 5_000;
const MAX_MEDIA_URL_CHARS = 2_048;
const MAX_ID_CHARS = 128;
const MAX_PLATFORM_CHARS = 32;
const MAX_ISO_CHARS = 64;

type MediaParseResult =
  | { ok: true; present: boolean; media?: string[] }
  | { ok: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown> | null, key: string): boolean {
  return !!record && Object.prototype.hasOwnProperty.call(record, key);
}

function validSizedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function parseMediaField(
  record: Record<string, unknown> | null,
  key = "media",
): MediaParseResult {
  if (!hasOwn(record, key)) return { ok: true, present: false };
  const value = record?.[key];
  if (!Array.isArray(value) || value.length > MAX_CALENDAR_MEDIA) {
    return { ok: false };
  }
  const media: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item || item.length > MAX_MEDIA_URL_CHARS) {
      return { ok: false };
    }
    media.push(item);
  }
  return { ok: true, present: true, media };
}

export function registerCalendarRoutes(
  app: Hono<Env>,
  db: Database["db"],
  getService: ServiceFactory,
): void {
  async function sessionUser(c: Context<Env>) {
    const raw = getCookie(c, SESSION_COOKIE_NAME);
    const session = await validateSessionToken(db, raw);
    if (!session && raw) {
      deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
    }
    return session?.user ?? null;
  }

  app.get("/calendar/accounts", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    try {
      return c.json(await getService().listAccounts(user.id));
    } catch (error) {
      const mapped = calendarError(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.get("/calendar/slots", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const from = c.req.query("from") ?? "";
    const to = c.req.query("to") ?? "";
    const timeZone = c.req.query("timeZone") ?? "";
    const accountIds = parseAccountIds(c);
    const platform = c.req.query("platform") ?? undefined;

    try {
      return c.json(
        await getService().listSlots(user.id, {
          from,
          to,
          timeZone,
          accountIds,
          platform,
        }),
      );
    } catch (error) {
      const mapped = calendarError(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.get("/scheduled/posts", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    try {
      return c.json(
        await getService().listPosts(user.id, {
          from: c.req.query("from") ?? "",
          to: c.req.query("to") ?? "",
          timeZone: c.req.query("timeZone") ?? "",
          accountIds: parseAccountIds(c),
          platform: c.req.query("platform") ?? undefined,
          status: c.req.query("status") ?? undefined,
          sort: c.req.query("sort") ?? undefined,
        }),
      );
    } catch (error) {
      const mapped = calendarError(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/calendar/slots", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const body = await c.req.json().catch(() => null);
    const record = isRecord(body) ? body : null;
    const mediaResult = parseMediaField(record);
    if (!mediaResult.ok) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }

    if (hasOwn(record, "targets") && !Array.isArray(record?.targets)) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }
    const targetsRaw = Array.isArray(record?.targets) ? record.targets : null;
    if (targetsRaw && targetsRaw.length > MAX_CALENDAR_TARGETS) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }
    let targets: CreateScheduleInput[] = [];

    if (targetsRaw) {
      for (const row of targetsRaw) {
        const rowRecord = isRecord(row) ? row : null;
        const platform = validSizedString(rowRecord?.platform, MAX_PLATFORM_CHARS)
          ? (rowRecord.platform as CreateScheduleInput["platform"])
          : "";
        const accountId = validSizedString(rowRecord?.accountId, MAX_ID_CHARS)
          ? rowRecord.accountId
          : "";
        const scheduledAt = validSizedString(rowRecord?.scheduledAt, MAX_ISO_CHARS)
          ? rowRecord.scheduledAt
          : "";
        const caption = parseCaption(rowRecord?.caption);
        if (
          !platform ||
          !accountId ||
          !scheduledAt ||
          !caption ||
          caption.length > MAX_CAPTION_CHARS
        ) {
          return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
        }
        const targetMedia = parseMediaField(rowRecord);
        if (!targetMedia.ok) {
          return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
        }
        targets.push({
          platform,
          accountId,
          scheduledAt,
          caption,
          ...(targetMedia.present ? { media: targetMedia.media } : {}),
        });
      }
    } else {
      const platform = validSizedString(record?.platform, MAX_PLATFORM_CHARS)
        ? (record.platform as CreateScheduleInput["platform"])
        : "";
      const accountId = validSizedString(record?.accountId, MAX_ID_CHARS)
        ? record.accountId
        : "";
      const scheduledAt = validSizedString(record?.scheduledAt, MAX_ISO_CHARS)
        ? record.scheduledAt
        : "";
      const caption = parseCaption(record?.caption);
      if (
        !platform ||
        !accountId ||
        !scheduledAt ||
        !caption ||
        caption.length > MAX_CAPTION_CHARS
      ) {
        return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
      }
      targets = [
        {
          platform,
          accountId,
          scheduledAt,
          caption,
          ...(mediaResult.present ? { media: mediaResult.media } : {}),
        },
      ];
    }

    if (targets.length === 0) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }

    try {
      return c.json(
        await getService().createSchedules(user.id, {
          targets,
          ...(mediaResult.present ? { media: mediaResult.media } : {}),
        }),
      );
    } catch (error) {
      const mapped = calendarError(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/calendar/rewrite-selection", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const body = await c.req.json().catch(() => null);
    const selection = typeof body?.selection === "string" ? body.selection : "";
    const instruction =
      typeof body?.instruction === "string" ? body.instruction : "";
    const actionRaw = typeof body?.action === "string" ? body.action : "";
    const action = REWRITE_ACTIONS.includes(actionRaw as ScheduleRewriteAction)
      ? (actionRaw as ScheduleRewriteAction)
      : null;

    try {
      if (!action) {
        throw new CalendarError("INVALID_REWRITE", 422);
      }
      return c.json(
        await rewriteScheduleSelection({
          selection,
          action,
          ...(instruction ? { instruction } : {}),
        }),
      );
    } catch (error) {
      const mapped = calendarError(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/calendar/compose-assist", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const body = await c.req.json().catch(() => null);
    const message =
      typeof body?.message === "string" ? body.message : undefined;
    const focusAccountId =
      typeof body?.focusAccountId === "string" ? body.focusAccountId : null;
    const targetsRaw = Array.isArray(body?.targets) ? body.targets : [];
    const targets: ComposeAssistTarget[] = [];
    for (const row of targetsRaw) {
      const accountId =
        typeof row?.accountId === "string" ? row.accountId.trim() : "";
      const platform = typeof row?.platform === "string" ? row.platform : "";
      if (
        !accountId ||
        (platform !== "threads" &&
          platform !== "linkedin_personal" &&
          platform !== "instagram")
      ) {
        return c.json({ error: "INVALID_REWRITE" }, 422);
      }
      const caption =
        typeof row?.caption === "string" ? row.caption : undefined;
      targets.push({ accountId, platform, caption });
    }
    if (targets.length === 0) {
      return c.json({ error: "INVALID_REWRITE" }, 422);
    }

    try {
      const compiled = await getCompiledProfile(db, user.id);
      return c.json(
        await composeScheduleCaptions({
          message,
          targets,
          focusAccountId,
          profileContext: compiled.compiledNote,
        }),
      );
    } catch (error) {
      const mapped = calendarError(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.get("/calendar/slots/:scheduleId", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    try {
      return c.json(await getService().getSlot(user.id, c.req.param("scheduleId")));
    } catch (error) {
      const mapped = calendarError(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.patch("/calendar/slots/:scheduleId", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const body = await c.req.json().catch(() => null);
    const scheduledAt =
      typeof body?.scheduledAt === "string" ? body.scheduledAt : undefined;
    // Time-only. Caption/media use PATCH .../content so Save changes cannot
    // accidentally hit reschedule_scheduled_post.
    if (scheduledAt === undefined) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }
    if (
      typeof body?.caption === "string" ||
      Array.isArray(body?.media)
    ) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }

    try {
      return c.json(
        await getService().reschedule(
          user.id,
          c.req.param("scheduleId"),
          scheduledAt,
        ),
      );
    } catch (error) {
      const mapped = calendarError(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.patch("/calendar/slots/:scheduleId/content", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const body = await c.req.json().catch(() => null);
    const record = isRecord(body) ? body : null;
    if (record && typeof record.scheduledAt === "string") {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }
    const caption = parseCaption(record?.caption);
    if (caption === null || (caption && caption.length > MAX_CAPTION_CHARS)) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }
    const mediaResult = parseMediaField(record);
    if (!mediaResult.ok) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }
    if (caption === undefined && !mediaResult.present) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }

    try {
      return c.json(
        await getService().updateContent(user.id, c.req.param("scheduleId"), {
          ...(caption !== undefined ? { caption } : {}),
          ...(mediaResult.present ? { media: mediaResult.media } : {}),
        }),
      );
    } catch (error) {
      const mapped = calendarError(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/calendar/slots/:scheduleId/mirror", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const scheduleId = c.req.param("scheduleId");
    const body = await c.req.json().catch(() => null);
    const record = isRecord(body) ? body : null;
    if (hasOwn(record, "targets") && !Array.isArray(record?.targets)) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }
    const rawTargets = Array.isArray(record?.targets) ? record.targets : null;
    if (
      !rawTargets ||
      rawTargets.length === 0 ||
      rawTargets.length > MAX_CALENDAR_TARGETS
    ) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }

    const targets = [];
    for (const item of rawTargets) {
      const itemRecord = isRecord(item) ? item : null;
      const platform = validSizedString(itemRecord?.platform, MAX_PLATFORM_CHARS)
        ? itemRecord.platform
        : "";
      const accountId = validSizedString(itemRecord?.accountId, MAX_ID_CHARS)
        ? itemRecord.accountId
        : "";
      const scheduledAt = validSizedString(itemRecord?.scheduledAt, MAX_ISO_CHARS)
        ? itemRecord.scheduledAt
        : "";
      if (!platform || !accountId || !scheduledAt) {
        return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
      }
      const targetMedia = parseMediaField(itemRecord);
      if (!targetMedia.ok) {
        return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
      }
      targets.push({
        platform,
        accountId,
        scheduledAt,
        ...(targetMedia.present ? { media: targetMedia.media } : {}),
      });
    }

    const caption = parseCaption(record?.caption);
    if (caption === null || (caption && caption.length > MAX_CAPTION_CHARS)) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }
    const mediaResult = parseMediaField(record);
    if (!mediaResult.ok) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }

    try {
      return c.json(
        await getService().mirrorToPlatforms(user.id, scheduleId, {
          targets: targets as Array<{
            platform: "threads" | "linkedin_personal" | "instagram";
            accountId: string;
            scheduledAt: string;
          }>,
          ...(caption !== undefined ? { caption } : {}),
          ...(mediaResult.present ? { media: mediaResult.media } : {}),
        }),
      );
    } catch (error) {
      const mapped = calendarError(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/calendar/slots/:scheduleId/rewrite-selection", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    const scheduleId = c.req.param("scheduleId");
    const body = await c.req.json().catch(() => null);
    const selection = typeof body?.selection === "string" ? body.selection : "";
    const instruction =
      typeof body?.instruction === "string" ? body.instruction : "";
    const actionRaw = typeof body?.action === "string" ? body.action : "";
    const action = REWRITE_ACTIONS.includes(actionRaw as ScheduleRewriteAction)
      ? (actionRaw as ScheduleRewriteAction)
      : null;

    try {
      // Ensure the schedule exists and belongs to this session user.
      await getService().getSlot(user.id, scheduleId);
      if (!action) {
        throw new CalendarError("INVALID_REWRITE", 422);
      }
      return c.json(
        await rewriteScheduleSelection({
          selection,
          action,
          ...(instruction ? { instruction } : {}),
        }),
      );
    } catch (error) {
      const mapped = calendarError(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.delete("/calendar/slots/:scheduleId", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    try {
      return c.json(await getService().cancel(user.id, c.req.param("scheduleId")));
    } catch (error) {
      const mapped = calendarError(error);
      return c.json(mapped.body, mapped.status);
    }
  });
}
