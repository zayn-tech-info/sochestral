import type { Context, Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { SESSION_COOKIE_NAME, validateSessionToken } from "@sochestral/auth";
import {
  createProfileEntry,
  deleteOwnedProfileEntry,
  getCompiledProfile,
  listProfileEntries,
  patchBusinessProfile,
  patchOwnedProfileEntry,
  ProfileDatabaseError,
  type Database,
  type ProfileEntryCategory,
  type ProfileEntryStatus,
} from "@sochestral/database";
import type { Env } from "./app.js";

const CATEGORIES = new Set([
  "tone",
  "do_not",
  "cadence",
  "competitor",
  "audience",
  "skill",
  "brand_fact",
]);

const STATUSES = new Set([
  "proposed",
  "active",
  "rejected",
  "archived",
]);

function projectProfile(
  compiled: Awaited<ReturnType<typeof getCompiledProfile>>,
  entryItems: Awaited<ReturnType<typeof listProfileEntries>>["items"],
) {
  const sections: Record<string, typeof entryItems> = {};
  for (const entry of entryItems) {
    const list = sections[entry.category] ?? [];
    list.push(entry);
    sections[entry.category] = list;
  }
  return {
    id: compiled.profile.id || null,
    businessName: compiled.profile.businessName,
    businessDescription: compiled.profile.businessDescription,
    websiteUrl: compiled.profile.websiteUrl,
    targetAudience: compiled.profile.targetAudience,
    industry: compiled.profile.industry,
    setupStatus: compiled.profile.setupStatus,
    setupStep: compiled.profile.setupStep,
    competitorsSkipped: compiled.profile.competitorsSkipped,
    compiledNote: compiled.compiledNote,
    minimumComplete: compiled.minimumComplete,
    sections,
    updatedAt: compiled.profile.updatedAt,
  };
}

function projectEntry(entry: {
  id: string;
  category: string;
  title: string | null;
  body: string;
  status: string;
  source: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: entry.id,
    category: entry.category,
    title: entry.title,
    body: entry.body,
    status: entry.status,
    source: entry.source,
    sortOrder: entry.sortOrder,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function statusForError(code: ProfileDatabaseError["code"]): 404 | 422 {
  if (code === "PROFILE_NOT_FOUND" || code === "ENTRY_NOT_FOUND") return 404;
  return 422;
}

export function registerProfileRoutes(
  app: Hono<Env>,
  db: Database["db"],
): void {
  async function sessionUser(c: Context<Env>) {
    const raw = getCookie(c, SESSION_COOKIE_NAME);
    const session = await validateSessionToken(db, raw);
    if (!session && raw) deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
    return session?.user ?? null;
  }

  app.get("/profile", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const compiled = await getCompiledProfile(db, user.id);
    const listed = await listProfileEntries(db, {
      userId: user.id,
      limit: 100,
      includeArchived: false,
    });
    return c.json(projectProfile(compiled, listed.items));
  });

  app.patch("/profile", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return c.json({ error: "INVALID_INPUT" }, 422);
    }
    try {
      await patchBusinessProfile(db, user.id, {
        businessName:
          body.businessName === undefined ? undefined : body.businessName,
        businessDescription:
          body.businessDescription === undefined
            ? undefined
            : body.businessDescription,
        websiteUrl: body.websiteUrl === undefined ? undefined : body.websiteUrl,
        targetAudience:
          body.targetAudience === undefined ? undefined : body.targetAudience,
        industry: body.industry === undefined ? undefined : body.industry,
        competitorsSkipped:
          typeof body.competitorsSkipped === "boolean"
            ? body.competitorsSkipped
            : undefined,
        redoSetup: body.redoSetup === true,
        confirmReset: body.confirmReset === true,
        setupStep:
          typeof body.setupStep === "string" || body.setupStep === null
            ? body.setupStep
            : undefined,
      });
      const compiled = await getCompiledProfile(db, user.id);
      const listed = await listProfileEntries(db, {
        userId: user.id,
        limit: 100,
      });
      return c.json(projectProfile(compiled, listed.items));
    } catch (error) {
      if (error instanceof ProfileDatabaseError) {
        return c.json({ error: error.code }, statusForError(error.code));
      }
      console.error("[sochestral:profile] patch failed", { error: "INTERNAL_ERROR" });
      return c.json({ error: "INTERNAL_ERROR" }, 500);
    }
  });

  app.get("/profile/entries", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const category = c.req.query("category");
    const status = c.req.query("status");
    const cursor = c.req.query("cursor") ?? undefined;
    const limitRaw = Number(c.req.query("limit") ?? 50);
    if (category && !CATEGORIES.has(category)) {
      return c.json({ error: "INVALID_INPUT" }, 422);
    }
    if (status && !STATUSES.has(status)) {
      return c.json({ error: "INVALID_INPUT" }, 422);
    }
    const result = await listProfileEntries(db, {
      userId: user.id,
      category: category as ProfileEntryCategory | undefined,
      status: status as ProfileEntryStatus | undefined,
      cursor,
      limit: Number.isFinite(limitRaw) ? limitRaw : 50,
    });
    return c.json({
      items: result.items.map(projectEntry),
      nextCursor: result.nextCursor,
    });
  });

  app.post("/profile/entries", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const body = await c.req.json().catch(() => null);
    if (
      !body ||
      typeof body.body !== "string" ||
      typeof body.category !== "string" ||
      !CATEGORIES.has(body.category)
    ) {
      return c.json({ error: "INVALID_INPUT" }, 422);
    }
    const status =
      typeof body.status === "string" && STATUSES.has(body.status)
        ? (body.status as ProfileEntryStatus)
        : "active";
    try {
      const entry = await createProfileEntry(db, {
        userId: user.id,
        category: body.category,
        title: typeof body.title === "string" ? body.title : null,
        body: body.body,
        status,
        source: "settings",
        sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
      });
      return c.json(projectEntry(entry), 201);
    } catch (error) {
      if (error instanceof ProfileDatabaseError) {
        return c.json({ error: error.code }, statusForError(error.code));
      }
      return c.json({ error: "INTERNAL_ERROR" }, 500);
    }
  });

  app.patch("/profile/entries/:id", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    const entryId = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return c.json({ error: "INVALID_INPUT" }, 422);
    }
    try {
      const entry = await patchOwnedProfileEntry(db, user.id, entryId, {
        title: body.title === undefined ? undefined : body.title,
        body: typeof body.body === "string" ? body.body : undefined,
        status:
          typeof body.status === "string" && STATUSES.has(body.status)
            ? (body.status as ProfileEntryStatus)
            : undefined,
        sortOrder:
          typeof body.sortOrder === "number" ? body.sortOrder : undefined,
      });
      return c.json(projectEntry(entry));
    } catch (error) {
      if (error instanceof ProfileDatabaseError) {
        return c.json({ error: error.code }, statusForError(error.code));
      }
      return c.json({ error: "INTERNAL_ERROR" }, 500);
    }
  });

  app.delete("/profile/entries/:id", async (c) => {
    const user = await sessionUser(c);
    if (!user) return c.json({ error: "UNAUTHORIZED" }, 401);
    try {
      await deleteOwnedProfileEntry(db, user.id, c.req.param("id"));
      return c.body(null, 204);
    } catch (error) {
      if (error instanceof ProfileDatabaseError) {
        return c.json({ error: error.code }, statusForError(error.code));
      }
      return c.json({ error: "INTERNAL_ERROR" }, 500);
    }
  });
}
