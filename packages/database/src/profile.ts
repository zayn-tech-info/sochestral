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

export const PERSONA_ROLES = [
  "student",
  "content_creator",
  "business_owner",
  "entrepreneur",
  "freelancer",
  "other",
] as const;
export type PersonaRole = (typeof PERSONA_ROLES)[number];

export const ATTRIBUTION_SOURCES = [
  "twitter",
  "instagram",
  "linkedin",
  "friend",
  "other",
] as const;
export type AttributionSource = (typeof ATTRIBUTION_SOURCES)[number];

export const PRIMARY_PLATFORM_OPTIONS = [
  "threads",
  "linkedin_personal",
  "instagram",
] as const;
export type PrimaryPlatformOption = (typeof PRIMARY_PLATFORM_OPTIONS)[number];

export const SETUP_SKILL_OPTIONS = [
  "Content writing",
  "Brand design",
  "Product marketing",
  "Community",
  "Ads",
  "Founder storytelling",
  "Short-form video",
  "SEO content",
] as const;

export const ONBOARDING_STEPS = [
  "business_details",
  "who_you_are",
  "skills",
  "platforms",
  "attribution",
  "done",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const MIN_DESCRIPTION_WORDS = 30;
const SETUP_SKILLS = new Set<string>(SETUP_SKILL_OPTIONS);

const SECRET_SHAPED =
  /\b(?:sk|pk|api[_-]?key|secret|token|bearer)\s*[:=]\s*\S+/gi;

export function countWords(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function isPersonaRole(value: string): value is PersonaRole {
  return (PERSONA_ROLES as readonly string[]).includes(value);
}

export function isAttributionSource(value: string): value is AttributionSource {
  return (ATTRIBUTION_SOURCES as readonly string[]).includes(value);
}

export function isPrimaryPlatformOption(
  value: string,
): value is PrimaryPlatformOption {
  return (PRIMARY_PLATFORM_OPTIONS as readonly string[]).includes(value);
}

export function isOnboardingStep(value: string): value is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(value);
}

export function normalizePrimaryPlatforms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const next = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => isPrimaryPlatformOption(item));
  return Array.from(new Set(next));
}

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
    personaRole: null,
    personaRoleOther: null,
    primaryPlatforms: [],
    attributionSource: null,
    attributionOther: null,
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
  personaRole?: string | null;
  personaRoleOther?: string | null;
  primaryPlatforms?: string[] | null;
  attributionSource?: string | null;
  attributionOther?: string | null;
  skills?: string[] | null;
  setupStatus?: SetupStatus;
  setupStep?: string | null;
  competitorsSkipped?: boolean;
  redoSetup?: boolean;
  confirmReset?: boolean;
  completeSetup?: boolean;
};

export async function patchBusinessProfile(
  db: Database["db"],
  userId: string,
  patch: ProfileIdentityPatch,
): Promise<BusinessProfile> {
  return db.transaction(async (tx) => {
    return patchBusinessProfileInTransaction(
      tx as unknown as Database["db"],
      userId,
      patch,
    );
  });
}

