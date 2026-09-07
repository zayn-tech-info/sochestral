import type {
  BusinessProfile,
  ProfileEntry,
  TargetPlatform,
} from "@sochestral/database";
import { playbookFor, type PlatformPlaybook } from "./platform-playbooks.js";

export const AUTONOMY_DEFAULT_HORIZON_DAYS = 7;
/** Fraction of horizon days that should receive at least one candidate slot. */
export const AUTONOMY_COVERAGE_RATIO = 0.85;
export const AUTONOMY_SCHEDULE_POST_CAP = 1;
export const STANDARD_SCHEDULE_POST_CAP = 1;

const IANA_TIME_ZONE_RE =
  /\b(?:Africa|America|Antarctica|Asia|Atlantic|Australia|Europe|Indian|Pacific)\/(?:[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)?)\b/;

/**
 * Prefer an IANA zone mentioned in active profile entries (cadence / brand facts).
 * Falls back to UTC when none is configured — there is no separate profile TZ column yet.
 */
export function resolveAutonomyTimeZone(
  entries: Array<{ title?: string | null; body: string }>,
  fallback = "UTC",
): string {
  for (const entry of entries) {
    const text = `${entry.title ?? ""} ${entry.body}`;
    const match = text.match(IANA_TIME_ZONE_RE);
    if (!match?.[0]) continue;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: match[0] });
      return match[0];
    } catch {
      // Invalid IANA id — keep searching.
    }
  }
  return fallback;
}

export type OccupiedSlot = {
  platform: TargetPlatform | string;
  scheduledAt: string;
  captionPreview?: string | null;
};

export type AutonomyBriefInput = {
  profile: BusinessProfile;
  activeEntries: ProfileEntry[];
  compiledNote: string;
  minimumComplete: boolean;
  requestedPlatforms: TargetPlatform[];
  connectedPlatforms: TargetPlatform[];
  occupiedSlots: OccupiedSlot[];
  /** IANA timezone for heuristic wall-clock hours. Defaults to UTC. */
  timeZone?: string;
  now?: Date;
  userMessage?: string;
  /** User rejected a prior plan; steer away from previous slots/topics. */
  redoFeedback?: string;
  avoidPublishAts?: string[];
  contentPlanNote?: string | null;
  researchSummary?: string | null;
  horizonDays?: number;
};

export type PublishAtCandidate = {
  platform: TargetPlatform;
  publishAt: string;
  reason: string;
};

export type AutonomyBrief = {
  ok: true;
  text: string;
  platforms: TargetPlatform[];
  horizonDays: number;
  candidates: PublishAtCandidate[];
  schedulePostCap: number;
} | {
  ok: false;
  refuseReason: string;
  text: string;
};

export function parseHorizonDays(message: string | undefined, fallback: number): number {
  if (!message) return fallback;
  const lower = message.toLowerCase();
  const daysMatch = lower.match(/\b(?:next|for|over)\s+(\d{1,2})\s+days?\b/);
  if (daysMatch) {
    const n = Number(daysMatch[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 30) return n;
  }
  const weeksMatch = lower.match(/\b(?:next|for|over)\s+(\d{1,2})\s+weeks?\b/);
  if (weeksMatch) {
    const n = Number(weeksMatch[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 4) return n * 7;
  }
  if (/\b(?:this|next)\s+week\b/.test(lower) || /\b7\s+days?\b/.test(lower)) {
    return 7;
  }
  if (/\b(?:this|next)\s+month\b/.test(lower)) return 14;
  if (/\btoday\b/.test(lower) || /\btomorrow\b/.test(lower)) return 2;
  return fallback;
}

function postsPerWeekFromCadence(
  entries: ProfileEntry[],
  playbook: PlatformPlaybook,
): number {
  const cadence = entries.filter((entry) => entry.category === "cadence");
  for (const entry of cadence) {
    const body = `${entry.title ?? ""} ${entry.body}`.toLowerCase();
    const perWeek = body.match(
      /(\d{1,2})\s*(?:x|times?|posts?)\s*(?:per|a|\/)\s*week/,
    );
    if (perWeek) {
      const n = Number(perWeek[1]);
      if (Number.isFinite(n) && n >= 1 && n <= 14) return n;
    }
    const perDay = body.match(
      /(\d{1,2})\s*(?:x|times?|posts?)\s*(?:per|a|\/)\s*day/,
    );
    if (perDay) {
      const n = Number(perDay[1]);
      if (Number.isFinite(n) && n >= 1 && n <= 5) return Math.min(14, n * 5);
    }
  }
  return playbook.defaultPostsPerWeek;
}

/** Format a Date as YYYY-MM-DD in a timezone (en-CA yields ISO date). */
function dateKeyInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function zonedDateTimeToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): string {
  // Iterate a UTC guess until the zoned wall clock matches.
  let guess = Date.UTC(year, month - 1, day, hour, 0, 0);
  for (let i = 0; i < 4; i += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date(guess));
    const get = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? "0");
    const y = get("year");
    const m = get("month");
    const d = get("day");
    let h = get("hour");
    // Some engines emit 24 for midnight.
    if (h === 24) h = 0;
    const asUtc = Date.UTC(y, m - 1, d, h, 0, 0);
    const target = Date.UTC(year, month - 1, day, hour, 0, 0);
    const delta = target - asUtc;
    guess += delta;
    if (delta === 0) break;
  }
  return new Date(guess).toISOString();
}

