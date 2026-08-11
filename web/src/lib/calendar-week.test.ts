import { describe, expect, it } from "vitest";

import {
  dayKeyForInstant,
  clampDropMinutes,
  formatGuideTime,
  instantAtDayMinutes,
  minutesFromMidnight,
  minutesToPx,
  moveInstantToDayKey,
  pxToMinutes,
  snapMinutes,
  startOfWeekMonday,
  weekRange,
  zonedYmd,
} from "./calendar-week";

describe("calendar-week", () => {
  it("starts weeks on Monday in the given zone", () => {
    // Wednesday 12 Aug 2026 UTC
    const anchor = new Date("2026-08-12T15:00:00.000Z");
    const monday = startOfWeekMonday(anchor, "UTC");
    expect(zonedYmd(monday, "UTC")).toEqual({
      year: 2026,
      month: 8,
      day: 10,
    });
  });

  it("builds a 7 day week range within the 8 day API cap", () => {
    const range = weekRange(new Date("2026-08-12T15:00:00.000Z"), "UTC");
    expect(range.days).toHaveLength(7);
    expect(range.days[0]?.key).toBe("2026-08-10");
    expect(range.days[6]?.key).toBe("2026-08-16");
    const span =
      Date.parse(range.to) - Date.parse(range.from);
    expect(span).toBeLessThanOrEqual(8 * 24 * 60 * 60 * 1000);
  });

  it("maps instants onto day keys", () => {
    expect(dayKeyForInstant("2026-08-10T12:00:00.000Z", "UTC")).toBe(
      "2026-08-10",
    );
  });

  it("moves an instant to another day while keeping local clock time", () => {
    const moved = moveInstantToDayKey(
      "2026-08-10T15:30:00.000Z",
      "2026-08-12",
      "UTC",
    );
    expect(moved).toBe("2026-08-12T15:30:00.000Z");
    expect(dayKeyForInstant(moved, "UTC")).toBe("2026-08-12");
  });

  it("snaps minutes and maps px to timeline minutes", () => {
    expect(snapMinutes(17)).toBe(15);
    expect(snapMinutes(18)).toBe(20);
    expect(minutesFromMidnight("2026-08-10T17:00:00.000Z", "UTC")).toBe(17 * 60);
    expect(minutesToPx(60)).toBe(56);
    expect(pxToMinutes(56)).toBe(60);
    expect(formatGuideTime(17 * 60 + 15)).toBe("5:15 PM");
    expect(instantAtDayMinutes("2026-08-12", 17 * 60, "UTC")).toBe(
      "2026-08-12T17:00:00.000Z",
    );
  });

  it("clamps drop minutes to the next future slot on today", () => {
    const now = new Date("2026-08-10T15:07:00.000Z"); // 3:07 PM UTC
    expect(clampDropMinutes("2026-08-09", 12 * 60, "UTC", now)).toBeNull();
    expect(clampDropMinutes("2026-08-11", 9 * 60, "UTC", now)).toBe(9 * 60);
    // 15:07 UTC → earliest ceil slot is 15:10 (910 min)
    expect(clampDropMinutes("2026-08-10", 10 * 60, "UTC", now)).toBe(910);
    expect(clampDropMinutes("2026-08-10", 18 * 60, "UTC", now)).toBe(18 * 60);
  });
});