async function patchBusinessProfileInTransaction(
  db: Database["db"],
  userId: string,
  patch: ProfileIdentityPatch,
): Promise<BusinessProfile> {
  validateProfilePatch(patch);
  const current = await ensureBusinessProfile(db, userId);
  const next: Partial<BusinessProfile> = { updatedAt: new Date() };

  if (patch.redoSetup) {
    next.setupStatus = "in_progress";
    next.setupStep = "business_details";
    if (patch.confirmReset) {
      await db
        .delete(profileEntries)
        .where(eq(profileEntries.userId, userId));
      next.businessName = null;
      next.businessDescription = null;
      next.websiteUrl = null;
      next.targetAudience = null;
      next.industry = null;
      next.personaRole = null;
      next.personaRoleOther = null;
      next.primaryPlatforms = [];
      next.attributionSource = null;
      next.attributionOther = null;
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
  if (patch.personaRole !== undefined) {
    const role = patch.personaRole?.trim() || null;
    if (role && !isPersonaRole(role)) {
      throw new ProfileDatabaseError("INVALID_INPUT");
    }
    next.personaRole = role;
    if (role !== "other") next.personaRoleOther = null;
  }
  if (patch.personaRoleOther !== undefined) {
    next.personaRoleOther = patch.personaRoleOther?.trim() || null;
  }
  if (patch.primaryPlatforms !== undefined) {
    next.primaryPlatforms = normalizePrimaryPlatforms(patch.primaryPlatforms);
  }
  if (patch.attributionSource !== undefined) {
    const source = patch.attributionSource?.trim() || null;
    if (source && !isAttributionSource(source)) {
      throw new ProfileDatabaseError("INVALID_INPUT");
    }
    next.attributionSource = source;
    if (source !== "other") next.attributionOther = null;
  }
  if (patch.attributionOther !== undefined) {
    next.attributionOther = patch.attributionOther?.trim() || null;
  }
  if (patch.setupStep !== undefined) {
    next.setupStep = patch.setupStep;
  }
  if (patch.competitorsSkipped !== undefined) {
    next.competitorsSkipped = patch.competitorsSkipped;
  }
  if (Array.isArray(patch.skills)) {
    await replaceSetupSkills(db, userId, patch.skills);
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

  if (patch.completeSetup) {
    return tryCompleteSetupIfReady(db, userId);
  }

  if (shouldRecheckReadiness(patch) && updated.setupStatus === "complete") {
    const activeEntries = await listActiveProfileEntries(db, userId);
    if (!hasMinimumProfileFields(updated, activeEntries)) {
      const [demoted] = await db
        .update(businessProfiles)
        .set({
          setupStatus: "in_progress",
          setupStep: firstIncompleteSetupStep(updated, activeEntries),
          updatedAt: new Date(),
        })
        .where(eq(businessProfiles.userId, userId))
        .returning();
      if (!demoted) throw new ProfileDatabaseError("PROFILE_NOT_FOUND");
      return demoted;
    }
  }
  return updated;
}

function validateProfilePatch(patch: ProfileIdentityPatch): void {
  if (patch.setupStep !== undefined && patch.setupStep !== null) {
    const step = patch.setupStep.trim();
    if (!step || !isOnboardingStep(step)) {
      throw new ProfileDatabaseError("INVALID_INPUT");
    }
    patch.setupStep = step;
  }
  if (patch.skills !== undefined && patch.skills !== null) {
    if (
      !Array.isArray(patch.skills) ||
      patch.skills.length > SETUP_SKILL_OPTIONS.length
    ) {
      throw new ProfileDatabaseError("INVALID_INPUT");
    }
    for (const skill of patch.skills) {
      if (typeof skill !== "string") {
        throw new ProfileDatabaseError("INVALID_INPUT");
      }
      const trimmed = skill.trim();
      if (!trimmed || !SETUP_SKILLS.has(trimmed)) {
        throw new ProfileDatabaseError("INVALID_INPUT");
      }
    }
  }
}

function shouldRecheckReadiness(patch: ProfileIdentityPatch): boolean {
  return (
    patch.businessName !== undefined ||
    patch.businessDescription !== undefined ||
    patch.personaRole !== undefined ||
    patch.personaRoleOther !== undefined ||
    patch.primaryPlatforms !== undefined ||
    patch.attributionSource !== undefined ||
    patch.attributionOther !== undefined ||
    patch.skills !== undefined
  );
}

async function replaceSetupSkills(
  db: Database["db"],
  userId: string,
  skills: string[],
): Promise<void> {
  const cleaned = Array.from(
    new Set(
      skills
        .map((skill) => skill.trim())
        .filter((skill) => skill.length > 0)
        .slice(0, 20),
    ),
  );
  await db
    .delete(profileEntries)
    .where(
      and(
        eq(profileEntries.userId, userId),
        eq(profileEntries.category, "skill"),
        eq(profileEntries.source, "setup"),
      ),
    );
  for (const [index, skill] of cleaned.entries()) {
    await createProfileEntry(db, {
      userId,
      category: "skill",
      body: skill,
      status: "active",
      source: "setup",
      sortOrder: index,
    });
  }
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
  if (profile.setupStatus === "complete") return true;
  return hasMinimumProfileFields(profile, activeEntries);
}

function hasMinimumProfileFields(
  profile: BusinessProfile,
  activeEntries: ProfileEntry[],
): boolean {
  const name = profile.businessName?.trim();
  const description = profile.businessDescription?.trim() ?? "";
  if (!name || countWords(description) < MIN_DESCRIPTION_WORDS) return false;

  const persona = profile.personaRole?.trim() ?? "";
  if (!isPersonaRole(persona)) return false;
  if (persona === "other" && !(profile.personaRoleOther?.trim())) return false;

  const platforms = normalizePrimaryPlatforms(profile.primaryPlatforms);
  if (platforms.length === 0) return false;

  const attribution = profile.attributionSource?.trim() ?? "";
  if (!isAttributionSource(attribution)) return false;
  if (attribution === "other" && !(profile.attributionOther?.trim())) return false;

  const hasSkill = activeEntries.some((entry) => entry.category === "skill");
  return hasSkill;
}

function firstIncompleteSetupStep(
  profile: BusinessProfile,
  activeEntries: ProfileEntry[],
): OnboardingStep {
  const name = profile.businessName?.trim();
  const description = profile.businessDescription?.trim() ?? "";
  if (!name || countWords(description) < MIN_DESCRIPTION_WORDS) {
    return "business_details";
  }

  const persona = profile.personaRole?.trim() ?? "";
  if (
    !isPersonaRole(persona) ||
    (persona === "other" && !(profile.personaRoleOther?.trim()))
  ) {
    return "who_you_are";
  }

  if (!activeEntries.some((entry) => entry.category === "skill")) {
    return "skills";
  }

  if (normalizePrimaryPlatforms(profile.primaryPlatforms).length === 0) {
    return "platforms";
  }

  const attribution = profile.attributionSource?.trim() ?? "";
  if (
    !isAttributionSource(attribution) ||
    (attribution === "other" && !(profile.attributionOther?.trim()))
  ) {
    return "attribution";
  }

  return "done";
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
  if (profile.personaRole) {
    const personaLabel =
      profile.personaRole === "other" && profile.personaRoleOther
        ? profile.personaRoleOther
        : profile.personaRole.replace(/_/g, " ");
    lines.push(`Who they are: ${personaLabel}`);
  }
  const platforms = normalizePrimaryPlatforms(profile.primaryPlatforms);
  if (platforms.length > 0) {
    lines.push(`Primary platforms: ${platforms.join(", ")}`);
  }
  if (profile.attributionSource) {
    lines.push(
      `Heard about us: ${
        profile.attributionSource === "other" && profile.attributionOther
          ? profile.attributionOther
          : profile.attributionSource
      }`,
    );
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
  if (!hasMinimumProfileFields(compiled.profile, compiled.activeEntries)) {
    const [updated] = await db
      .update(businessProfiles)
      .set({
        setupStatus: "in_progress",
        setupStep: firstIncompleteSetupStep(
          compiled.profile,
          compiled.activeEntries,
        ),
        updatedAt: new Date(),
      })
      .where(eq(businessProfiles.userId, userId))
      .returning();
    if (!updated) throw new ProfileDatabaseError("PROFILE_NOT_FOUND");
    return updated;
  }
  if (compiled.profile.setupStatus === "complete") return compiled.profile;
  const [updated] = await db
    .update(businessProfiles)
    .set({
      setupStatus: "complete",
      setupStep: "done",
      updatedAt: new Date(),
    })
    .where(eq(businessProfiles.userId, userId))
    .returning();
  if (!updated) throw new ProfileDatabaseError("PROFILE_NOT_FOUND");
  return updated;
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
