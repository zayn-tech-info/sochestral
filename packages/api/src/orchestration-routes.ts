import type { Context, Hono } from "hono";
import { getCookie, deleteCookie } from "hono/cookie";
import { stream } from "hono/streaming";
import {
  SESSION_COOKIE_NAME,
  validateSessionToken,
} from "@sochestral/auth";
import type { Database } from "@sochestral/database";
import {
  OrchestrationError,
  createSequenceSink,
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

function mutationInput(input: Record<string, unknown> | null) {
  const intentAnswers = Array.isArray(input?.intentAnswers)
    ? input.intentAnswers.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const row = entry as Record<string, unknown>;
        if (
          typeof row.questionId !== "string" ||
          typeof row.optionId !== "string"
        ) {
          return [];
        }
        return [
          {
            questionId: row.questionId,
            optionId: row.optionId,
            ...(typeof row.customText === "string"
              ? { customText: row.customText }
              : {}),
          },
        ];
      })
    : undefined;
  return {
    message: typeof input?.message === "string" ? input.message : "",
    requestId: typeof input?.requestId === "string" ? input.requestId : "",
    ...(Array.isArray(input?.mediaAssetIds)
      ? {
          mediaAssetIds: input.mediaAssetIds.filter(
            (value: unknown): value is string => typeof value === "string",
          ),
        }
      : {}),
    ...(intentAnswers && intentAnswers.length > 0 ? { intentAnswers } : {}),
  };
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
      const result = await getService().createConversation(
        user.id,
        mutationInput(input),
      );
      return c.json(result, 200);
    } catch (error) {
      const mapped = errorResponse(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/orchestration/conversations/stream", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const input = await c.req.json().catch(() => null);
    const body = mutationInput(input);
    c.header("Content-Type", "application/x-ndjson; charset=utf-8");
    c.header("Cache-Control", "no-store, no-transform");
    c.header("X-Accel-Buffering", "no");
    return stream(c, async (writer) => {
      const sink = createSequenceSink((event) => {
        void writer.write(`${JSON.stringify(event)}\n`);
      });
      try {
        await getService().createConversationStream(user.id, body, sink);
      } catch {
        // Terminal turn_failed is emitted inside the service stream helper.
      }
    });
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
        mutationInput(input),
      );
      return c.json(result, 200);
    } catch (error) {
      const mapped = errorResponse(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/orchestration/conversations/:id/messages/stream", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const input = await c.req.json().catch(() => null);
    const body = mutationInput(input);
    const conversationId = c.req.param("id");
    c.header("Content-Type", "application/x-ndjson; charset=utf-8");
    c.header("Cache-Control", "no-store, no-transform");
    c.header("X-Accel-Buffering", "no");
    return stream(c, async (writer) => {
      const sink = createSequenceSink((event) => {
        void writer.write(`${JSON.stringify(event)}\n`);
      });
      try {
        await getService().addMessageStream(
          user.id,
          conversationId,
          body,
          sink,
        );
      } catch {
        // Terminal turn_failed is emitted inside the service stream helper.
      }
    });
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
