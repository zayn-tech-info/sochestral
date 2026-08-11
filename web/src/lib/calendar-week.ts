/** Monday start week helpers for the schedule calendar. */

export type CalendarDay = {
  /** YYYY-MM-DD in the active IANA zone */
  key: string;
  /** Local midnight Instant for this day in the zone */
  start: Date;
  /** Inclusive end Instant for this day in the zone */
  end: Date;
  weekdayLabel: string;
  dayOfMonth: number;
  isToday: boolean;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function resolveTimeZone(fallback = "UTC"): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone?.trim() || fallback;
  } catch {
    return fallback;
  }
}

export function zonedYmd(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  if (!year || !month || !day) {
    throw new Error("INVALID_TIMEZONE");
  }
  return { year, month, day };
}

/** Instant for local Y-M-D 00:00:00 in timeZone. */
export function zonedLocalMidnight(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, 12, 0, 0);
  const asLocal = zonedYmd(new Date(guess), timeZone);
  const deltaDays =
    Date.UTC(year, month - 1, day) -
    Date.UTC(asLocal.year, asLocal.month - 1, asLocal.day);
  const noonAligned = guess + deltaDays;
  const hourParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(noonAligned));
  const hour = Number(hourParts.find((p) => p.type === "hour")?.value ?? "12");
  const minute = Number(
    hourParts.find((p) => p.type === "minute")?.value ?? "0",
  );
  const second = Number(
    hourParts.find((p) => p.type === "second")?.value ?? "0",
  );
  return new Date(noonAligned - ((hour * 60 + minute) * 60 + second) * 1000);
}

function weekdayIndexMonday0(date: Date, timeZone: string): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return map[label] ?? 0;
}

export function startOfWeekMonday(anchor: Date, timeZone: string): Date {
  const { year, month, day } = zonedYmd(anchor, timeZone);
  const midnight = zonedLocalMidnight(year, month, day, timeZone);
  const offset = weekdayIndexMonday0(midnight, timeZone);
  return new Date(midnight.getTime() - offset * 24 * 60 * 60 * 1000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function weekRange(
  anchor: Date,
  timeZone: string,
): { from: string; to: string; days: CalendarDay[]; weekLabel: string } {
  const monday = startOfWeekMonday(anchor, timeZone);
  const days: CalendarDay[] = [];
  const today = zonedYmd(new Date(), timeZone);
  const weekdayFmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  });

  for (let i = 0; i < 7; i += 1) {
    const start = addDays(monday, i);
    const { year, month, day } = zonedYmd(start, timeZone);
    const localStart = zonedLocalMidnight(year, month, day, timeZone);
    const next = addDays(localStart, 1);
    days.push({
      key: `${year}-${pad2(month)}-${pad2(day)}`,
      start: localStart,
      end: new Date(next.getTime() - 1),
      weekdayLabel: weekdayFmt.format(localStart),
      dayOfMonth: day,
      isToday:
        year === today.year && month === today.month && day === today.day,
    });
  }

  const sunday = days[6]!;
  const monthFmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return {
    from: days[0]!.start.toISOString(),
    to: sunday.end.toISOString(),
    days,
    weekLabel: `${monthFmt.format(days[0]!.start)} – ${monthFmt.format(sunday.start)}`,
  };
}

export function formatSlotTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatRangeLabel(
  fromIso: string,
  toIso: string,
  timeZone: string,
): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${fmt.format(new Date(fromIso))} – ${fmt.format(new Date(toIso))}`;
}

/** Exactly 30 day windows for the scheduled posts list (spec 0011). */
export const LIST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function forwardListWindow(now = new Date()): { from: string; to: string } {
  const from = now.toISOString();
  const to = new Date(now.getTime() + LIST_WINDOW_MS).toISOString();
  return { from, to };
}

export function backwardListWindow(now = new Date()): {
  from: string;
  to: string;
} {
  const to = now.toISOString();
  const from = new Date(now.getTime() - LIST_WINDOW_MS).toISOString();
  return { from, to };
}

export function shiftListWindow(
  fromIso: string,
  toIso: string,
  direction: "older" | "newer",
): { from: string; to: string } {
  const delta = direction === "older" ? -LIST_WINDOW_MS : LIST_WINDOW_MS;
  return {
    from: new Date(Date.parse(fromIso) + delta).toISOString(),
    to: new Date(Date.parse(toIso) + delta).toISOString(),
  };
}

export function dayKeyForInstant(iso: string, timeZone: string): string {
  const { year, month, day } = zonedYmd(new Date(iso), timeZone);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Keep local clock time; move the calendar day to `dayKey` (YYYY-MM-DD). */
export function moveInstantToDayKey(
  iso: string,
  dayKey: string,
  timeZone: string,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) throw new Error("INVALID_DAY_KEY");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const source = new Date(iso);
  const sourceYmd = zonedYmd(source, timeZone);
  const sourceMidnight = zonedLocalMidnight(
    sourceYmd.year,
    sourceYmd.month,
    sourceYmd.day,
    timeZone,
  );
  const offsetMs = source.getTime() - sourceMidnight.getTime();
  const targetMidnight = zonedLocalMidnight(year, month, day, timeZone);
  return new Date(targetMidnight.getTime() + offsetMs).toISOString();
}

/** Minutes from local midnight for an instant in `timeZone` (0–1439). */
export function minutesFromMidnight(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return Math.min(24 * 60 - 1, Math.max(0, hour * 60 + minute));
}

export function snapMinutes(minutes: number, step = 5): number {
  if (!Number.isFinite(minutes)) return 0;
  const clamped = Math.min(24 * 60 - step, Math.max(0, minutes));
  return Math.round(clamped / step) * step;
}

export const DAY_PX_PER_HOUR = 56;
export const DAY_PX_PER_MINUTE = DAY_PX_PER_HOUR / 60;
export const DAY_TIMELINE_HEIGHT = DAY_PX_PER_HOUR * 24;

export function minutesToPx(minutes: number): number {
  return minutes * DAY_PX_PER_MINUTE;
}

export function pxToMinutes(px: number): number {
  return px / DAY_PX_PER_MINUTE;
}

/** Build an ISO instant for `dayKey` at `minutes` after local midnight. */
export function instantAtDayMinutes(
  dayKey: string,
  minutes: number,
  timeZone: string,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) throw new Error("INVALID_DAY_KEY");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const midnight = zonedLocalMidnight(year, month, day, timeZone);
  const safeMinutes = snapMinutes(minutes);
  return new Date(midnight.getTime() + safeMinutes * 60 * 1000).toISOString();
}

export function formatGuideTime(minutes: number): string {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${pad2(minute)} ${period}`;
}

/**
 * Clamp drop minutes so past times on today (or earlier days) are not offered.
 * Returns null when the day is entirely in the past.
 */
export function clampDropMinutes(
  dayKey: string,
  minutes: number,
  timeZone: string,
  now = new Date(),
): number | null {
  const todayKey = dayKeyForInstant(now.toISOString(), timeZone);
  if (dayKey < todayKey) return null;
  const snapped = snapMinutes(minutes);
  if (dayKey > todayKey) return snapped;

  const nowMinutes = minutesFromMidnight(now.toISOString(), timeZone);
  const earliest = Math.min(
    24 * 60 - 5,
    Math.ceil((nowMinutes + 1) / 5) * 5,
  );
  if (earliest >= 24 * 60) return null;
  return Math.max(snapped, earliest);
}

export const PLATFORM_LABELS: Record<string, string> = {
  threads: "Threads",
  linkedin_personal: "LinkedIn",
  instagram: "Instagram",
};
