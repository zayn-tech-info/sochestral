import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client.js";
import {
  contentPlanHasBrief,
  contentPlanHasUserIdeas,
  formatContentPlanNote,
  getConversationContentPlan,
  isContentPlanLockComplete,
  plannedPostCount,
  upsertConversationContentPlan,
} from "./content-plan.js";
import { requireTestDatabaseUrl } from "./env.js";
import { createConversationTurn } from "./orchestration.js";
import type { ConversationContentPlan } from "./schema.js";
import { provisionUser } from "./users.js";

function plan(
  overrides: Partial<ConversationContentPlan> = {},
): ConversationContentPlan {
  const now = new Date("2026-08-13T12:00:00.000Z");
  return {
    id: "cplan_test",
    conversationId: "conv_test",
    userId: "user_test",
    horizonDays: 14,
    platforms: ["threads"],
    contentType: "founder",
    direction: "Win more customers",
    themes: ["shipping notes"],
    acceptedItems: [{ title: "Bench note" }],
    researchSummary: "Makers post short shop notes.",
    startDate: null,
    timezone: null,
    cadence: {},
    timeMode: null,
    lockedAt: null,
    updatedAt: now,
    ...overrides,
  };
}

describe("formatContentPlanNote", () => {
  it("injects the working plan and research (AC-5)", () => {
    const note = formatContentPlanNote(plan());
    expect(note).toContain("Horizon days: 14");
    expect(note).toContain("Content type: founder");
    expect(note).toContain("Direction: Win more customers");
    expect(note).toContain("Makers post short shop notes.");
    expect(contentPlanHasBrief(plan())).toBe(true);
    expect(contentPlanHasBrief(plan({ contentType: null }))).toBe(false);
    expect(formatContentPlanNote(null)).toBeNull();
  });
});

describe("contentPlanHasUserIdeas", () => {
  it("needs direction, topics, or accepted items from the operator", () => {
    expect(contentPlanHasUserIdeas(plan())).toBe(true);
    expect(
      contentPlanHasUserIdeas(
        plan({ direction: null, themes: [], acceptedItems: [] }),
      ),
    ).toBe(false);
    expect(
      contentPlanHasUserIdeas(
        plan({ direction: "Win more customers", themes: [], acceptedItems: [] }),
      ),
    ).toBe(true);
  });
});

describe("upsertConversationContentPlan", () => {
  let database: Database;
  let userId: string;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "plan-owner@example.com")).id;
  });

  it("keeps one snapshot per conversation (AC-5)", async () => {
    const turn = await createConversationTurn(database.db, {
      userId,
      requestId: "20000000-0000-4000-8000-000000000001",
      content: "Plan the next 2 weeks",
      title: "Plan the next 2 weeks",
      assistantContent: "Let's talk first.",
    });
    const first = await upsertConversationContentPlan(database.db, {
      userId,
      conversationId: turn.conversation.id,
      horizonDays: 14,
      platforms: ["threads"],
      contentType: "founder",
      direction: "Win more customers",
    });
    const second = await upsertConversationContentPlan(database.db, {
      userId,
      conversationId: turn.conversation.id,
      researchSummary: "Shop owners post bench notes.",
    });
    expect(second.id).toBe(first.id);
    expect(second.contentType).toBe("founder");
    expect(second.researchSummary).toBe("Shop owners post bench notes.");
    const loaded = await getConversationContentPlan(
      database.db,
      userId,
      turn.conversation.id,
    );
    expect(loaded?.id).toBe(first.id);
    expect(formatContentPlanNote(loaded)).toContain("bench notes");
  });
});

describe("content plan lock", () => {
  it("needs direction or themes, platforms, cadence, and start date (AC-2)", () => {
    expect(isContentPlanLockComplete(plan())).toBe(false);
    expect(
      isContentPlanLockComplete(
        plan({
          startDate: "2026-08-14",
          cadence: { threadsPerDay: 2 },
        }),
      ),
    ).toBe(true);
    expect(
      plannedPostCount(
        plan({
          startDate: "2026-08-14",
          cadence: { threadsPerDay: 2 },
          horizonDays: 14,
          acceptedItems: [],
        }),
      ),
    ).toBe(28);
  });

  it("injects lock fields into the operator note (AC-2)", () => {
    const note = formatContentPlanNote(
      plan({
        startDate: "2026-08-14",
        timezone: "UTC",
        cadence: { threadsPerDay: 1 },
        timeMode: "spread",
        lockedAt: new Date("2026-08-14T12:00:00.000Z"),
      }),
    );
    expect(note).toContain("Start date: 2026-08-14");
    expect(note).toContain("Lock: complete");
  });
});
