import type { Context, Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { SESSION_COOKIE_NAME, validateSessionToken } from "@sochestral/auth";
import type { Database } from "@sochestral/database";
import { MediaError, verifyMediaViewSig, type MediaService } from "./media-storage.js";
import type { Env } from "./app.js";
import { isAllowedCorsOrigin } from "./cors-origin.js";

function mapped(error: unknown) {
  if (error instanceof MediaError) return { body: { error: error.code }, status: error.status } as const;
  console.error("[sochestral:media] request failed", { error: "INTERNAL_ERROR" });
  return { body: { error: "INTERNAL_ERROR" }, status: 500 as const };
}

export function registerMediaRoutes(
  app: Hono<Env>,
  db: Database["db"],
  getService: () => MediaService,
): void {
  async function trusted(c: Context<Env>) {
    const raw = getCookie(c, SESSION_COOKIE_NAME);
    const session = await validateSessionToken(db, raw);
    if (!session && raw) deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
    if (!session) return { response: c.json({ error: "UNAUTHORIZED" }, 401) };
    if (
      !isAllowedCorsOrigin(c.req.header("Origin")) ||
      c.req.header("X-Sochestral-Request") !== "publishing-action" ||
      (c.req.method !== "DELETE" && !c.req.header("Content-Type")?.toLowerCase().startsWith("application/json"))
    ) {
      return { response: c.json({ error: "INVALID_PUBLISHING_REQUEST" }, 403) };
    }
    return { user: session.user };
  }

  app.post("/media/uploads", async (c) => {
    const request = await trusted(c);
    if ("response" in request) return request.response;
    const body = await c.req.json().catch(() => null);
    const descriptors = Array.isArray(body?.files)
      ? body.files.flatMap((entry: unknown) => {
          if (typeof entry !== "object" || entry === null) return [];
          const value = entry as Record<string, unknown>;
          return typeof value.name === "string" && typeof value.mimeType === "string"
            ? [{ name: value.name, mimeType: value.mimeType, byteSize: Number(value.byteSize) }]
            : [];
        })
      : [];
    try {
      return c.json(await getService().createUploads(request.user.id, descriptors), 201);
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });

  app.post("/media/uploads/:assetId/complete", async (c) => {
    const request = await trusted(c);
    if ("response" in request) return request.response;
    await c.req.json().catch(() => null);
    try {
      return c.json(await getService().complete(request.user.id, c.req.param("assetId")));
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });

  app.delete("/media/uploads/:assetId", async (c) => {
    const request = await trusted(c);
    if ("response" in request) return request.response;
    try {
      await getService().delete(request.user.id, c.req.param("assetId"));
      return c.body(null, 204);
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });

  /** Durable media fetch for calendar/MCP: time-bound HMAC auth, redirects to a fresh signed R2 GET. */
  app.get("/media/assets/:assetId/view", async (c) => {
    const assetId = c.req.param("assetId");
    const userId = c.req.query("u") ?? "";
    const exp = c.req.query("exp");
    const sig = c.req.query("sig") ?? "";
    if (!userId || !verifyMediaViewSig(userId, assetId, exp, sig)) {
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }
    try {
      const target = await getService().signedRedirectTarget(userId, assetId);
      return c.redirect(target, 302);
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });
}
