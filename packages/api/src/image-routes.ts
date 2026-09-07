import type { Context, Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { SESSION_COOKIE_NAME, validateSessionToken } from "@sochestral/auth";
import type { Database } from "@sochestral/database";
import type { Env } from "./app.js";
import { isAllowedCorsOrigin } from "./cors-origin.js";
import { ImageService, ImageServiceError } from "./image-service.js";

function mapped(error: unknown) {
  if (error instanceof ImageServiceError) {
    return {
      body: { error: error.code, message: error.message },
      status: error.status as 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503,
    } as const;
  }
  console.error("[sochestral:image] request failed", { error: "INTERNAL_ERROR" });
  return { body: { error: "INTERNAL_ERROR" }, status: 500 as const };
}

function publicJob(job: {
  id: string;
  kind: string;
  status: string;
  prompt: string | null;
  sizePreset: string;
  width: number;
  height: number;
  sourceMediaAssetId: string | null;
  resultMediaAssetId: string | null;
  resultMediaAssetIds?: string[] | null;
  variantCount?: number;
  estimatedCostCents: number;
  creditsCharged: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  conversationId: string | null;
}) {
  const resultIds =
    job.resultMediaAssetIds && job.resultMediaAssetIds.length > 0
      ? job.resultMediaAssetIds
      : job.resultMediaAssetId
        ? [job.resultMediaAssetId]
        : [];
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    prompt: job.prompt,
    sizePreset: job.sizePreset,
    width: job.width,
    height: job.height,
    sourceMediaAssetId: job.sourceMediaAssetId,
    resultMediaAssetId: resultIds[0] ?? null,
    resultMediaAssetIds: resultIds,
    variantCount: job.variantCount ?? 1,
    estimatedCostCents: job.estimatedCostCents,
    creditsCharged: job.creditsCharged,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    conversationId: job.conversationId,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

export function registerImageRoutes(
  app: Hono<Env>,
  db: Database["db"],
  getService: () => ImageService,
): void {
  async function sessionOnly(c: Context<Env>) {
    const raw = getCookie(c, SESSION_COOKIE_NAME);
    const session = await validateSessionToken(db, raw);
    if (!session && raw) deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
    if (!session) return { response: c.json({ error: "UNAUTHORIZED" }, 401) };
    return { user: session.user };
  }

  async function trusted(c: Context<Env>) {
    const base = await sessionOnly(c);
    if ("response" in base) return base;
    if (
      !isAllowedCorsOrigin(c.req.header("Origin")) ||
      c.req.header("X-Sochestral-Request") !== "image-action" ||
      (c.req.method !== "DELETE" &&
        !c.req.header("Content-Type")?.toLowerCase().startsWith("application/json"))
    ) {
      return { response: c.json({ error: "INVALID_IMAGE_REQUEST" }, 403) };
    }
    return base;
  }

  app.get("/brand-assets", async (c) => {
    const request = await sessionOnly(c);
    if ("response" in request) return request.response;
    try {
      const kind = c.req.query("kind") ?? undefined;
      const items = await getService().listBrand(request.user.id, kind);
      return c.json({
        items: items.map((item) => ({
          id: item.id,
          kind: item.kind,
          name: item.name,
          mediaAssetId: item.mediaAssetId,
          colorValue: item.colorValue,
          noteText: item.noteText,
          sortOrder: item.sortOrder,
          previewUrl: item.previewUrl,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
      });
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });

  app.get("/brand-assets/design-brief", async (c) => {
    const request = await sessionOnly(c);
    if ("response" in request) return request.response;
    try {
      const brief = await getService().getDesignBrief(request.user.id);
      return c.json(brief);
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });

  app.post("/brand-assets", async (c) => {
    const request = await trusted(c);
    if ("response" in request) return request.response;
    const body = await c.req.json().catch(() => ({}));
    try {
      const item = await getService().createBrand(request.user.id, body);
      return c.json({ item }, 201);
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });

  app.get("/brand-assets/recent-generations", async (c) => {
    const request = await sessionOnly(c);
    if ("response" in request) return request.response;
    try {
      const items = await getService().recentGenerations(request.user.id);
      return c.json({
        items: items.map((job) => ({
          ...publicJob(job),
          resultPreviewUrl: job.resultPreviewUrl,
        })),
      });
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });

  app.patch("/brand-assets/:id", async (c) => {
    const request = await trusted(c);
    if ("response" in request) return request.response;
    const body = await c.req.json().catch(() => ({}));
    try {
      const item = await getService().patchBrand(
        request.user.id,
        c.req.param("id"),
        body,
      );
      return c.json({ item });
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });

  app.delete("/brand-assets/:id", async (c) => {
    const request = await trusted(c);
    if ("response" in request) return request.response;
    try {
      const item = await getService().archiveBrand(
        request.user.id,
        c.req.param("id"),
      );
      return c.json({ item });
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });

  app.post("/image-jobs", async (c) => {
    const request = await trusted(c);
    if ("response" in request) return request.response;
    const body = await c.req.json().catch(() => ({}));
    try {
      const result = await getService().createJob(request.user.id, body);
      return c.json(
        {
          job: publicJob(result.job),
          inputs: result.inputs,
          remainingCredits: result.remainingCredits,
          monthlyBudget: result.monthlyBudget,
        },
        201,
      );
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });

  app.get("/image-jobs", async (c) => {
    const request = await sessionOnly(c);
    if ("response" in request) return request.response;
    const limit = Number(c.req.query("limit") ?? "20");
    const cursor = c.req.query("cursor") ?? undefined;
    try {
      const page = await getService().listJobs(
        request.user.id,
        Number.isFinite(limit) ? limit : 20,
        cursor,
      );
      return c.json({
        items: page.items.map(publicJob),
        nextCursor: page.nextCursor,
      });
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });

  app.get("/image-jobs/:id", async (c) => {
    const request = await sessionOnly(c);
    if ("response" in request) return request.response;
    try {
      const result = await getService().getJob(request.user.id, c.req.param("id"));
      return c.json({
        job: publicJob(result.job),
        inputs: result.inputs,
        resultPreviewUrl: result.resultPreviewUrl,
        resultPreviewUrls: result.resultPreviewUrls,
      });
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });

  app.post("/image-jobs/:id/confirm", async (c) => {
    const request = await trusted(c);
    if ("response" in request) return request.response;
    const body = await c.req.json().catch(() => ({}));
    try {
      const job = await getService().confirm(
        request.user.id,
        c.req.param("id"),
        body,
      );
      return c.json({ job: publicJob(job) });
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });

  app.post("/image-jobs/:id/cancel", async (c) => {
    const request = await trusted(c);
    if ("response" in request) return request.response;
    await c.req.json().catch(() => ({}));
    try {
      const job = await getService().cancel(request.user.id, c.req.param("id"));
      return c.json({ job: publicJob(job) });
    } catch (error) {
      const result = mapped(error);
      return c.json(result.body, result.status);
    }
  });
}
