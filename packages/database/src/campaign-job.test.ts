import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client.js";
import { requireTestDatabaseUrl } from "./env.js";
import { provisionUser } from "./users.js";
import { createConversationTurn } from "./orchestration.js";
import { upsertConversationContentPlan } from "./content-plan.js";
import {
  CampaignDatabaseError,
  enqueueCampaignJob,
  getInFlightCampaignJob,
  pauseCampaignJob,
  resumeCampaignJob,
  stopCampaignJob,
} from "./campaign-job.js";

describe("campaign jobs", () => {
  let database: Database;
  let userId: string;
  let conversationId: string;
  let planId: string;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "camp-owner@example.com")).id;
    const turn = await createConversationTurn(database.db, {
      userId,
      requestId: "20000000-0000-4000-8000-000000000201",
      content: "Go",
      title: "Go",
      assistantContent: "Booking started.",
    });
    conversationId = turn.conversation.id;
    const plan = await upsertConversationContentPlan(database.db, {
      userId,
      conversationId,
      startDate: "2026-08-20",
      timezone: "UTC",
      cadence: { threadsPerDay: 2 },
      platforms: ["threads"],
      direction: "Ship notes",
    });
    planId = plan.id;
  });

  it("refuses a second in flight job (AC-6)", async () => {
    await enqueueCampaignJob(database.db, {
      userId,
      conversationId,
      planId,
      nextDate: "2026-08-20",
      cap: 30,
    });
    await expect(
      enqueueCampaignJob(database.db, {
        userId,
        conversationId,
        planId,
        nextDate: "2026-08-20",
        cap: 30,
      }),
    ).rejects.toMatchObject({ code: "IN_FLIGHT" } satisfies Partial<CampaignDatabaseError>);
    expect(await getInFlightCampaignJob(database.db, userId)).not.toBeNull();
  });

  it("pauses, resumes, and stops (AC-7)", async () => {
    const job = await enqueueCampaignJob(database.db, {
      userId,
      conversationId,
      planId,
      nextDate: "2026-08-20",
      cap: 30,
    });
    const paused = await pauseCampaignJob(database.db, userId, job.id);
    expect(paused.status).toBe("paused");
    const resumed = await resumeCampaignJob(database.db, userId, job.id);
    expect(resumed.status).toBe("queued");
    const stopped = await stopCampaignJob(database.db, userId, job.id);
    expect(stopped.status).toBe("stopped");
  });
});
