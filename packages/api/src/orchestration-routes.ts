import type { Context, Hono } from "hono";
import { getCookie, deleteCookie } from "hono/cookie";
import {
  SESSION_COOKIE_NAME,
  validateSessionToken,
} from "@sochestral/auth";
import type { Database } from "@sochestral/database";
import {
  OrchestrationError,
  type OrchestrationService,
} from "@sochestral/orchestration";
import type { Env } from "./app.js";

type ServiceFactory = () => OrchestrationService;

function errorResponse(error: unknown): {
  body: Record<string, unknown>;
  status: 401 | 404 | 409 | 422 | 429 | 500 | 502 | 503;
} {
  if (error instanceof OrchestrationError) {
    return {
      body: { error: error.code, ...error.details },
      status: error.status,
    };
  }
  console.error("[sochestral:orchestration] request failed", {
    error: "INTERNAL_ERROR",
  });
  return { body: { error: "INTERNAL_ERROR" }, status: 500 };
}

export function registerOrchestrationRoutes(
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

  app.post("/orchestration/conversations", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const input = await c.req.json().catch(() => null);
    try {
      const result = await getService().createConversation(user.id, {
        message: typeof input?.message === "string" ? input.message : "",
        requestId:
          typeof input?.requestId === "string" ? input.requestId : "",
      });
      return c.json(result, 200);
    } catch (error) {
      const mapped = errorResponse(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.get("/orchestration/conversations", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const limitValue = c.req.query("limit");
    try {
      const result = await getService().listConversations(user.id, {
        cursor: c.req.query("cursor"),
        limit: limitValue === undefined ? undefined : Number(limitValue),
      });
      return c.json(result);
    } catch (error) {
      const mapped = errorResponse(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/orchestration/conversations/:id/messages", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const input = await c.req.json().catch(() => null);
    try {
      const result = await getService().addMessage(
        user.id,
        c.req.param("id"),
        {
          message: typeof input?.message === "string" ? input.message : "",
          requestId:
            typeof input?.requestId === "string" ? input.requestId : "",
        },
      );
      return c.json(result, 200);
    } catch (error) {
      const mapped = errorResponse(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.get("/orchestration/conversations/:id", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const limitValue = c.req.query("limit");
    try {
      const result = await getService().getConversation(
        user.id,
        c.req.param("id"),
        {
          cursor: c.req.query("cursor"),
          limit: limitValue === undefined ? undefined : Number(limitValue),
        },
      );
      return c.json(result);
    } catch (error) {
      const mapped = errorResponse(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.delete("/orchestration/conversations/:id", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    try {
      await getService().deleteConversation(user.id, c.req.param("id"));
      return c.body(null, 204);
    } catch (error) {
      const mapped = errorResponse(error);
      return c.json(mapped.body, mapped.status);
    }
  });
}
