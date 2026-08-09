import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  createBusinessProfileId,
  createProfileEntryId,
} from "./ids.js";
import {
  businessProfiles,
  profileEntries,
  type BusinessProfile,
  type ProfileEntry,
  type ProfileEntryCategory,
  type ProfileEntrySource,
  type ProfileEntryStatus,
  type SetupStatus,
} from "./schema.js";

export class ProfileDatabaseError extends Error {
  constructor(
    readonly code:
      | "PROFILE_NOT_FOUND"
      | "ENTRY_NOT_FOUND"
      | "INVALID_INPUT"
      | "INVALID_TRANSITION",
  ) {
    super(code);
    this.name = "ProfileDatabaseError";
  }
}

const PROFILE_CATEGORIES = new Set<ProfileEntryCategory>([
  "tone",
  "do_not",
  "cadence",
  "competitor",
  "audience",
  "skill",
  "brand_fact",
]);

const ENTRY_STATUSES = new Set<ProfileEntryStatus>([
  "proposed",
  "active",
  "rejected",
  "archived",
]);

const ENTRY_SOURCES = new Set<ProfileEntrySource>([
  "setup",
  "settings",
  "operator_confirm",
  "research",
]);

const SECRET_SHAPED =
  /\b(?:sk|pk|api[_-]?key|secret|token|bearer)\s*[:=]\s*\S+/gi;

export function redactProfileBody(body: string): string {
  return body.replace(SECRET_SHAPED, "[redacted]");
}

export function mapUnknownCategory(label: string): ProfileEntryCategory {
  const normalized = label.trim().toLowerCase().replace(/\s+/g, "_");
  if (PROFILE_CATEGORIES.has(normalized as ProfileEntryCategory)) {
    return normalized as ProfileEntryCategory;
  }
  if (
    normalized.includes("do_not") ||
    normalized.includes("dont") ||
    normalized.includes("never") ||
    normalized.includes("banned")
  ) {
    return "do_not";
  }
  return "brand_fact";
}

function emptyProfile(userId: string): BusinessProfile {
  const now = new Date();
  return {
    id: "",
    userId,
    businessName: null,
    businessDescription: null,
    websiteUrl: null,
    targetAudience: null,
    industry: null,
    setupStatus: "not_started",
    setupStep: null,
    competitorsSkipped: false,
    createdAt: now,
    updatedAt: now,
  };
}

export async function ensureBusinessProfile(
  db: Database["db"],
  userId: string,
): Promise<BusinessProfile> {
  const [existing] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.userId, userId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(businessProfiles)
    .values({
      id: createBusinessProfileId(),
      userId,
      setupStatus: "not_started",
      competitorsSkipped: false,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [again] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.userId, userId))
    .limit(1);
  if (!again) throw new ProfileDatabaseError("PROFILE_NOT_FOUND");
  return again;
}

export async function getBusinessProfile(
  db: Database["db"],
  userId: string,
): Promise<BusinessProfile> {
  const [row] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.userId, userId))
    .limit(1);
  return row ?? emptyProfile(userId);
}

export type ProfileIdentityPatch = {
  businessName?: string | null;
  businessDescription?: string | null;
  websiteUrl?: string | null;
  targetAudience?: string | null;
  industry?: string | null;
  setupStatus?: SetupStatus;
  setupStep?: string | null;
  competitorsSkipped?: boolean;
  redoSetup?: boolean;
  confirmReset?: boolean;
};

export async function patchBusinessProfile(
  db: Database["db"],
  userId: string,
  patch: ProfileIdentityPatch,
): Promise<BusinessProfile> {
  const current = await ensureBusinessProfile(db, userId);
  const next: Partial<BusinessProfile> = { updatedAt: new Date() };

  if (patch.redoSetup) {
    next.setupStatus = "in_progress";
    next.setupStep = "name";
    if (patch.confirmReset) {
      await db
        .delete(profileEntries)
        .where(eq(profileEntries.userId, userId));
      next.businessName = null;
      next.businessDescription = null;
      next.websiteUrl = null;
      next.targetAudience = null;
      next.industry = null;
      next.competitorsSkipped = false;
    }
  }

  if (patch.businessName !== undefined) {
    next.businessName = patch.businessName?.trim() || null;
  }
  if (patch.businessDescription !== undefined) {
    next.businessDescription = patch.businessDescription?.trim() || null;
  }
  if (patch.websiteUrl !== undefined) {
    next.websiteUrl = patch.websiteUrl?.trim() || null;
  }
  if (patch.targetAudience !== undefined) {
    next.targetAudience = patch.targetAudience?.trim() || null;
  }
  if (patch.industry !== undefined) {
    next.industry = patch.industry?.trim() || null;
  }
  if (patch.setupStep !== undefined) {
    next.setupStep = patch.setupStep;
  }
  if (patch.competitorsSkipped !== undefined) {
    next.competitorsSkipped = patch.competitorsSkipped;
  }
  if (patch.setupStatus !== undefined) {
    const from = (next.setupStatus ?? current.setupStatus) as SetupStatus;
    const to = patch.setupStatus;
    if (!isValidSetupTransition(from, to) && !patch.redoSetup) {
      throw new ProfileDatabaseError("INVALID_TRANSITION");
    }
    next.setupStatus = to;
  }

  const [updated] = await db
    .update(businessProfiles)
    .set(next)
    .where(eq(businessProfiles.userId, userId))
    .returning();
  if (!updated) throw new ProfileDatabaseError("PROFILE_NOT_FOUND");
  return updated;
}

