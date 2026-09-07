import type { Context, Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { SESSION_COOKIE_NAME, validateSessionToken } from "@sochestral/auth";
import {
  CampaignDatabaseError,
  getConversationContentPlan,
  getLatestCampaignJob,
  getOwnedCampaignJob,
  pauseCampaignJob,
  resumeCampaignJob,
  stopCampaignJob,
  type Database,
} from "@sochestral/database";
import { publicCampaign } from "@sochestral/orchestration";
import type { Env } from "./app.js";

function mapped(error: unknown) {
  if (error instanceof CampaignDatabaseError) {
    const status = error.code === "NOT_FOUND" ? 404 : 409;
    return {
      body: { error: error.code, message: error.message },
      status: status as 404 | 409,
    };
  }
  console.error("[sochestral:campaign] request failed", {
    error: "INTERNAL_ERROR",
  });
  return { body: { error: "INTERNAL_ERROR" }, status: 500 as const };
}

export function registerCampaignRoutes(
  app: Hono<Env>,
  db: Database["db"],
): void {
  async function sessionOnly(c: Context<Env>) {
    const raw = getCookie(c, SESSION_COOKIE_NAME);
    const session = await validateSessionToken(db, raw);
    if (!session && raw) deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
    if (!session) return { response: c.json({ error: "UNAUTHORIZED" }, 401) };
    return { user: session.user };
  }

  app.get("/campaigns/current", async (c) => {
    const request = await sessionOnly(c);
    if ("response" in request) return request.response;
    const job = await getLatestCampaignJob(db, request.user.id);
    if (!job) return c.json({ error: "NOT_FOUND" }, 404);
    const plan = await getConversationContentPlan(
      db,
      request.user.id,
      job.conversationId,
    );
    return c.json({ campaign: publicCampaign(job, plan?.startDate ?? null) });
  });

  app.post("/campaigns/:id/pause", async (c) => {
    const request = await sessionOnly(c);
    if ("response" in request) return request.response;
    const body = await c.req.json().catch(() => null);
    if (!body || body.confirm !== true) {
      return c.json({ error: "CONFIRM_REQUIRED" }, 400);
    }
    try {
      const job = await pauseCampaignJob(
        db,
        request.user.id,
        c.req.param("id"),
      );
      return c.json({ id: job.id, status: job.status });
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });

  app.post("/campaigns/:id/resume", async (c) => {
    const request = await sessionOnly(c);
    if ("response" in request) return request.response;
    try {
      const job = await resumeCampaignJob(
        db,
        request.user.id,
        c.req.param("id"),
      );
      return c.json({ id: job.id, status: job.status });
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });

  app.post("/campaigns/:id/stop", async (c) => {
    const request = await sessionOnly(c);
    if ("response" in request) return request.response;
    const body = await c.req.json().catch(() => null);
    if (!body || body.confirm !== true) {
      return c.json({ error: "CONFIRM_REQUIRED" }, 400);
    }
    try {
      const owned = await getOwnedCampaignJob(
        db,
        request.user.id,
        c.req.param("id"),
      );
      if (!owned) return c.json({ error: "NOT_FOUND" }, 404);
      const job = await stopCampaignJob(db, request.user.id, owned.id);
      return c.json({ id: job.id, status: job.status });
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });
}