function occupiedKeys(slots: OccupiedSlot[]): Set<string> {
  const keys = new Set<string>();
  for (const slot of slots) {
    const ms = Date.parse(slot.scheduledAt);
    if (!Number.isFinite(ms)) continue;
    // Bucket to the hour to avoid stacking.
    const bucket = new Date(ms);
    bucket.setUTCMinutes(0, 0, 0);
    keys.add(`${slot.platform}|${bucket.toISOString()}`);
  }
  return keys;
}

function themeHints(entries: ProfileEntry[]): string[] {
  return entries
    .filter((entry) =>
      entry.category === "brand_fact" ||
      entry.category === "skill" ||
      entry.category === "audience",
    )
    .slice(0, 6)
    .map((entry) =>
      entry.title ? `${entry.title}: ${entry.body}` : entry.body,
    );
}

function competitorLines(entries: ProfileEntry[]): string[] {
  return entries
    .filter((entry) => entry.category === "competitor")
    .slice(0, 6)
    .map((entry) =>
      entry.title ? `${entry.title}: ${entry.body}` : entry.body,
    );
}

/**
 * Day offsets covering about AUTONOMY_COVERAGE_RATIO of the horizon,
 * evenly spaced so a week ask does not collapse into day 0–1.
 */
export function coverageDayOffsets(
  horizonDays: number,
  coverageRatio: number = AUTONOMY_COVERAGE_RATIO,
): number[] {
  const horizon = Math.max(1, Math.floor(horizonDays));
  const coverageDays = Math.max(
    1,
    Math.min(horizon, Math.ceil(horizon * coverageRatio)),
  );
  if (coverageDays === 1) return [0];
  if (coverageDays >= horizon) {
    return Array.from({ length: horizon }, (_, index) => index);
  }
  const offsets: number[] = [];
  for (let i = 0; i < coverageDays; i += 1) {
    offsets.push(Math.round((i * (horizon - 1)) / (coverageDays - 1)));
  }
  return [...new Set(offsets)].sort((a, b) => a - b);
}

function rotateOffsets(offsets: number[], shift: number): number[] {
  if (offsets.length === 0) return offsets;
  const start = ((shift % offsets.length) + offsets.length) % offsets.length;
  return [...offsets.slice(start), ...offsets.slice(0, start)];
}

export function resolveAutonomyPlatforms(input: {
  requestedPlatforms: TargetPlatform[];
  connectedPlatforms: TargetPlatform[];
}): TargetPlatform[] {
  const connected = new Set(input.connectedPlatforms);
  if (input.requestedPlatforms.length > 0) {
    return input.requestedPlatforms.filter((platform) => connected.has(platform));
  }
  return input.connectedPlatforms.filter(
    (platform) =>
      platform === "threads" ||
      platform === "linkedin_personal" ||
      platform === "instagram",
  );
}

