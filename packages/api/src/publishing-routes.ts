import type { Context, Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { SESSION_COOKIE_NAME, validateSessionToken } from "@sochestral/auth";
import type { Database, PublishingAuthoritySource, PublishingMode } from "@sochestral/database";
import {
  PublishingPreferenceError,
  type PublishingPreferenceService,
} from "@sochestral/orchestration";
import type { Env } from "./app.js";
import { isAllowedCorsOrigin } from "./cors-origin.js";

type ServiceFactory = () => PublishingPreferenceService;

function isMode(value: unknown): value is PublishingMode {
  return value === "always_draft" || value === "approve_for_me" || value === "full_access";
}

function isSource(value: unknown): value is PublishingAuthoritySource {
  return value === "composer" || value === "settings";
}

export function registerPublishingRoutes(
  app: Hono<Env>,
  db: Database["db"],
  getService: ServiceFactory,
): void {
  async function sessionUser(c: Context<Env>) {
    const raw = getCookie(c, SESSION_COOKIE_NAME);
    const session = await validateSessionToken(db, raw);
    if (!session && raw) deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
    return session?.user ?? null;
  }

  app.get("/publishing/preferences", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    return c.json(await getService().get(user.id));
  });

  app.patch("/publishing/preferences", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    if (
      !isAllowedCorsOrigin(c.req.header("Origin")) ||
      c.req.header("X-Sochestral-Request") !== "publishing-action" ||
      !c.req.header("Content-Type")?.toLowerCase().startsWith("application/json")
    ) {
      return c.json({ error: "INVALID_PUBLISHING_REQUEST" }, 403);
    }
    const body = await c.req.json().catch(() => null);
    if (!isMode(body?.mode) || !isSource(body?.source)) {
      return c.json({ error: "INVALID_PREFERENCE" }, 422);
    }
    try {
      return c.json(
        await getService().update(user.id, {
          expectedRevision: Number(body.expectedRevision),
          mode: body.mode,
          source: body.source,
          acknowledged: body.acknowledged === true,
          consentVersion:
            typeof body.consentVersion === "string" ? body.consentVersion : null,
        }),
      );
    } catch (error) {
      if (error instanceof PublishingPreferenceError) {
        return c.json({ error: error.code }, error.status);
      }
      console.error("[sochestral:publishing] preference request failed", {
        error: "INTERNAL_ERROR",
      });
      return c.json({ error: "INTERNAL_ERROR" }, 500);
    }
  });
}
