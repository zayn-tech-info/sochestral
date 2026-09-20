import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignJob, ConversationContentPlan } from "@sochestral/database";
import type { OrchestrationConfig } from "./config.js";

const state = vi.hoisted(() => ({ job: null as any, plan: null as any }));
vi.mock("@sochestral/database", async (original) => ({
  ...await original<object>(),
  reclaimStaleRunningCampaignJobs: vi.fn(),
  claimNextQueuedCampaignJob: vi.fn(async () => state.job),
  getOwnedCampaignJob: vi.fn(async () => state.job),
  getConversationContentPlan: vi.fn(async () => state.plan),
  getVoiceBible: vi.fn(async () => null),
  assembleGenerationContext: vi.fn(async () => ({ context: { payload: { preferences: [{ body: "Use concrete workshop examples" }] } } })),
  patchCampaignJob: vi.fn(async (_db, patch) => Object.assign(state.job, patch)),
  recordCampaignBooking: vi.fn(async (_db, booking) => {
    state.job.bookedCount++;
    state.job.bookedPublishAts.push(booking.publishAt);
  }),
}));
import { buildDaySlots, processOneCampaignTick } from "./campaign-day.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-10T00:00:00Z"));
  state.job = {
    id: "camp_test", userId: "user_test", conversationId: "conv_test",
    status: "running", cap: 30, bookedCount: 0, nextDate: "2026-09-11",
    dayAttempts: 0, bookedPublishAts: [],
  } as unknown as CampaignJob;
  state.plan = {
    startDate: "2026-09-11", horizonDays: 7, timezone: "UTC",
    platforms: ["threads"], cadence: { threadsPerDay: 2 }, themes: ["product updates"],
  } as ConversationContentPlan;
});

async function tick(callTool: ReturnType<typeof vi.fn>) {
  const slots = buildDaySlots({ ...state.plan, date: state.job.nextDate,
    timeZone: state.plan.timezone, bookedPublishAts: [], now: new Date() });
  const writer = { complete: vi.fn(async (_input: { system: string }) => ({ content: JSON.stringify({
    items: slots.map(slot => ({ ...slot, text: "A factual product update" })),
  }) })) };
  const grader = { complete: vi.fn(async () => ({ content: '{"fail":false,"reasons":[]}' })) };
  await processOneCampaignTick({} as never, {
    config: {} as OrchestrationConfig, writer: writer as never, grader: grader as never,
    mcp: { callTool } as never, campaignCap: 30, leaseMs: 60000,
  });
  vi.useRealTimers();
  return { writer, grader };
}

// Phase 0 characterizations. These assertions record defects, not the V2 contract.
// Replace them with the required invariant when the legacy worker is retired.
describe("legacy campaign loop baseline", () => {
  it("currently counts malformed receipts as bookings", async () => {
    const { writer } = await tick(vi.fn(async () => ({ value: {} })));
    expect(writer.complete.mock.calls[0]?.[0].system).toContain("Use concrete workshop examples");
    expect(state.job.bookedCount).toBe(2);
  });
  it("currently advances past a failed sibling after partial success", async () => {
    await tick(vi.fn().mockResolvedValueOnce({ value: { ok: true } })
      .mockResolvedValueOnce({ value: { ok: false } }));
    expect(state.job.bookedCount).toBe(1);
    expect(state.job.nextDate).toBe("2026-09-12");
  });
  it("currently treats a possible remote success timeout as a retryable failure", async () => {
    await tick(vi.fn(async () => { throw new Error("response lost after remote insert"); }));
    expect(state.job.bookedCount).toBe(0);
    expect(state.job.status).toBe("queued");
    expect(state.job.dayAttempts).toBe(1);
  });
  it("currently treats exhausted slots as a failed day", async () => {
    state.job.nextDate = "2026-09-10";
    state.plan.startDate = "2026-09-10";
    vi.setSystemTime(new Date("2026-09-10T23:59:00Z"));
    const call = vi.fn();
    await tick(call);
    expect(call).not.toHaveBeenCalled();
    expect(state.job.lastError).toBe("No open slots for this day");
  });
  it("currently stops at the stored 30 delivery cap", async () => {
    state.job.bookedCount = 30;
    const call = vi.fn();
    await tick(call);
    expect(call).not.toHaveBeenCalled();
    expect(state.job.status).toBe("succeeded");
  });
});