export function buildPublishAtCandidates(input: {
  platforms: TargetPlatform[];
  activeEntries: ProfileEntry[];
  occupiedSlots: OccupiedSlot[];
  timeZone: string;
  now: Date;
  horizonDays: number;
  maxCandidates: number;
}): PublishAtCandidate[] {
  const occupied = occupiedKeys(input.occupiedSlots);
  const candidates: PublishAtCandidate[] = [];
  const dayOffsets = coverageDayOffsets(input.horizonDays);
  let remainingBudget = input.maxCandidates;

  for (let platformIndex = 0; platformIndex < input.platforms.length; platformIndex += 1) {
    if (remainingBudget <= 0) break;
    const platform = input.platforms[platformIndex]!;
    const playbook = playbookFor(platform);
    const weekly = postsPerWeekFromCadence(input.activeEntries, playbook);
    const scaledWeekly = Math.max(1, Math.ceil((weekly * input.horizonDays) / 7));
    const targetCount = Math.min(
      remainingBudget,
      scaledWeekly,
      dayOffsets.length * playbook.maxPostsPerDay,
    );
    const orderedDays = rotateOffsets(dayOffsets, platformIndex);
    const postsOnDay = new Map<number, number>();
    let found = 0;

    // Passes place at most one slot per day, then revisit for maxPostsPerDay > 1.
    for (let pass = 0; pass < playbook.maxPostsPerDay && found < targetCount; pass += 1) {
      for (const dayOffset of orderedDays) {
        if (found >= targetCount) break;
        const onDay = postsOnDay.get(dayOffset) ?? 0;
        if (onDay >= playbook.maxPostsPerDay) continue;

        const day = new Date(input.now.getTime() + dayOffset * 86_400_000);
        const key = dateKeyInZone(day, input.timeZone);
        const [y, m, d] = key.split("-").map(Number) as [number, number, number];
        // Prefer a different hour on later passes.
        const hours = [
          ...playbook.preferredHoursLocal.slice(pass),
          ...playbook.preferredHoursLocal.slice(0, pass),
        ];

        let placed = false;
        for (const hour of hours) {
          const iso = zonedDateTimeToUtcIso(y, m, d, hour, input.timeZone);
          const ms = Date.parse(iso);
          if (!Number.isFinite(ms) || ms <= input.now.getTime() + 5 * 60_000) {
            continue;
          }
          const bucket = new Date(ms);
          bucket.setUTCMinutes(0, 0, 0);
          const occKey = `${platform}|${bucket.toISOString()}`;
          if (occupied.has(occKey)) continue;
          if (
            candidates.some(
              (candidate) =>
                candidate.platform === platform && candidate.publishAt === iso,
            )
          ) {
            continue;
          }
          occupied.add(occKey);
          postsOnDay.set(dayOffset, onDay + 1);
          candidates.push({
            platform,
            publishAt: iso,
            reason: `${playbook.label} day+${dayOffset} ${hour}:00 ${input.timeZone} (spread ~${Math.round(AUTONOMY_COVERAGE_RATIO * 100)}% of ${input.horizonDays}d, cadence ~${weekly}/week, max ${playbook.maxPostsPerDay}/day)`,
          });
          found += 1;
          remainingBudget -= 1;
          placed = true;
          break;
        }
        void placed;
      }
    }
  }

  return candidates
    .sort((a, b) => a.publishAt.localeCompare(b.publishAt))
    .slice(0, input.maxCandidates);
}

