import type { Context, Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import {
  SESSION_COOKIE_NAME,
  validateSessionToken,
} from "@sochestral/auth";
import type { Database } from "@sochestral/database";
import {
  CalendarError,
  rewriteScheduleSelection,
  type CalendarService,
  type ScheduleRewriteAction,
} from "@sochestral/orchestration";
import type { Env } from "./app.js";

type ServiceFactory = () => CalendarService;

function calendarError(error: unknown) {
  if (error instanceof CalendarError) {
    return {
      body: {
        error: error.code,
        ...(error.details ? { details: error.details } : {}),
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
    if (body && typeof body.scheduledAt === "string") {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }
    const caption = parseCaption(body?.caption);
    if (caption === null) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }
    const hasMedia = Array.isArray(body?.media);
    const media = hasMedia
      ? body.media.filter((item: unknown): item is string => typeof item === "string")
      : undefined;
    if (caption === undefined && !hasMedia) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }

    try {
      return c.json(
        await getService().updateContent(user.id, c.req.param("scheduleId"), {
          ...(caption !== undefined ? { caption } : {}),
          ...(hasMedia ? { media } : {}),
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
    const rawTargets = Array.isArray(body?.targets) ? body.targets : null;
    if (!rawTargets || rawTargets.length === 0) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }

    const targets = [];
    for (const item of rawTargets) {
      const platform =
        typeof item?.platform === "string" ? item.platform : "";
      const accountId =
        typeof item?.accountId === "string" ? item.accountId : "";
      const scheduledAt =
        typeof item?.scheduledAt === "string" ? item.scheduledAt : "";
      if (!platform || !accountId || !scheduledAt) {
        return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
      }
      targets.push({ platform, accountId, scheduledAt });
    }

    const caption = parseCaption(body?.caption);
    if (caption === null) {
      return c.json({ error: "INVALID_CONTENT_UPDATE" }, 422);
    }
    const hasMedia = Array.isArray(body?.media);
    const media = hasMedia
      ? body.media.filter((item: unknown): item is string => typeof item === "string")
      : undefined;

    try {
      return c.json(
        await getService().mirrorToPlatforms(user.id, scheduleId, {
          targets: targets as Array<{
            platform: "threads" | "linkedin_personal" | "instagram";
            accountId: string;
            scheduledAt: string;
          }>,
          ...(caption !== undefined ? { caption } : {}),
          ...(hasMedia ? { media } : {}),
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
