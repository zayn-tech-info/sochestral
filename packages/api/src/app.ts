import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { cors } from "hono/cors";
import {
  authenticateEmailPassword,
  createSession,
  deleteSessionByToken,
  INVALID_CREDENTIALS,
  mintMcpJwt,
  SESSION_COOKIE_NAME,
  validateSessionToken,
} from "@sochestral/auth";
import { getDb, type Database } from "@sochestral/database";
import {
  createConnectorService,
  createOrchestrationService,
  createReviewService,
  PublishingPreferenceService,
  StreamableHttpSocialMcpGateway,
  type ConnectorService,
  type OrchestrationService,
  type ReviewService,
} from "@sochestral/orchestration";
import { registerConnectorRoutes } from "./connector-routes.js";
import { registerOrchestrationRoutes } from "./orchestration-routes.js";
import { registerReviewRoutes } from "./review-routes.js";
import { registerPublishingRoutes } from "./publishing-routes.js";
import { registerMediaRoutes } from "./media-routes.js";
import { MediaService } from "./media-storage.js";

export type Env = {
  Variables: {
    db: Database["db"];
  };
};

function publicUser(user: { id: string; email: string | null }) {
  return { id: user.id, email: user.email };
}

function cookieSecure(): boolean {
  return process.env.NODE_ENV === "production";
}

export function createApp(
  db: Database["db"] = getDb().db,
  orchestrationService?: OrchestrationService,
  connectorService?: ConnectorService,
  reviewService?: ReviewService,
) {
  const app = new Hono<Env>();
  let resolvedOrchestration = orchestrationService;
  let resolvedConnectors = connectorService;
  let resolvedReview = reviewService;
  let mediaService: MediaService | undefined;

  function getMediaService(): MediaService {
    mediaService ??= new MediaService(db);
    return mediaService;
  }

  function getReviewService(): ReviewService {
    if (!resolvedReview) {
      resolvedConnectors ??= createConnectorService();
      const url = process.env.SOCIALMCP_MCP_URL?.trim();
      if (!url) throw new Error("SOCIALMCP_MCP_URL is required");
      const timeout = Number(process.env.REVIEW_PUBLISH_TIMEOUT_MS ?? "30000");
      resolvedReview = createReviewService(
        db,
        resolvedConnectors,
        new StreamableHttpSocialMcpGateway(
          url,
          Number.isFinite(timeout) && timeout > 0 ? timeout : 30000,
        ),
        {
          publishUrl: (userId, assetId) => getMediaService().publishUrl(userId, assetId),
        },
      );
    }
    return resolvedReview;
  }

  app.use(
    "*",
    cors({
      origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
      credentials: true,
    }),
  );

  app.use("*", async (c, next) => {
    c.set("db", db);
    await next();
  });

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "sochestral-api",
    }),
  );

  app.post("/auth/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";

    const user = await authenticateEmailPassword(db, email, password);
    if (!user) {
      return c.json({ error: INVALID_CREDENTIALS }, 401);
    }

    const { rawToken } = await createSession(db, user.id);
    setCookie(c, SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: "Lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return c.json(publicUser(user));
  });

  app.post("/auth/logout", async (c) => {
    const raw = getCookie(c, SESSION_COOKIE_NAME);
    const deleted = await deleteSessionByToken(db, raw);
    deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
    if (!deleted && !raw) {
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }
    return c.body(null, 204);
  });

  app.get("/auth/me", async (c) => {
    const raw = getCookie(c, SESSION_COOKIE_NAME);
    const sessionUser = await validateSessionToken(db, raw);
    if (!sessionUser) {
      if (raw) deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }
    return c.json(publicUser(sessionUser.user));
  });

  app.post("/auth/mcp-token", async (c) => {
    const raw = getCookie(c, SESSION_COOKIE_NAME);
    const sessionUser = await validateSessionToken(db, raw);
    if (!sessionUser) {
      if (raw) deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }

    try {
      const minted = await mintMcpJwt(sessionUser.user.id);
      return c.json({
        token: minted.token,
        expiresAt: minted.expiresAt.toISOString(),
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: unknown }).code === "JWT_SECRET_MISSING"
      ) {
        return c.json({ error: "JWT_SECRET_MISSING" }, 500);
      }
      throw error;
    }
  });

  registerOrchestrationRoutes(app, db, () => {
    resolvedOrchestration ??= createOrchestrationService(db, {
      review: getReviewService(),
      media: {
        previewUrl: (userId, assetId) => getMediaService().previewUrl(userId, assetId),
        modelImage: (userId, assetId) => getMediaService().modelImage(userId, assetId),
        deleteConversationAssets: (userId, conversationId) =>
          getMediaService().deleteConversationAssets(userId, conversationId),
      },
    });
    return resolvedOrchestration;
  });
  registerConnectorRoutes(app, db, () => {
    resolvedConnectors ??= createConnectorService();
    return resolvedConnectors;
  });
  registerReviewRoutes(app, db, () => {
    return getReviewService();
  });
  const publishingPreferences = new PublishingPreferenceService(db);
  registerPublishingRoutes(app, db, () => publishingPreferences);
  registerMediaRoutes(app, db, getMediaService);

  return app;
}
