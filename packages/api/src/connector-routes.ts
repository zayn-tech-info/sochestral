import type { Context, Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import {
  SESSION_COOKIE_NAME,
  validateSessionToken,
} from "@sochestral/auth";
import type { Database } from "@sochestral/database";
import {
  ConnectorError,
  type ConnectorService,
} from "@sochestral/orchestration";
import type { Env } from "./app.js";

type ServiceFactory = () => ConnectorService;

function connectorError(error: unknown) {
  if (error instanceof ConnectorError) {
    return {
      body: { error: error.code },
      status: error.status,
    } as const;
  }
  console.error("[sochestral:connectors] request failed", {
    error: "INTERNAL_ERROR",
  });
  return {
    body: { error: "INTERNAL_ERROR" },
    status: 500,
  } as const;
}

export function registerConnectorRoutes(
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

  app.get("/connectors", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    try {
      return c.json(await getService().list(user.id));
    } catch (error) {
      const mapped = connectorError(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/connectors/:platform/connect", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);

    try {
      return c.json(
        await getService().startConnect(user.id, c.req.param("platform")),
      );
    } catch (error) {
      const mapped = connectorError(error);
      return c.json(mapped.body, mapped.status);
    }
  });
}
