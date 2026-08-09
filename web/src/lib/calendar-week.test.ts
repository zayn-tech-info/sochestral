import { describe, expect, it } from "vitest";

import {
  dayKeyForInstant,
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
});