function isValidSetupTransition(from: SetupStatus, to: SetupStatus): boolean {
  if (from === to) return true;
  if (from === "not_started" && (to === "in_progress" || to === "complete")) {
    return true;
  }
  if (from === "in_progress" && to === "complete") return true;
  if (from === "complete" && to === "in_progress") return true;
  return false;
}

export type CreateProfileEntryInput = {
  userId: string;
  category: ProfileEntryCategory | string;
  title?: string | null;
  body: string;
  status?: ProfileEntryStatus;
  source: ProfileEntrySource;
  sortOrder?: number;
};

export async function createProfileEntry(
  db: Database["db"],
  input: CreateProfileEntryInput,
): Promise<ProfileEntry> {
  const body = redactProfileBody(input.body.trim());
  if (!body) throw new ProfileDatabaseError("INVALID_INPUT");
  const category = mapUnknownCategory(String(input.category));
  const status = input.status ?? "active";
  if (!ENTRY_STATUSES.has(status) || !ENTRY_SOURCES.has(input.source)) {
    throw new ProfileDatabaseError("INVALID_INPUT");
  }
  await ensureBusinessProfile(db, input.userId);
  const [row] = await db
    .insert(profileEntries)
    .values({
      id: createProfileEntryId(),
      userId: input.userId,
      category,
      title: input.title?.trim() || null,
      body,
      status,
      source: input.source,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  return row!;
}

export async function getOwnedProfileEntry(
  db: Database["db"],
  userId: string,
  entryId: string,
): Promise<ProfileEntry | null> {
  const [row] = await db
    .select()
    .from(profileEntries)
    .where(and(eq(profileEntries.id, entryId), eq(profileEntries.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function patchOwnedProfileEntry(
  db: Database["db"],
  userId: string,
  entryId: string,
  patch: {
    title?: string | null;
    body?: string;
    status?: ProfileEntryStatus;
    sortOrder?: number;
  },
): Promise<ProfileEntry> {
  const existing = await getOwnedProfileEntry(db, userId, entryId);
  if (!existing) throw new ProfileDatabaseError("ENTRY_NOT_FOUND");
  const next: Partial<ProfileEntry> = { updatedAt: new Date() };
  if (patch.title !== undefined) next.title = patch.title?.trim() || null;
  if (patch.body !== undefined) {
    const body = redactProfileBody(patch.body.trim());
    if (!body) throw new ProfileDatabaseError("INVALID_INPUT");
    next.body = body;
  }
  if (patch.status !== undefined) {
    if (!ENTRY_STATUSES.has(patch.status)) {
      throw new ProfileDatabaseError("INVALID_INPUT");
    }
    next.status = patch.status;
  }
  if (patch.sortOrder !== undefined) next.sortOrder = patch.sortOrder;
  const [updated] = await db
    .update(profileEntries)
    .set(next)
    .where(and(eq(profileEntries.id, entryId), eq(profileEntries.userId, userId)))
    .returning();
  if (!updated) throw new ProfileDatabaseError("ENTRY_NOT_FOUND");
  return updated;
}

export async function deleteOwnedProfileEntry(
  db: Database["db"],
  userId: string,
  entryId: string,
): Promise<void> {
  const deleted = await db
    .delete(profileEntries)
    .where(and(eq(profileEntries.id, entryId), eq(profileEntries.userId, userId)))
    .returning({ id: profileEntries.id });
  if (deleted.length === 0) throw new ProfileDatabaseError("ENTRY_NOT_FOUND");
}

export type ListProfileEntriesInput = {
  userId: string;
  category?: ProfileEntryCategory;
  status?: ProfileEntryStatus | ProfileEntryStatus[];
  cursor?: string;
  limit?: number;
  includeArchived?: boolean;
};

export async function listProfileEntries(
  db: Database["db"],
  input: ListProfileEntriesInput,
): Promise<{ items: ProfileEntry[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const conditions = [eq(profileEntries.userId, input.userId)];
  if (input.category) {
    if (!PROFILE_CATEGORIES.has(input.category)) {
      throw new ProfileDatabaseError("INVALID_INPUT");
    }
    conditions.push(eq(profileEntries.category, input.category));
  }
  if (input.status) {
    const statuses = Array.isArray(input.status) ? input.status : [input.status];
    conditions.push(inArray(profileEntries.status, statuses));
  } else if (!input.includeArchived) {
    conditions.push(
      inArray(profileEntries.status, ["proposed", "active", "rejected"]),
    );
  }
  if (input.cursor) {
    conditions.push(gt(profileEntries.id, input.cursor));
  }
  const rows = await db
    .select()
    .from(profileEntries)
    .where(and(...conditions))
    .orderBy(
      asc(profileEntries.category),
      asc(profileEntries.sortOrder),
      asc(profileEntries.createdAt),
      asc(profileEntries.id),
    )
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const nextCursor =
    rows.length > limit ? (page[page.length - 1]?.id ?? null) : null;
  return { items: page, nextCursor };
}

export async function listActiveProfileEntries(
  db: Database["db"],
  userId: string,
): Promise<ProfileEntry[]> {
  return db
    .select()
    .from(profileEntries)
    .where(
      and(
        eq(profileEntries.userId, userId),
        eq(profileEntries.status, "active"),
      ),
    )
    .orderBy(
      asc(profileEntries.category),
      asc(profileEntries.sortOrder),
      asc(profileEntries.createdAt),
      asc(profileEntries.id),
    );
}

export async function confirmProposedCompetitors(
  db: Database["db"],
  userId: string,
  selectedIds: string[],
): Promise<ProfileEntry[]> {
  const proposed = await listProfileEntries(db, {
    userId,
    category: "competitor",
    status: "proposed",
    limit: 100,
  });
  const selected = new Set(selectedIds);
  const results: ProfileEntry[] = [];
  for (const entry of proposed.items) {
    const nextStatus: ProfileEntryStatus = selected.has(entry.id)
      ? "active"
      : "rejected";
    results.push(
      await patchOwnedProfileEntry(db, userId, entry.id, { status: nextStatus }),
    );
  }
  return results;
}

export function isMinimumProfileComplete(
  profile: BusinessProfile,
  activeEntries: ProfileEntry[],
): boolean {
  const name = profile.businessName?.trim();
  const description = profile.businessDescription?.trim();
  if (!name || !description) return false;
  const hasCompetitor =
    profile.competitorsSkipped ||
    activeEntries.some((e) => e.category === "competitor");
  const hasTone = activeEntries.some((e) => e.category === "tone");
  return hasCompetitor && hasTone;
}

export function compileProfileNote(
  profile: BusinessProfile,
  activeEntries: ProfileEntry[],
): string {
  const lines: string[] = ["# Business profile"];
  if (profile.businessName) lines.push(`Name: ${profile.businessName}`);
  if (profile.businessDescription) {
    lines.push(`Description: ${profile.businessDescription}`);
  }
  if (profile.websiteUrl) lines.push(`Website: ${profile.websiteUrl}`);
  if (profile.industry) lines.push(`Industry: ${profile.industry}`);
  if (profile.targetAudience) {
    lines.push(`Target audience: ${profile.targetAudience}`);
  }
  const byCategory = new Map<string, ProfileEntry[]>();
  for (const entry of activeEntries) {
    const list = byCategory.get(entry.category) ?? [];
    list.push(entry);
    byCategory.set(entry.category, list);
  }
  const order: ProfileEntryCategory[] = [
    "tone",
    "audience",
    "competitor",
    "do_not",
    "cadence",
    "skill",
    "brand_fact",
  ];
  for (const category of order) {
    const items = byCategory.get(category);
    if (!items?.length) continue;
    lines.push("");
    lines.push(`## ${category}`);
    for (const item of items) {
      if (item.title) lines.push(`- ${item.title}: ${item.body}`);
      else lines.push(`- ${item.body}`);
    }
  }
  return lines.join("\n");
}

export async function getCompiledProfile(
  db: Database["db"],
  userId: string,
): Promise<{
  profile: BusinessProfile;
  activeEntries: ProfileEntry[];
  compiledNote: string;
  minimumComplete: boolean;
}> {
  const profile = await ensureBusinessProfile(db, userId);
  const activeEntries = await listActiveProfileEntries(db, userId);
  return {
    profile,
    activeEntries,
    compiledNote: compileProfileNote(profile, activeEntries),
    minimumComplete: isMinimumProfileComplete(profile, activeEntries),
  };
}

export async function tryCompleteSetupIfReady(
  db: Database["db"],
  userId: string,
): Promise<BusinessProfile> {
  const compiled = await getCompiledProfile(db, userId);
  if (!compiled.minimumComplete) return compiled.profile;
  if (compiled.profile.setupStatus === "complete") return compiled.profile;
  return patchBusinessProfile(db, userId, {
    setupStatus: "complete",
    setupStep: "done",
  });
}

export async function countActiveEntriesByCategory(
  db: Database["db"],
  userId: string,
  category: ProfileEntryCategory,
): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(profileEntries)
    .where(
      and(
        eq(profileEntries.userId, userId),
        eq(profileEntries.category, category),
        eq(profileEntries.status, "active"),
      ),
    );
  return row?.value ?? 0;
}
