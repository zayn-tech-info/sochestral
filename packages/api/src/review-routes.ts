import type { Context, Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { SESSION_COOKIE_NAME, validateSessionToken } from "@sochestral/auth";
import type { Database } from "@sochestral/database";
import { ReviewError, type ReviewService } from "@sochestral/orchestration";
import type { Env } from "./app.js";
import { isAllowedCorsOrigin } from "./cors-origin.js";

type ServiceFactory = () => ReviewService;

function mappedError(error: unknown) {
  if (error instanceof ReviewError) {
    return { body: { error: error.code }, status: error.status } as const;
  }
  console.error("[sochestral:review] request failed", { error: "INTERNAL_ERROR" });
  return { body: { error: "INTERNAL_ERROR" }, status: 500 as const };
}

export function registerReviewRoutes(
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

  async function trustedRequest(c: Context<Env>) {
    const user = await sessionUser(c);
    if (!user) return { response: c.json({ error: "UNAUTHORIZED" }, 401) };
    if (
      !isAllowedCorsOrigin(c.req.header("Origin")) ||
      c.req.header("X-Sochestral-Request") !== "review-action" ||
      !c.req.header("Content-Type")?.toLowerCase().startsWith("application/json")
    ) {
      return { response: c.json({ error: "INVALID_REVIEW_REQUEST" }, 403) };
    }
    return { user };
  }

  app.patch("/review/drafts/:draftId", async (c) => {
    const trusted = await trustedRequest(c);
    if ("response" in trusted) return trusted.response;
    const body = await c.req.json().catch(() => null);
    if (
      typeof body !== "object" ||
      body === null ||
      !Array.isArray(body.mediaUrls) ||
      body.mediaUrls.some((value: unknown) => typeof value !== "string") ||
      (body.mediaItems !== undefined && !Array.isArray(body.mediaItems))
    ) {
      return c.json({ error: "INVALID_REVIEW_INPUT" }, 422);
    }
    try {
      const result = await getService().updateDraft(
        trusted.user.id,
        c.req.param("draftId"),
        {
          expectedRevision: Number(body?.expectedRevision),
          body: typeof body?.body === "string" ? body.body : "",
          mediaUrls: body.mediaUrls,
          ...(Array.isArray(body.mediaItems)
            ? {
                mediaItems: body.mediaItems.flatMap((entry: unknown) => {
                  if (typeof entry !== "object" || entry === null) return [];
                  const item = entry as Record<string, unknown>;
                  return [{
                    assetId: typeof item.assetId === "string" ? item.assetId : null,
                    externalUrl: typeof item.externalUrl === "string" ? item.externalUrl : null,
                  }];
                }),
              }
            : {}),
          selectedAccountId:
            typeof body?.selectedAccountId === "string" ? body.selectedAccountId : null,
        },
      );
      return c.json(result);
    } catch (error) {
      const mapped = mappedError(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/review/groups/:groupId/publish", async (c) => {
    const trusted = await trustedRequest(c);
    if ("response" in trusted) return trusted.response;
    const body = await c.req.json().catch(() => null);
    try {
      const result = await getService().publishGroup(
        trusted.user.id,
        c.req.param("groupId"),
        {
          requestId: typeof body?.requestId === "string" ? body.requestId : "",
          drafts: Array.isArray(body?.drafts)
            ? body.drafts.flatMap((entry: unknown) => {
                if (typeof entry !== "object" || entry === null) return [];
                const value = entry as Record<string, unknown>;
                return typeof value.draftId === "string"
                  ? [{ draftId: value.draftId, expectedRevision: Number(value.expectedRevision) }]
                  : [];
              })
            : [],
        },
      );
      return c.json(result);
    } catch (error) {
      const mapped = mappedError(error);
      return c.json(mapped.body, mapped.status);
    }
  });

  app.post("/review/attempts/:attemptId/check", async (c) => {
    const trusted = await trustedRequest(c);
    if ("response" in trusted) return trusted.response;
    await c.req.json().catch(() => null);
    try {
      return c.json(
        await getService().checkAttempt(
          trusted.user.id,
          c.req.param("attemptId"),
        ),
      );
    } catch (error) {
      const mapped = mappedError(error);
      return c.json(mapped.body, mapped.status);
    }
  });
}
