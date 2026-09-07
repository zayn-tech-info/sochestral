import { describe, expect, it } from "vitest";
import { buildDaySlots, publicCampaign } from "./campaign-day.js";

describe("buildDaySlots", () => {
  it("places playbook hours and skips already booked times (AC-9)", () => {
    const slots = buildDaySlots({
      cadence: { threadsPerDay: 2 },
      platforms: ["threads"],
      date: "2026-08-20",
      timeZone: "UTC",
      bookedPublishAts: ["2026-08-20T09:00:00.000Z"],
      now: new Date("2026-08-14T12:00:00.000Z"),
    });
    expect(slots.length).toBe(2);
    expect(slots[0]?.publishAt).not.toBe("2026-08-20T09:00:00.000Z");
    expect(slots.every((slot) => slot.platform === "threads")).toBe(true);
  });
});

describe("publicCampaign", () => {
  it("computes Day N from startDate and nextDate (AC-8)", () => {
    const view = publicCampaign(
      {
        id: "camp_1",
        userId: "user_1",
        conversationId: "conv_1",
        planId: "plan_1",
        status: "running",
        cap: 30,
        bookedCount: 4,
        nextDate: "2026-08-16",
        dayAttempts: 0,
        bookedPublishAts: [],
        notice: null,
        lastError: null,
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: null,
        updatedAt: new Date(),
      },
      "2026-08-14",
    );
    expect(view.dayIndex).toBe(3);
    expect(view.bookedCount).toBe(4);
    expect(view.cap).toBe(30);
  });
});
