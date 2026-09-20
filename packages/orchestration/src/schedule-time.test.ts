import { describe, expect, it } from "vitest";
import { resolveScheduleTime } from "./schedule-time.js";

describe("schedule timezone conversion", () => {
  it.each([
    ["2027-01-10T09:00", "America/New_York", "2027-01-10T14:00:00.000Z"],
    ["2027-07-10T09:00", "America/New_York", "2027-07-10T13:00:00.000Z"],
    ["2027-01-10T00:15", "Pacific/Kiritimati", "2027-01-09T10:15:00.000Z"],
    ["2027-01-10T09:00", "Asia/Kathmandu", "2027-01-10T03:15:00.000Z"],
    ["2027-01-10T09:00", "Africa/Lagos", "2027-01-10T08:00:00.000Z"],
  ])("resolves %s in %s", (local, zone, utc) => {
    expect(resolveScheduleTime(local, zone)).toBe(utc);
  });
  it("requires a choice for a repeated minute", () => {
    expect(() => resolveScheduleTime("2027-11-07T01:30", "America/New_York")).toThrow("AMBIGUOUS_LOCAL_TIME");
    expect(resolveScheduleTime("2027-11-07T01:30", "America/New_York", "earlier")).toBe("2027-11-07T05:30:00.000Z");
    expect(resolveScheduleTime("2027-11-07T01:30", "America/New_York", "later")).toBe("2027-11-07T06:30:00.000Z");
  });
  it("rejects missing minutes and invalid inputs", () => {
    expect(() => resolveScheduleTime("2027-03-14T02:30", "America/New_York")).toThrow("NONEXISTENT_LOCAL_TIME");
    expect(() => resolveScheduleTime("2027-02-30T09:00", "UTC")).toThrow("INVALID_LOCAL_TIME");
    expect(() => resolveScheduleTime("2027-01-10T09:00", "Bad/Zone")).toThrow("INVALID_TIMEZONE");
  });
});