export function buildAutonomyBrief(input: AutonomyBriefInput): AutonomyBrief {
  const timeZone = input.timeZone?.trim() || "UTC";
  const now = input.now ?? new Date();
  const horizonDays =
    input.horizonDays ??
    parseHorizonDays(input.userMessage, AUTONOMY_DEFAULT_HORIZON_DAYS);

  if (!input.minimumComplete) {
    const refuseReason =
      "Business profile setup is incomplete. Finish the onboarding wizard (name, description, who you are, skills, platforms, and attribution) before autonomous scheduling.";
    return { ok: false, refuseReason, text: refuseReason };
  }

  const platforms = resolveAutonomyPlatforms({
    requestedPlatforms: input.requestedPlatforms,
    connectedPlatforms: input.connectedPlatforms,
  });

  if (platforms.length === 0) {
    const refuseReason =
      input.requestedPlatforms.length > 0
        ? "None of the requested platforms are connected. Connect an account in Connectors, then ask again."
        : "No connected social accounts. Connect Threads, LinkedIn Personal, or Instagram first.";
    return { ok: false, refuseReason, text: refuseReason };
  }

  const candidates = buildPublishAtCandidates({
    platforms,
    activeEntries: input.activeEntries,
    occupiedSlots: [
      ...input.occupiedSlots,
      ...(input.avoidPublishAts ?? []).flatMap((scheduledAt) =>
        platforms.map((platform) => ({ platform, scheduledAt })),
      ),
    ],
    timeZone,
    now,
    horizonDays,
    maxCandidates: AUTONOMY_SCHEDULE_POST_CAP,
  });

  if (candidates.length === 0) {
    const refuseReason =
      "No free heuristic slots in the planning window (calendar may be full). Free a slot or widen the window, then ask again.";
    return { ok: false, refuseReason, text: refuseReason };
  }

  const competitors = competitorLines(input.activeEntries);
  const themes = themeHints(input.activeEntries);
  const playbookBlocks = platforms.map((platform) => {
    const book = playbookFor(platform);
    return [
      `### ${book.label}`,
      `Forms: ${book.postForms.join("; ")}`,
      `Selling: ${book.sellingNotes}`,
      `Default cadence if none set: ${book.defaultPostsPerWeek}/week (max ${book.maxPostsPerDay}/day)`,
    ].join("\n");
  });

  const occupancy =
    input.occupiedSlots.length === 0
      ? "None in window."
      : input.occupiedSlots
          .slice(0, 20)
          .map(
            (slot) =>
              `- ${slot.platform} @ ${slot.scheduledAt}${
                slot.captionPreview ? ` (${slot.captionPreview.slice(0, 80)})` : ""
              }`,
          )
          .join("\n");

  const candidateLines = candidates
    .map(
      (c) =>
        `- ${c.platform} @ ${c.publishAt} — ${c.reason}`,
    )
    .join("\n");

  const coverageDays = coverageDayOffsets(horizonDays).length;
  const redoBlock =
    input.redoFeedback?.trim()
      ? [
          "",
          "## Redo feedback (authoritative)",
          input.redoFeedback.trim(),
          input.avoidPublishAts?.length
            ? `Avoid reusing these previous publishAt values: ${input.avoidPublishAts.join(", ")}`
            : "Avoid repeating the same times and near-duplicate captions from the rejected plan.",
        ]
      : [];
  const text = [
    "# Autonomy context brief (authoritative)",
    "Use only this brief for positioning, competitors, formats, and publishAt choices.",
    "Do not invent competitors, engagement metrics, or times outside the candidate list.",
    "Prefer candidate publishAt values; if you must adjust, stay inside the horizon and avoid occupied hours.",
    `Horizon days: ${horizonDays}`,
    `Coverage target: about ${Math.round(AUTONOMY_COVERAGE_RATIO * 100)}% of the range (${coverageDays} of ${horizonDays} days) — candidates are already spread; keep that spread.`,
    `Timezone for heuristics: ${timeZone}`,
    `schedule_post cap this turn: ${AUTONOMY_SCHEDULE_POST_CAP}`,
    ...redoBlock,
    "",
    "## Business profile",
    input.compiledNote.trim() || "No compiled note.",
    "",
    "## Competitors (profile entries only)",
    competitors.length > 0
      ? competitors.map((line) => `- ${line}`).join("\n")
      : "None listed (competitors skipped or empty). Differentiate via brand description and tone.",
    "",
    "## Theme hints",
    themes.length > 0
      ? themes.map((line) => `- ${line}`).join("\n")
      : "Derive themes from the business description and tone.",
    "",
    "## Platform playbooks",
    ...playbookBlocks,
    "",
    "## Existing calendar occupancy",
    occupancy,
    "",
    "## publishAt candidates (UTC ISO)",
    candidateLines,
    "",
    "",
    "## Conversation plan",
    input.contentPlanNote?.trim() || "No stored plan yet. Use the user message and profile.",
    "",
    "## Live web research",
    input.researchSummary?.trim() ||
      "No live web notes. Do not invent citations. Still write like a person, not a generic AI post.",
    "",
    "## Required actions this turn",
    "- Write captions like a real person in this niche: specific, conversational, grounded in the research and plan. No generic AI listicles or empty inspiration posts.",
    "- Write original captions that fit profile tone and stand out from listed competitors.",
    "- Call schedule_post for each chosen candidate (or a near free slot on the same spread day), up to the cap.",
    "- Keep the calendar spread: when the horizon is multi-day, do not collapse schedules into the first one or two days.",
    "- Respect platform forms (Instagram needs media; Threads and LinkedIn can be text-first).",
    ...(input.redoFeedback?.trim()
      ? [
          "- This is a redo: prior rejected schedules were canceled. Use the new candidate spread and change topics/angles where the user asked.",
        ]
      : []),
    "- Do not call prepare_review for autonomy scheduling.",
    "- After tools succeed, briefly explain topic, format, and timing choices from this brief.",
    "- Tell the user they can open Calendar or Scheduled Posts to cancel or change plans.",
  ].join("\n");

  return {
    ok: true,
    text,
    platforms,
    horizonDays,
    candidates,
    schedulePostCap: AUTONOMY_SCHEDULE_POST_CAP,
  };
}
