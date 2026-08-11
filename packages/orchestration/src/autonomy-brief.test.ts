import { describe, expect, it } from "vitest";
import type { BusinessProfile, ProfileEntry } from "@sochestral/database";
import {
  AUTONOMY_SCHEDULE_POST_CAP,
  buildAutonomyBrief,
  buildPublishAtCandidates,
  coverageDayOffsets,
  resolveAutonomyTimeZone,
} from "./autonomy-brief.js";
import { playbookFor } from "./platform-playbooks.js";

function profile(overrides: Partial<BusinessProfile> = {}): BusinessProfile {
  const now = new Date();
  return {
    id: "bp_1",
    userId: "user_1",
    businessName: "Acme Tools",
    businessDescription: "Hand tools for makers",
    websiteUrl: null,
    targetAudience: "makers and small shops",
    industry: "hardware",
    setupStatus: "complete",
    setupStep: "done",
    competitorsSkipped: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function entry(
  partial: Partial<ProfileEntry> &
    Pick<ProfileEntry, "category" | "body">,
): ProfileEntry {
  const now = new Date();
  return {
    id: partial.id ?? `entry_${partial.category}_${Math.random()}`,
    userId: "user_1",
    title: partial.title ?? null,
    status: "active",
    source: "setup",
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function distinctUtcDates(isos: string[]): string[] {
  return [
    ...new Set(
      isos.map((iso) => new Date(iso).toISOString().slice(0, 10)),
    ),
  ].sort();
}

describe("coverageDayOffsets", () => {
  it("covers about 85% of a 7-day horizon with spaced offsets", () => {
    const offsets = coverageDayOffsets(7);
    expect(offsets.length).toBe(6);
    expect(offsets[0]).toBe(0);
    expect(offsets.at(-1)).toBe(6);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });
});

describe("buildAutonomyBrief", () => {
  it("refuses when the profile minimum is incomplete", () => {
    const brief = buildAutonomyBrief({
      profile: profile({ businessName: null, setupStatus: "in_progress" }),
      activeEntries: [],
      compiledNote: "",
      minimumComplete: false,
      requestedPlatforms: [],
      connectedPlatforms: ["threads"],
      occupiedSlots: [],
    });
    expect(brief.ok).toBe(false);
    if (!brief.ok) {
      expect(brief.refuseReason).toMatch(/setup/i);
    }
  });

  it("refuses when no connected platforms match", () => {
    const brief = buildAutonomyBrief({
      profile: profile(),
      activeEntries: [
        entry({ category: "tone", body: "Direct and practical" }),
        entry({
          category: "competitor",
          title: "RivalCo",
          body: "Loud discount ads",
        }),
      ],
      compiledNote: "Name: Acme",
      minimumComplete: true,
      requestedPlatforms: ["instagram"],
      connectedPlatforms: ["threads"],
      occupiedSlots: [],
    });
    expect(brief.ok).toBe(false);
    if (!brief.ok) {
      expect(brief.refuseReason).toMatch(/connected/i);
    }
  });

  it("builds candidates that skip occupied hours and include competitors", () => {
    const now = new Date("2026-08-10T08:00:00.000Z");
    const occupiedAt = "2026-08-10T09:00:00.000Z";
    const brief = buildAutonomyBrief({
      profile: profile(),
      activeEntries: [
        entry({ category: "tone", body: "Direct and practical" }),
        entry({
          category: "competitor",
          title: "RivalCo",
          body: "Loud discount ads",
        }),
        entry({
          category: "cadence",
          body: "3 posts per week on Threads",
        }),
      ],
      compiledNote: "Name: Acme Tools\n## tone\n- Direct",
      minimumComplete: true,
      requestedPlatforms: ["threads"],
      connectedPlatforms: ["threads"],
      occupiedSlots: [
        { platform: "threads", scheduledAt: occupiedAt, captionPreview: "Busy" },
      ],
      timeZone: "UTC",
      now,
      userMessage: "Manage my posting this week, decide everything yourself",
    });
    expect(brief.ok).toBe(true);
    if (!brief.ok) return;
    expect(brief.schedulePostCap).toBe(AUTONOMY_SCHEDULE_POST_CAP);
    expect(brief.text).toContain("RivalCo");
    expect(brief.text).toContain("publishAt candidates");
    expect(brief.text).toMatch(/do not collapse schedules/i);
    expect(brief.candidates.length).toBeGreaterThan(0);
    expect(
      brief.candidates.some((candidate) => candidate.publishAt === occupiedAt),
    ).toBe(false);
  });
});

describe("buildPublishAtCandidates", () => {
  it("respects the max candidate cap", () => {
    const candidates = buildPublishAtCandidates({
      platforms: ["threads", "linkedin_personal"],
      activeEntries: [],
      occupiedSlots: [],
      timeZone: "UTC",
      now: new Date("2026-08-10T06:00:00.000Z"),
      horizonDays: 7,
      maxCandidates: 3,
    });
    expect(candidates.length).toBeLessThanOrEqual(3);
  });

  it("spreads a week horizon across many distinct days for Threads and LinkedIn", () => {
    const candidates = buildPublishAtCandidates({
      platforms: ["threads", "linkedin_personal"],
      activeEntries: [
        entry({ category: "cadence", body: "5 posts per week" }),
      ],
      occupiedSlots: [],
      timeZone: "UTC",
      now: new Date("2026-08-10T06:00:00.000Z"),
      horizonDays: 7,
      maxCandidates: 14,
    });
    const dates = distinctUtcDates(candidates.map((c) => c.publishAt));
    expect(dates.length).toBeGreaterThanOrEqual(5);
    expect(dates[0]).toBe("2026-08-10");
    // Should not collapse into only the first two calendar days.
    expect(dates.some((date) => date >= "2026-08-13")).toBe(true);
  });

  it("never exceeds maxPostsPerDay for a platform on one date", () => {
    const candidates = buildPublishAtCandidates({
      platforms: ["threads", "linkedin_personal"],
      activeEntries: [
        entry({ category: "cadence", body: "7 posts per week" }),
      ],
      occupiedSlots: [],
      timeZone: "UTC",
      now: new Date("2026-08-10T06:00:00.000Z"),
      horizonDays: 7,
      maxCandidates: 14,
    });
    const byPlatformDay = new Map<string, number>();
    for (const candidate of candidates) {
      const day = candidate.publishAt.slice(0, 10);
      const key = `${candidate.platform}|${day}`;
      byPlatformDay.set(key, (byPlatformDay.get(key) ?? 0) + 1);
      expect(byPlatformDay.get(key)!).toBeLessThanOrEqual(
        playbookFor(candidate.platform).maxPostsPerDay,
      );
    }
  });

  it("skips occupied early slots and still lands later in the week", () => {
    const now = new Date("2026-08-10T06:00:00.000Z");
    const occupied = [
      "2026-08-10T09:00:00.000Z",
      "2026-08-10T12:00:00.000Z",
      "2026-08-10T17:00:00.000Z",
      "2026-08-11T09:00:00.000Z",
      "2026-08-11T12:00:00.000Z",
      "2026-08-11T17:00:00.000Z",
    ].map((scheduledAt) => ({ platform: "threads", scheduledAt }));
    const candidates = buildPublishAtCandidates({
      platforms: ["threads"],
      activeEntries: [
        entry({ category: "cadence", body: "3 posts per week" }),
      ],
      occupiedSlots: occupied,
      timeZone: "UTC",
      now,
      horizonDays: 7,
      maxCandidates: 14,
    });
    expect(candidates.length).toBeGreaterThan(0);
    expect(
      candidates.every((c) => !occupied.some((o) => o.scheduledAt === c.publishAt)),
    ).toBe(true);
    const dates = distinctUtcDates(candidates.map((c) => c.publishAt));
    expect(dates.some((date) => date >= "2026-08-12")).toBe(true);
  });
});

describe("resolveAutonomyTimeZone", () => {
  it("reads an IANA zone from profile entries and falls back to UTC", () => {
    expect(
      resolveAutonomyTimeZone([
        entry({
          category: "cadence",
          body: "3 posts per week in Africa/Lagos mornings",
        }),
      ]),
    ).toBe("Africa/Lagos");
    expect(
      resolveAutonomyTimeZone([
        entry({ category: "cadence", body: "3 posts per week" }),
      ]),
    ).toBe("UTC");
  });
});
