import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSession, SESSION_COOKIE_NAME } from "@sochestral/auth";
import {
  createDb,
  provisionUser,
  requireTestDatabaseUrl,
  type Database,
} from "@sochestral/database";
import { createApp } from "./app.js";

function imageHeaders(cookie: string): Record<string, string> {
  return {
    Cookie: cookie,
    Origin: "http://localhost:3000",
    "Content-Type": "application/json",
    "X-Sochestral-Request": "image-action",
  };
}

describe("image API routes", () => {
  let database: Database;
  let cookie: string;
  let otherCookie: string;
  let ownerId: string;
  let app: ReturnType<typeof createApp>;
  const previousCors = process.env.CORS_ORIGIN;
  const previousEnabled = process.env.IMAGE_GENERATION_ENABLED;
  const previousBudget = process.env.IMAGE_MONTHLY_CREDIT_BUDGET;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (previousCors === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previousCors;
    if (previousEnabled === undefined) delete process.env.IMAGE_GENERATION_ENABLED;
    else process.env.IMAGE_GENERATION_ENABLED = previousEnabled;
    if (previousBudget === undefined) delete process.env.IMAGE_MONTHLY_CREDIT_BUDGET;
    else process.env.IMAGE_MONTHLY_CREDIT_BUDGET = previousBudget;
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    process.env.CORS_ORIGIN = "http://localhost:3000";
    process.env.IMAGE_GENERATION_ENABLED = "true";
    process.env.IMAGE_MONTHLY_CREDIT_BUDGET = "50";
    await database.client`delete from users`;
    const owner = await provisionUser(database.db, "image-owner@example.com");
    const other = await provisionUser(database.db, "image-other@example.com");
    ownerId = owner.id;
    const ownerSession = await createSession(database.db, owner.id);
    const otherSession = await createSession(database.db, other.id);
    cookie = `${SESSION_COOKIE_NAME}=${ownerSession.rawToken}`;
    otherCookie = `${SESSION_COOKIE_NAME}=${otherSession.rawToken}`;
    app = createApp(database.db);
  });

  it("requires a session for brand assets and image jobs", async () => {
    const brand = await app.request("/brand-assets");
    expect(brand.status).toBe(401);
    const jobs = await app.request("/image-jobs");
    expect(jobs.status).toBe(401);
  });

  it("creates and lists owned brand color assets; foreign get is empty isolation", async () => {
    const create = await app.request("/brand-assets", {
      method: "POST",
      headers: imageHeaders(cookie),
      body: JSON.stringify({
        kind: "color",
        name: "Brand navy",
        colorValue: "#0b1f3a",
      }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as {
      item: { id: string; name: string; kind: string };
    };
    expect(created.item.kind).toBe("color");
    expect(created.item.name).toBe("Brand navy");

    const list = await app.request("/brand-assets", {
      headers: { Cookie: cookie },
    });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { items: Array<{ id: string }> };
    expect(body.items.some((item) => item.id === created.item.id)).toBe(true);

    const otherList = await app.request("/brand-assets", {
      headers: { Cookie: otherCookie },
    });
    const otherBody = (await otherList.json()) as { items: Array<{ id: string }> };
    expect(otherBody.items.some((item) => item.id === created.item.id)).toBe(
      false,
    );
  });

  it("creates a pending_confirm generate job and confirms to queued (AC-4)", async () => {
    const create = await app.request("/image-jobs", {
      method: "POST",
      headers: imageHeaders(cookie),
      body: JSON.stringify({
        kind: "generate",
        prompt: "A clean product photo on a white table",
        sizePreset: "portrait_4_5",
        requestId: "req_create_1",
      }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as {
      job: { id: string; status: string; sizePreset: string };
    };
    expect(created.job.status).toBe("pending_confirm");
    expect(created.job.sizePreset).toBe("portrait_4_5");

    const confirm = await app.request(`/image-jobs/${created.job.id}/confirm`, {
      method: "POST",
      headers: imageHeaders(cookie),
      body: JSON.stringify({
        requestId: "req_confirm_1",
        sizePreset: "square",
      }),
    });
    expect(confirm.status).toBe(200);
    const confirmed = (await confirm.json()) as {
      job: { status: string; sizePreset: string };
    };
    expect(confirmed.job.status).toBe("queued");
    expect(confirmed.job.sizePreset).toBe("square");

    const again = await app.request(`/image-jobs/${created.job.id}/confirm`, {
      method: "POST",
      headers: imageHeaders(cookie),
      body: JSON.stringify({ requestId: "req_confirm_1" }),
    });
    expect(again.status).toBe(200);
    const againBody = (await again.json()) as { job: { status: string } };
    expect(againBody.job.status).toBe("queued");
  });

  it("refuses create when image generation is disabled (AC-10)", async () => {
    process.env.IMAGE_GENERATION_ENABLED = "false";
    app = createApp(database.db);
    const response = await app.request("/image-jobs", {
      method: "POST",
      headers: imageHeaders(cookie),
      body: JSON.stringify({
        kind: "generate",
        prompt: "Should not run",
      }),
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("DISABLED");
  });

  it("refuses confirm when monthly budget is exhausted (AC-10)", async () => {
    process.env.IMAGE_MONTHLY_CREDIT_BUDGET = "1";
    app = createApp(database.db);
    const create = await app.request("/image-jobs", {
      method: "POST",
      headers: imageHeaders(cookie),
      body: JSON.stringify({
        kind: "generate",
        prompt: "Budget check",
      }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { job: { id: string } };
    const confirm = await app.request(`/image-jobs/${created.job.id}/confirm`, {
      method: "POST",
      headers: imageHeaders(cookie),
      body: JSON.stringify({ requestId: "req_budget" }),
    });
    expect(confirm.status).toBe(429);
    const body = (await confirm.json()) as { error: string };
    expect(body.error).toBe("BUDGET_EXCEEDED");
  });

  it("masks foreign image jobs as 404 (tenant isolation)", async () => {
    const create = await app.request("/image-jobs", {
      method: "POST",
      headers: imageHeaders(cookie),
      body: JSON.stringify({
        kind: "generate",
        prompt: "Owner only",
      }),
    });
    const created = (await create.json()) as { job: { id: string } };
    const foreign = await app.request(`/image-jobs/${created.job.id}`, {
      headers: { Cookie: otherCookie },
    });
    expect(foreign.status).toBe(404);
    void ownerId;
  });

  it("cancels a pending_confirm job", async () => {
    const create = await app.request("/image-jobs", {
      method: "POST",
      headers: imageHeaders(cookie),
      body: JSON.stringify({
        kind: "generate",
        prompt: "Cancel me",
      }),
    });
    const created = (await create.json()) as { job: { id: string } };
    const cancel = await app.request(`/image-jobs/${created.job.id}/cancel`, {
      method: "POST",
      headers: imageHeaders(cookie),
      body: "{}",
    });
    expect(cancel.status).toBe(200);
    const body = (await cancel.json()) as { job: { status: string } };
    expect(body.job.status).toBe("cancelled");
  });

  it("returns a missing design brief then pending after a brand mutate (AC-7)", async () => {
    const missing = await app.request("/brand-assets/design-brief", {
      headers: { Cookie: cookie },
    });
    expect(missing.status).toBe(200);
    const missingBody = (await missing.json()) as {
      status: string;
      updating: boolean;
    };
    expect(missingBody.status).toBe("missing");
    expect(missingBody.updating).toBe(false);

    const create = await app.request("/brand-assets", {
      method: "POST",
      headers: imageHeaders(cookie),
      body: JSON.stringify({
        kind: "color",
        name: "Primary",
        colorValue: "#111111",
      }),
    });
    expect(create.status).toBe(201);

    const pending = await app.request("/brand-assets/design-brief", {
      headers: { Cookie: cookie },
    });
    const pendingBody = (await pending.json()) as {
      status: string;
      updating: boolean;
    };
    expect(pendingBody.status).toBe("pending");
    expect(pendingBody.updating).toBe(true);
  });
});
