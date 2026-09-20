import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE_NAME, validateSessionToken } from "@sochestral/auth";
import { reattachPlanComment, createPlan, getPlan, listPlans, addPlanComment, submitPlanComments, revisePlan, approvePlanDirection, refuseCreateContent, PlanWorkflowError, type Database } from "@sochestral/database";
import { isAllowedCorsOrigin } from "./cors-origin.js";
import type { Env } from "./app.js";

type PlanEnv = { Variables: { userId: string } };
const version = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
async function body(c: Context<PlanEnv>) {
  const value: unknown = await c.req.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PlanWorkflowError("INVALID_DOCUMENT");
  return value as Record<string, unknown>;
}
async function respond(c: Context<PlanEnv>, work: () => Promise<unknown>) {
  try { return c.json(await work()); }
  catch (error) {
    if (error instanceof PlanWorkflowError) {
      const status = error.code === "PLAN_NOT_FOUND" || error.code === "CONTEXT_NOT_FOUND" ? 404 : error.code === "STALE_VERSION" || error.code === "CONTENT_NOT_READY" ? 409 : 422;
      return c.json({ error: error.code }, status);
    }
    console.error("[sochestral:plans] request failed", { error: "INTERNAL_ERROR" });
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  }
}

export function registerPlanRoutes(app: Hono<Env>, db: Database["db"]) {
  const routes = new Hono<PlanEnv>();
  routes.use("*", async (c, next) => {
    const session = await validateSessionToken(db, getCookie(c, SESSION_COOKIE_NAME));
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    if (c.req.method !== "GET" && (!isAllowedCorsOrigin(c.req.header("Origin")) || c.req.header("X-Sochestral-Request") !== "plan-action" || !c.req.header("Content-Type")?.startsWith("application/json"))) {
      return c.json({ error: "INVALID_PLAN_REQUEST" }, 403);
    }
    c.set("userId", session.user.id);
    c.header("Cache-Control", "private, no-store");
    await next();
  });
  routes.get("/", c => respond(c, async () => ({ plans: await listPlans(db, c.get("userId")) })));
  routes.get("/:id", c => respond(c, async () => {
    const requested = c.req.query("version");
    if (requested !== undefined && (!/^[1-9]\d*$/.test(requested) || !version(Number(requested)))) throw new PlanWorkflowError("INVALID_DOCUMENT");
    return getPlan(db, c.get("userId"), c.req.param("id"), requested === undefined ? undefined : Number(requested));
  }));
  routes.post("/", c => respond(c, async () => {
    const input = await body(c);
    if (typeof input.title !== "string" || (input.contextId != null && typeof input.contextId !== "string") || (input.conversationId != null && typeof input.conversationId !== "string")) throw new PlanWorkflowError("INVALID_DOCUMENT");
    return createPlan(db, { userId: c.get("userId"), title: input.title, document: input.document, conversationId: input.conversationId as string | null | undefined, contextId: input.contextId as string | null ?? null });
  }));
  routes.post("/:id/comments", c => respond(c, async () => {
    const input = await body(c);
    if (!version(input.version) || typeof input.blockId !== "string" || typeof input.body !== "string" ||
      (input.quote != null && typeof input.quote !== "string") || (input.quoteContext != null && typeof input.quoteContext !== "string") ||
      (input.rangeStart != null && !Number.isSafeInteger(input.rangeStart)) || (input.rangeEnd != null && !Number.isSafeInteger(input.rangeEnd))) throw new PlanWorkflowError("INVALID_COMMENT");
    return addPlanComment(db, { userId: c.get("userId"), planId: c.req.param("id"), version: input.version, blockId: input.blockId, body: input.body,
      quote: input.quote as string | null, quoteContext: input.quoteContext as string | null, rangeStart: input.rangeStart as number | null, rangeEnd: input.rangeEnd as number | null });
  }));
  routes.post("/:id/comments/:commentId/reattach", c => respond(c, async () => {
    const input = await body(c);
    if (!version(input.version) || typeof input.blockId !== "string" ||
      (input.quote != null && typeof input.quote !== "string") || (input.quoteContext != null && typeof input.quoteContext !== "string") ||
      (input.rangeStart != null && !Number.isSafeInteger(input.rangeStart)) || (input.rangeEnd != null && !Number.isSafeInteger(input.rangeEnd))) throw new PlanWorkflowError("INVALID_COMMENT");
    return reattachPlanComment(db, { userId: c.get("userId"), planId: c.req.param("id"), commentId: c.req.param("commentId"), version: input.version, blockId: input.blockId,
      quote: input.quote as string | null, quoteContext: input.quoteContext as string | null, rangeStart: input.rangeStart as number | null, rangeEnd: input.rangeEnd as number | null });
  }));
  routes.post("/:id/comment-batches", c => respond(c, async () => {
    const input = await body(c);
    if (!version(input.version) || !strings(input.commentIds)) throw new PlanWorkflowError("INVALID_BATCH");
    return submitPlanComments(db, { userId: c.get("userId"), planId: c.req.param("id"), version: input.version, commentIds: input.commentIds });
  }));
  routes.post("/:id/versions", c => respond(c, async () => {
    const input = await body(c);
    if (!version(input.expectedVersion) || (input.batchId !== undefined && typeof input.batchId !== "string") || (input.handledCommentIds !== undefined && !strings(input.handledCommentIds)) || (input.contextId != null && typeof input.contextId !== "string")) throw new PlanWorkflowError("INVALID_DOCUMENT");
    return revisePlan(db, { userId: c.get("userId"), planId: c.req.param("id"), expectedVersion: input.expectedVersion, document: input.document,
      contextId: input.contextId as string | null ?? null, batchId: input.batchId as string | undefined, handledCommentIds: input.handledCommentIds as string[] | undefined });
  }));
  routes.post("/:id/approve", c => respond(c, async () => {
    const input = await body(c);
    if (input.confirm !== true || !version(input.version)) throw new PlanWorkflowError("INVALID_DOCUMENT");
    return approvePlanDirection(db, { userId: c.get("userId"), planId: c.req.param("id"), version: input.version });
  }));
  routes.post("/:id/create-content", c => respond(c, async () => {
    const input = await body(c);
    if (input.confirm !== true || !version(input.version)) throw new PlanWorkflowError("INVALID_DOCUMENT");
    return refuseCreateContent(db, { userId: c.get("userId"), planId: c.req.param("id"), version: input.version });
  }));
  app.route("/plans", routes);
}
