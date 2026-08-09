import type { Context, Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import {
  SESSION_COOKIE_NAME,
  validateSessionToken,
} from "@sochestral/auth";
import type { Database } from "@sochestral/database";
import {
  CalendarError,
  type CalendarService,
} from "@sochestral/orchestration";
import type { Env } from "./app.js";

type ServiceFactory = () => CalendarService;

function calendarError(error: unknown) {
  if (error instanceof CalendarError) {
    return {
      body: { error: error.code },
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
    const accountId = c.req.query("accountId") ?? undefined;
    const platform = c.req.query("platform") ?? undefined;

    try {
      return c.json(
        await getService().listSlots(user.id, {
          from,
          to,
          timeZone,
          accountId,
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
          accountId: c.req.query("accountId") ?? undefined,
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
      typeof body?.scheduledAt === "string" ? body.scheduledAt : "";

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
