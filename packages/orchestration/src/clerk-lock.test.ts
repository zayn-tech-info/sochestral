import { describe, expect, it, vi } from "vitest";
import type { ConversationContentPlan } from "@sochestral/database";
import type { ModelProvider } from "./model.js";
import {
  bumpPastStartDate,
  clerkIsChatOnly,
  clerkOutputSchema,
  clerkWantsCampaign,
  mergeClerkLock,
  rejectOldYear,
  resolveRelativeStartDate,
  runPlanClerk,
} from "./clerk-lock.js";

function plan(
  overrides: Partial<ConversationContentPlan> = {},
): ConversationContentPlan {
  const now = new Date("2026-08-14T12:00:00.000Z");
  return {
    id: "cplan_test",
    conversationId: "conv_test",
    userId: "user_test",
    horizonDays: 14,
    platforms: ["threads"],
    contentType: "founder",
    direction: "Win more customers",
    themes: ["shipping notes"],
    acceptedItems: [],
    researchSummary: null,
    startDate: "2026-08-14",
    timezone: "UTC",
    cadence: { threadsPerDay: 2 },
    timeMode: "spread",
    lockedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const clerkBase = {
  intent: "accept" as const,
  startDate: null,
  timezone: null,
  cadence: null,
  platforms: null,
  timeMode: null,
  isGo: true,
  isIncomplete: false,
  isConversationMeta: false,
};

describe("clerk lock merge", () => {
  it("keeps a stored start date when clerk sends null (AC-2)", () => {
    const merged = mergeClerkLock(plan(), clerkBase, {
      message: "go with it",
      profileTimeZone: "UTC",
      now: new Date("2026-08-14T12:00:00.000Z"),
    });
    expect(merged.startDate).toBe("2026-08-14");
    expect(merged.lockedAt).not.toBeNull();
  });

  it("resolves tomorrow in the lock timezone", () => {
    expect(
      resolveRelativeStartDate(
        "start tomorrow",
        "UTC",
        new Date("2026-08-14T12:00:00.000Z"),
      ),
    ).toBe("2026-08-15");
  });

  it("bumps a past start date to today", () => {
    expect(
      bumpPastStartDate(
        "2026-08-01",
        "UTC",
        new Date("2026-08-14T12:00:00.000Z"),
      ),
    ).toBe("2026-08-14");
  });

  it("rejects years before last year", () => {
    expect(rejectOldYear("2024-01-01", new Date("2026-08-14T00:00:00Z"))).toBe(
      true,
    );
    expect(rejectOldYear("2026-08-14", new Date("2026-08-14T00:00:00Z"))).toBe(
      false,
    );
  });

  it("treats clerk junk flags as chat only (AC-1)", () => {
    expect(clerkIsChatOnly(null)).toBe(true);
    expect(
      clerkIsChatOnly({ ...clerkBase, isIncomplete: true, isGo: false }),
    ).toBe(true);
  });

  it("wants a campaign when lock is complete and go is true (AC-3)", () => {
    expect(clerkWantsCampaign(clerkBase, plan())).toBe(true);
    expect(
      clerkWantsCampaign(clerkBase, plan({ startDate: null, lockedAt: null })),
    ).toBe(false);
  });

  it("strips extra clerk keys", () => {
    const parsed = clerkOutputSchema.safeParse({
      ...clerkBase,
      extra: "nope",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect("extra" in parsed.data).toBe(false);
    }
  });

  it("asks Luna to set isGo from intent when the lock is already complete (AC-4)", async () => {
    const complete = vi.fn(async () => ({
      content: "",
      thinking: null,
      toolCalls: [
        {
          id: "call_1",
          name: "record_plan_clerk",
          input: { ...clerkBase, intent: "accept", isGo: true },
        },
      ],
      inputTokens: 1,
      outputTokens: 1,
      attempts: 1,
    }));
    const clerk = await runPlanClerk({ complete } as unknown as ModelProvider, {
      message: "go",
      priorMessages: [],
      modelName: "ship-like/gpt-5.6-luna",
      existingLock: {
        startDate: "2026-08-20",
        timezone: "UTC",
        cadence: { threadsPerDay: 1 },
        timeMode: "spread",
        lockComplete: true,
        plannedPosts: 14,
      },
    });
    expect(clerk?.isGo).toBe(true);
    expect(clerk?.intent).toBe("accept");
    const system = String(complete.mock.calls[0]?.[0]?.system ?? "");
    expect(system).toContain("lockComplete");
    expect(system).toContain("isGo to true");
    expect(system).toContain("A short confirmation is enough");
  });
});
