import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  appendConversationTurn,
  createPendingMediaAssets,
  createConversationTurn,
  createDb,
  createProfileEntry,
  listProfileEntries,
  drafts,
  orchestrationMessages,
  orchestrationRuns,
  orchestrationToolCalls,
  markMediaAssetReady,
  patchBusinessProfile,
  provisionUser,
  requireTestDatabaseUrl,
  tryCompleteSetupIfReady,
  updatePublishingPreference,
  type Database,
} from "@sochestral/database";
import type { OrchestrationConfig } from "./config.js";
import { OrchestrationError } from "./errors.js";
import type { SocialMcpGateway } from "./mcp.js";
import type { ModelProvider } from "./model.js";
import { DefaultOrchestrationService } from "./service.js";
import { PublishingPreferenceService } from "./publishing.js";
import type { ReviewService } from "./review.js";

const config: OrchestrationConfig = {
  theseanApiKey: "unused",
  theseanModel: "contract-model",
  theseanIntentModel: "intent-model",
  theseanVisionModel: "vision-model",
  theseanSetupModel: "setup-model",
  theseanVisionEnabled: true,
  theseanThinkingEnabled: false,
  theseanThinkingBudgetTokens: 2048,
  theseanTimeoutMs: 1000,
  setupAgentEnabled: false,
  deepseekApiKey: null,
  deepseekBaseUrl: "https://api.deepseek.com",
  deepseekModel: "deepseek-v4-flash",
  socialMcpUrl: "https://social.example/mcp",
  contextTokenLimit: 6000,
  outputTokenLimit: 1500,
  maxToolSteps: 4,
  dailyRunLimit: 50,
  externalTimeoutMs: 1000,
};

function modelCompletion(
  input: {
    content?: string | null;
    thinking?: string | null;
    toolCalls?: Array<{ id: string; name: string; input: unknown }>;
    attempts?: number;
  } = {},
) {
  return {
    content: input.content ?? null,
    thinking: input.thinking ?? null,
    toolCalls: input.toolCalls ?? [],
    inputTokens: 10,
    outputTokens: 5,
    attempts: input.attempts ?? 1,
  };
}

function toolCall(
  id: string,
  name: string,
  args: Record<string, unknown>,
) {
  return {
    id,
    name,
    input: args,
  };
}

describe("DefaultOrchestrationService", () => {
  let database: Database;
  let userId: string;
  let model: ModelProvider;
  let mcp: SocialMcpGateway;
  let service: DefaultOrchestrationService;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "orchestration@example.com")).id;
    model = { complete: vi.fn() };
    mcp = { callTool: vi.fn(), listTools: vi.fn() };
    service = new DefaultOrchestrationService(
      database.db,
      config,
      model,
      mcp,
    );
  });

  it("runs one authenticated dry run turn and stores safe history (AC-1, AC-3, AC-4, AC-5, AC-6, AC-9, AC-10, AC-11)", async () => {
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_1", "publish_now", {
              platforms: ["threads"],
              text: "Launch day",
              dryRun: false,
              confirm: true,
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({ content: "Your Threads preview is ready." }),
      );
    vi.mocked(mcp.callTool).mockResolvedValue({
      attempts: 1,
      value: {
        ok: true,
        dryRun: true,
        wouldPublishTo: ["threads"],
        preview: {
          textPlan: "Launch day",
          mediaPlan: { count: 0 },
          risks: [],
        },
        internalPostId: "private-id",
      },
    });

    const result = await service.createConversation(userId, {
      message: "Post Launch day on Threads",
      requestId: "00000000-0000-4000-8000-000000000001",
    });

    expect(mcp.callTool).toHaveBeenCalledWith({
      userId,
      name: "publish_now",
      arguments: {
        platforms: ["threads"],
        text: "Launch day",
        dryRun: true,
      },
    });
    expect(result.run).toMatchObject({
      status: "completed",
      model: "contract-model",
      modelStepCount: 2,
      targetPlatforms: ["threads"],
    });
    expect(result.toolSummaries[0]?.summary).toEqual({
      ok: true,
      dryRun: true,
      platforms: ["threads"],
      previewText: "Launch day",
      mediaItemCount: 0,
      warnings: [],
    });
    expect(JSON.stringify(result)).not.toContain("private-id");
  });

  it("schedules through SocialMCP schedule_post with publishAt", async () => {
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_schedule", "schedule_post", {
              platforms: ["threads"],
              text: "Launch day",
              publishAt: "2026-08-15T15:00:00.000Z",
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({
          content:
            "Scheduled for Friday. Open Calendar or Scheduled Posts to review.",
        }),
      );
    vi.mocked(mcp.callTool).mockResolvedValue({
      attempts: 1,
      value: {
        ok: true,
        id: "sched_abc",
        publishAt: "2026-08-15T15:00:00.000Z",
        platforms: ["threads"],
        accessToken: "secret-token",
      },
    });

    const result = await service.createConversation(userId, {
      message:
        "Schedule Launch day on Threads for 2026-08-15T15:00:00.000Z",
      requestId: "00000000-0000-4000-8000-0000000000a1",
    });

    expect(mcp.callTool).toHaveBeenCalledWith({
      userId,
      name: "schedule_post",
      arguments: {
        platforms: ["threads"],
        text: "Launch day",
        scheduledAt: "2026-08-15T15:00:00.000Z",
        confirm: true,
      },
    });
    expect(result.run).toMatchObject({
      status: "completed",
      explicitLiveIntent: false,
    });
    expect(result.toolSummaries[0]).toMatchObject({
      toolName: "schedule_post",
      summary: {
        ok: true,
        scheduled: true,
        scheduleId: "sched_abc",
        publishAt: "2026-08-15T15:00:00.000Z",
        calendarPath: "/app/calendar",
        scheduledPath: "/app/scheduled",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret-token");
  });

  it("asks in chat when schedule_post is missing publishAt instead of failing the turn", async () => {
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_schedule_bad", "schedule_post", {
              platforms: ["threads"],
              text: "Launch day",
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({
          content:
            "I can schedule that next. What date and time should it go out?",
        }),
      );

    const result = await service.createConversation(userId, {
      message: "Help me schedule the content on Threads",
      requestId: "00000000-0000-4000-8000-0000000000a2",
    });

    expect(result.run?.status).toBe("completed");
    expect(result.assistantMessage.content).toContain("date and time");
    expect(mcp.callTool).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(model.complete).mock.calls[1]?.[0])).toContain(
      "publishAt",
    );
  });

  it("lets the model handle missing platforms instead of a canned clarify", async () => {
    vi.mocked(model.complete).mockResolvedValue(
      modelCompletion({
        content:
          "Happy to schedule that plan. Which platforms should each day use: Threads, Instagram, or LinkedIn?",
      }),
    );

    const result = await service.createConversation(userId, {
      message: "Based on what you listed above, can you help me schedule the content?",
      requestId: "00000000-0000-4000-8000-000000000002",
    });

    expect(result.run).toMatchObject({ status: "completed" });
    expect(result.assistantMessage.content).toContain("Happy to schedule");
    expect(result.assistantMessage.content).not.toContain(
      "Which supported platform should I use?",
    );
    expect(model.complete).toHaveBeenCalled();
    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it("persists prepare_review locally without calling SocialMCP live execution", async () => {
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_review", "prepare_review", {
              variants: [
                { platform: "threads", body: "Launch day", mediaUrls: [] },
              ],
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({ content: "Your Threads draft is ready to review." }),
      );

    const result = await service.createConversation(userId, {
      message: "Draft Launch day on Threads",
      requestId: "00000000-0000-4000-8000-000000000012",
    });

    expect(mcp.callTool).not.toHaveBeenCalled();
    expect(result.reviewGroups).toHaveLength(1);
    expect(result.reviewGroups[0]?.drafts[0]).toMatchObject({
      platform: "threads",
      body: "Launch day",
      revision: 1,
    });
    expect(await database.db.select().from(drafts)).toHaveLength(1);
    expect(result.toolSummaries[0]?.toolName).toBe("prepare_review");
    expect(result.turnActivity).toMatchObject({
      requestMessageId: result.userMessage.id,
      assistantMessageId: result.assistantMessage.id,
      runId: result.run?.id,
    });
    expect(result.turnActivity?.reviewGroups).toHaveLength(1);
  });

  it("persists save_profile_entry do_not rules for settings", async () => {
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_rule", "save_profile_entry", {
              category: "do_not",
              body: "Never mention Woodcraft in social posts",
              title: "Competitors",
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({
          content: "Saved that do-not rule to your profile.",
        }),
      );

    const result = await service.createConversation(userId, {
      message: "Yeah save it to your don't rules",
      requestId: "00000000-0000-4000-8000-0000000000d1",
    });

    expect(mcp.callTool).not.toHaveBeenCalled();
    expect(result.toolSummaries[0]?.toolName).toBe("save_profile_entry");
    const entries = await listProfileEntries(database.db, {
      userId,
      category: "do_not",
    });
    expect(entries.items).toHaveLength(1);
    expect(entries.items[0]).toMatchObject({
      category: "do_not",
      body: "Never mention Woodcraft in social posts",
      source: "operator_confirm",
      status: "active",
    });
  });

  it("uses a snapshotted Full access command to invoke only the trusted review service", async () => {
    const previousEnabled = process.env.PUBLISHING_AUTHORITY_ENABLED;
    process.env.PUBLISHING_AUTHORITY_ENABLED = "true";
    await updatePublishingPreference(database.db, {
      userId,
      expectedRevision: 0,
      mode: "full_access",
      source: "settings",
      currentConsentVersion: "2026-08-01",
      acknowledged: true,
      consentVersion: "2026-08-01",
    });
    const review = {
      updateDraft: vi.fn(),
      publishGroup: vi.fn().mockResolvedValue({
        groupId: "review_any",
        replayed: false,
        results: [
          {
            id: "attempt_1",
            draftId: "draft_1",
            platform: "threads",
            state: "succeeded",
            mcpPostId: "post_1",
            error: null,
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            authorizationKind: "full_access",
          },
        ],
      }),
      checkAttempt: vi.fn(),
    } as unknown as ReviewService;
    service = new DefaultOrchestrationService(
      database.db,
      config,
      model,
      mcp,
      new PublishingPreferenceService(database.db),
      review,
    );
    vi.mocked(model.complete)
      .mockResolvedValueOnce(modelCompletion({
        toolCalls: [toolCall("call_review_auto", "prepare_review", {
          variants: [{ platform: "threads", body: "Launch now", mediaUrls: [] }],
        })],
      }))
      .mockResolvedValueOnce(modelCompletion({ content: "Publishing the prepared set." }));

    try {
      const result = await service.createConversation(userId, {
        message: "Ship the Threads launch post now",
        requestId: "00000000-0000-4000-8000-000000000099",
      });

      expect(result.run).toMatchObject({
        publishingMode: "full_access",
        explicitLiveIntent: true,
        liveIntentKind: "live",
      });
      // Clear live wording resolves locally; no intent LLM round trip.
      expect(vi.mocked(model.complete).mock.calls[0]?.[0]).toMatchObject({
        model: "contract-model",
      });
      expect(vi.mocked(model.complete).mock.calls[0]?.[0].toolChoice).not.toEqual({
        type: "tool",
        name: "resolve_live_publish_intent",
      });
      expect(review.publishGroup).toHaveBeenCalledWith(
        userId,
        expect.stringMatching(/^review_/),
        expect.objectContaining({
          authorization: expect.objectContaining({
            kind: "full_access",
            warningsBlock: false,
            consentVersion: "2026-08-01",
          }),
        }),
      );
      expect(result.assistantMessage.content).toBe(
        "Published successfully to Threads.",
      );
      expect(vi.mocked(model.complete).mock.calls[0]?.[0].system).toContain(
        "image only, no caption, or without caption",
      );
      const storedMessages = await database.db
        .select()
        .from(orchestrationMessages)
        .where(eq(orchestrationMessages.id, result.assistantMessage.id));
      expect(storedMessages[0]?.content).toBe(
        "Published successfully to Threads.",
      );
      expect(mcp.callTool).not.toHaveBeenCalled();
    } finally {
      if (previousEnabled === undefined) delete process.env.PUBLISHING_AUTHORITY_ENABLED;
      else process.env.PUBLISHING_AUTHORITY_ENABLED = previousEnabled;
    }
  });

  it("asks a product clarify question when Full access intent is unclear", async () => {
    const previousEnabled = process.env.PUBLISHING_AUTHORITY_ENABLED;
    process.env.PUBLISHING_AUTHORITY_ENABLED = "true";
    await updatePublishingPreference(database.db, {
      userId,
      expectedRevision: 0,
      mode: "full_access",
      source: "settings",
      currentConsentVersion: "2026-08-01",
      acknowledged: true,
      consentVersion: "2026-08-01",
    });
    const review = {
      updateDraft: vi.fn(),
      publishGroup: vi.fn(),
      checkAttempt: vi.fn(),
    } as unknown as ReviewService;
    service = new DefaultOrchestrationService(
      database.db,
      config,
      model,
      mcp,
      new PublishingPreferenceService(database.db),
      review,
    );
    vi.mocked(model.complete).mockResolvedValueOnce(modelCompletion({
      toolCalls: [toolCall("intent_1", "resolve_live_publish_intent", {
        intent: "unclear",
      })],
    }));

    try {
      const events: Array<{ type: string; questions?: unknown }> = [];
      const result = await service.createConversationStream(
        userId,
        {
          message: "Just shot it there on Threads",
          requestId: "00000000-0000-4000-8000-000000000197",
        },
        {
          emit(event) {
            events.push(event);
          },
        },
      );

      expect(result.run).toBeNull();
      expect(result.assistantMessage.content).toContain("quick confirm");
      expect(result.intentQuestions?.length).toBeGreaterThan(0);
      expect(result.intentQuestions?.[0]?.options.at(-1)).toMatchObject({
        id: "custom",
        custom: true,
      });
      expect(result.reviewGroups).toHaveLength(0);
      expect(result.toolSummaries).toEqual([]);
      expect(review.publishGroup).not.toHaveBeenCalled();
      expect(review.updateDraft).not.toHaveBeenCalled();
      expect(mcp.callTool).not.toHaveBeenCalled();
      expect(vi.mocked(model.complete)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(model.complete).mock.calls[0]?.[0]).toMatchObject({
        toolChoice: { type: "tool", name: "resolve_live_publish_intent" },
        thinking: { enabled: false },
      });
      expect(
        events.some((event) => event.type === "intent_questions"),
      ).toBe(true);
      expect(
        vi.mocked(model.complete).mock.calls.some((call) =>
          JSON.stringify(call[0]?.tools ?? []).includes("prepare_review"),
        ),
      ).toBe(false);
    } finally {
      if (previousEnabled === undefined) delete process.env.PUBLISHING_AUTHORITY_ENABLED;
      else process.env.PUBLISHING_AUTHORITY_ENABLED = previousEnabled;
    }
  });

  it("emits intent questions only after the model marks intent unclear", async () => {
    const previousEnabled = process.env.PUBLISHING_AUTHORITY_ENABLED;
    process.env.PUBLISHING_AUTHORITY_ENABLED = "true";
    await updatePublishingPreference(database.db, {
      userId,
      expectedRevision: 0,
      mode: "full_access",
      source: "settings",
      currentConsentVersion: "2026-08-01",
      acknowledged: true,
      consentVersion: "2026-08-01",
    });
    service = new DefaultOrchestrationService(
      database.db,
      config,
      model,
      mcp,
      new PublishingPreferenceService(database.db),
    );
    vi.mocked(model.complete).mockResolvedValueOnce(
      modelCompletion({
        toolCalls: [
          toolCall("intent_1", "resolve_live_publish_intent", {
            intent: "unclear",
          }),
        ],
      }),
    );

    try {
      const events: Array<{ type: string }> = [];
      const result = await service.createConversationStream(
        userId,
        {
          message: "Go ahead with that somehow",
          requestId: "00000000-0000-4000-8000-000000000198",
        },
        {
          emit(event) {
            events.push(event);
          },
        },
      );

      expect(result.run).toBeNull();
      expect(result.intentQuestions?.[0]?.id).toBe("goal");
      expect(events.map((event) => event.type)).toEqual(
        expect.arrayContaining([
          "turn_started",
          "step_started",
          "intent_questions",
          "turn_completed",
        ]),
      );
      expect(
        events.some(
          (event) =>
            event.type === "step_started" &&
            (event as { step?: string }).step === "checking_intent",
        ),
      ).toBe(true);
      expect(mcp.callTool).not.toHaveBeenCalled();
      expect(model.complete).toHaveBeenCalledTimes(1);
    } finally {
      if (previousEnabled === undefined) delete process.env.PUBLISHING_AUTHORITY_ENABLED;
      else process.env.PUBLISHING_AUTHORITY_ENABLED = previousEnabled;
    }
  });

  it("posts live on Instagram from Full access without re-asking platform or draft", async () => {
    const previousEnabled = process.env.PUBLISHING_AUTHORITY_ENABLED;
    process.env.PUBLISHING_AUTHORITY_ENABLED = "true";
    await updatePublishingPreference(database.db, {
      userId,
      expectedRevision: 0,
      mode: "full_access",
      source: "settings",
      currentConsentVersion: "2026-08-01",
      acknowledged: true,
      consentVersion: "2026-08-01",
    });
    const review = {
      updateDraft: vi.fn(),
      publishGroup: vi.fn().mockResolvedValue({
        results: [
          {
            id: "attempt_ig",
            draftId: "draft_ig",
            platform: "instagram",
            state: "succeeded",
            mcpPostId: "post_ig",
            error: null,
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            authorizationKind: "full_access",
          },
        ],
      }),
      checkAttempt: vi.fn(),
    } as unknown as ReviewService;
    service = new DefaultOrchestrationService(
      database.db,
      config,
      model,
      mcp,
      new PublishingPreferenceService(database.db),
      review,
    );

    try {
      const first = await service.createConversation(userId, {
        message: "Post this on my Instagram",
        requestId: "00000000-0000-4000-8000-000000000291",
      });
      expect(first.run).toMatchObject({
        targetPlatforms: ["instagram"],
        liveIntentKind: "live",
        explicitLiveIntent: true,
      });
      expect(first.assistantMessage.content).toContain("Instagram needs an image");
      expect(first.assistantMessage.content).not.toContain("Which supported platform");
      expect(first.assistantMessage.content).not.toContain("draft for review");
      expect(model.complete).not.toHaveBeenCalled();

      const followUp = await service.addMessage(userId, first.conversation.id, {
        message:
          "use this https://cdn.example.com/product.jpg",
        requestId: "00000000-0000-4000-8000-000000000292",
      });
      expect(followUp.run).toMatchObject({
        targetPlatforms: ["instagram"],
        liveIntentKind: "live",
        explicitLiveIntent: true,
      });
      expect(followUp.assistantMessage.content).not.toContain(
        "Which supported platform",
      );
      expect(followUp.assistantMessage.content).not.toContain("draft for review");
      expect(followUp.toolSummaries.some((row) => row.toolName === "prepare_review")).toBe(
        true,
      );
      expect(review.publishGroup).toHaveBeenCalled();
      expect(followUp.assistantMessage.content).toContain("Published successfully");
    } finally {
      if (previousEnabled === undefined) delete process.env.PUBLISHING_AUTHORITY_ENABLED;
      else process.env.PUBLISHING_AUTHORITY_ENABLED = previousEnabled;
    }
  });

  it("keeps Full access in review when local veto blocks intent without calling the model", async () => {
    const previousEnabled = process.env.PUBLISHING_AUTHORITY_ENABLED;
    process.env.PUBLISHING_AUTHORITY_ENABLED = "true";
    await updatePublishingPreference(database.db, {
      userId,
      expectedRevision: 0,
      mode: "full_access",
      source: "settings",
      currentConsentVersion: "2026-08-01",
      acknowledged: true,
      consentVersion: "2026-08-01",
    });
    const review = {
      updateDraft: vi.fn(),
      publishGroup: vi.fn(),
      checkAttempt: vi.fn(),
    } as unknown as ReviewService;
    service = new DefaultOrchestrationService(
      database.db,
      config,
      model,
      mcp,
      new PublishingPreferenceService(database.db),
      review,
    );
    vi.mocked(model.complete)
      .mockResolvedValueOnce(modelCompletion({
        toolCalls: [toolCall("call_review_hold", "prepare_review", {
          variants: [{ platform: "threads", body: "Hold for review", mediaUrls: [] }],
        })],
      }))
      .mockResolvedValueOnce(modelCompletion({ content: "Prepared a review set." }));

    try {
      const result = await service.createConversation(userId, {
        message: "Draft this for Threads",
        requestId: "00000000-0000-4000-8000-000000000098",
      });

      expect(result.run).toMatchObject({
        publishingMode: "full_access",
        explicitLiveIntent: false,
      });
      expect(vi.mocked(model.complete).mock.calls[0]?.[0].toolChoice).not.toEqual({
        type: "tool",
        name: "resolve_live_publish_intent",
      });
      expect(review.publishGroup).not.toHaveBeenCalled();
      expect(result.assistantMessage.content).toBe("Prepared a review set.");
    } finally {
      if (previousEnabled === undefined) delete process.env.PUBLISHING_AUTHORITY_ENABLED;
      else process.env.PUBLISHING_AUTHORITY_ENABLED = previousEnabled;
    }
  });

  it("keeps Full access in review when product intent classification is draft", async () => {
    const previousEnabled = process.env.PUBLISHING_AUTHORITY_ENABLED;
    process.env.PUBLISHING_AUTHORITY_ENABLED = "true";
    await updatePublishingPreference(database.db, {
      userId,
      expectedRevision: 0,
      mode: "full_access",
      source: "settings",
      currentConsentVersion: "2026-08-01",
      acknowledged: true,
      consentVersion: "2026-08-01",
    });
    const review = {
      updateDraft: vi.fn(),
      publishGroup: vi.fn(),
      checkAttempt: vi.fn(),
    } as unknown as ReviewService;
    service = new DefaultOrchestrationService(
      database.db,
      config,
      model,
      mcp,
      new PublishingPreferenceService(database.db),
      review,
    );
    vi.mocked(model.complete)
      .mockResolvedValueOnce(modelCompletion({
        toolCalls: [toolCall("intent_1", "resolve_live_publish_intent", {
          intent: "draft",
        })],
      }))
      .mockResolvedValueOnce(modelCompletion({
        toolCalls: [toolCall("call_review_hold", "prepare_review", {
          variants: [{ platform: "threads", body: "Hold for review", mediaUrls: [] }],
        })],
      }))
      .mockResolvedValueOnce(modelCompletion({ content: "Prepared a review set." }));

    try {
      const result = await service.createConversation(userId, {
        // Wording that is not a local live match, so the intent LLM can still classify draft.
        message: "Put the launch update on Threads for me",
        requestId: "00000000-0000-4000-8000-000000000097",
      });

      expect(result.run).toMatchObject({
        publishingMode: "full_access",
        explicitLiveIntent: false,
        liveIntentKind: "draft",
      });
      expect(review.publishGroup).not.toHaveBeenCalled();
      expect(result.assistantMessage.content).toBe("Prepared a review set.");
    } finally {
      if (previousEnabled === undefined) delete process.env.PUBLISHING_AUTHORITY_ENABLED;
      else process.env.PUBLISHING_AUTHORITY_ENABLED = previousEnabled;
    }
  });

  it("runs the model when the platform is missing instead of a canned clarify", async () => {
    const previousEnabled = process.env.PUBLISHING_AUTHORITY_ENABLED;
    process.env.PUBLISHING_AUTHORITY_ENABLED = "true";
    await updatePublishingPreference(database.db, {
      userId,
      expectedRevision: 0,
      mode: "full_access",
      source: "settings",
      currentConsentVersion: "2026-08-01",
      acknowledged: true,
      consentVersion: "2026-08-01",
    });
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            {
              id: "intent_1",
              name: "resolve_live_publish_intent",
              input: { intent: "draft" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({
          content: "I can draft that next. Which platform should I use?",
        }),
      );

    try {
      const result = await service.createConversation(userId, {
        message: "Help me get this content ready to go out",
        requestId: "00000000-0000-4000-8000-000000000096",
      });

      expect(result.assistantMessage.content).not.toContain(
        "Which supported platform",
      );
      expect(result.assistantMessage.content).toContain("Which platform");
      expect(vi.mocked(model.complete)).toHaveBeenCalled();
    } finally {
      if (previousEnabled === undefined) delete process.env.PUBLISHING_AUTHORITY_ENABLED;
      else process.env.PUBLISHING_AUTHORITY_ENABLED = previousEnabled;
    }
  });

  it("retries a rejected vision request with safe text metadata and keeps the asset attached", async () => {
    const [asset] = await createPendingMediaAssets(database.db, {
      userId,
      descriptors: [{ mimeType: "image/png", byteSize: 100 }],
      pendingExpiresAt: new Date(Date.now() + 60_000),
      hourlyLimit: 50,
      storageLimitBytes: 1024,
    });
    await markMediaAssetReady(database.db, {
      userId,
      assetId: asset!.id,
      mimeType: "image/png",
      byteSize: 80,
      width: 2,
      height: 2,
    });
    const media = {
      previewUrl: vi.fn().mockResolvedValue("https://media.invalid/preview"),
      modelImage: vi.fn().mockResolvedValue({
        mediaType: "image/png" as const,
        data: "aW1hZ2U=",
      }),
      deleteConversationAssets: vi.fn().mockResolvedValue(undefined),
    };
    const visionModel = {
      complete: vi.fn(),
    } as unknown as ModelProvider;
    service = new DefaultOrchestrationService(
      database.db,
      config,
      model,
      mcp,
      new PublishingPreferenceService(database.db),
      undefined,
      media,
      visionModel,
    );
    vi.mocked(visionModel.complete).mockRejectedValueOnce(
      new Error("vision input unsupported"),
    );
    vi.mocked(model.complete).mockResolvedValueOnce(
      modelCompletion({ content: "I can keep the image attached without describing it." }),
    );

    const result = await service.createConversation(userId, {
      message: "Draft a Threads post with this image",
      requestId: "00000000-0000-4000-8000-000000000098",
      mediaAssetIds: [asset!.id],
    });

    expect(visionModel.complete).toHaveBeenCalledTimes(1);
    expect(vi.mocked(visionModel.complete).mock.calls[0]![0].model).toBe(
      "vision-model",
    );
    expect(model.complete).toHaveBeenCalledTimes(1);
    expect(vi.mocked(model.complete).mock.calls[0]![0].model).toBe(
      "contract-model",
    );
    const firstMessages = vi.mocked(visionModel.complete).mock.calls[0]![0].messages;
    const secondMessages = vi.mocked(model.complete).mock.calls[0]![0].messages;
    expect(firstMessages.some((message) => message.content.some((block) => block.type === "image"))).toBe(true);
    expect(secondMessages.some((message) => message.content.some((block) => block.type === "image"))).toBe(false);
    expect(JSON.stringify(secondMessages)).toContain("Do not invent visual details");
    expect(result.userMessage.attachments).toHaveLength(1);
  });

  it("routes image turns to the vision provider and text-only turns to Sonnet", async () => {
    const [asset] = await createPendingMediaAssets(database.db, {
      userId,
      descriptors: [{ mimeType: "image/png", byteSize: 100 }],
      pendingExpiresAt: new Date(Date.now() + 60_000),
      hourlyLimit: 50,
      storageLimitBytes: 1024,
    });
    await markMediaAssetReady(database.db, {
      userId,
      assetId: asset!.id,
      mimeType: "image/png",
      byteSize: 80,
      width: 2,
      height: 2,
    });
    const media = {
      previewUrl: vi.fn().mockResolvedValue("https://media.invalid/preview"),
      modelImage: vi.fn().mockResolvedValue({
        mediaType: "image/png" as const,
        data: "aW1hZ2U=",
      }),
      deleteConversationAssets: vi.fn().mockResolvedValue(undefined),
    };
    const visionModel = {
      complete: vi.fn().mockResolvedValue(modelCompletion({ content: "Saw the image." })),
    } as unknown as ModelProvider;
    vi.mocked(model.complete).mockResolvedValue(
      modelCompletion({ content: "Text only reply." }),
    );
    service = new DefaultOrchestrationService(
      database.db,
      config,
      model,
      mcp,
      new PublishingPreferenceService(database.db),
      undefined,
      media,
      visionModel,
    );

    const withImage = await service.createConversation(userId, {
      message: "What is in this image?",
      requestId: "00000000-0000-4000-8000-000000000198",
      mediaAssetIds: [asset!.id],
    });
    expect(withImage.assistantMessage.content).toBe("Saw the image.");
    expect(visionModel.complete).toHaveBeenCalledTimes(1);
    expect(vi.mocked(visionModel.complete).mock.calls[0]![0].model).toBe(
      "vision-model",
    );
    expect(media.modelImage).toHaveBeenCalledWith(userId, asset!.id);
    expect(model.complete).not.toHaveBeenCalled();

    const fresh = await service.createConversation(userId, {
      message: "Draft a Threads update about shipping",
      requestId: "00000000-0000-4000-8000-000000000200",
    });
    expect(fresh.assistantMessage.content).toBe("Text only reply.");
    expect(vi.mocked(model.complete).mock.calls[0]![0].model).toBe(
      "contract-model",
    );
    expect(visionModel.complete).toHaveBeenCalledTimes(1);
  });

  it("stubs images when the vision kill switch is off", async () => {
    const [asset] = await createPendingMediaAssets(database.db, {
      userId,
      descriptors: [{ mimeType: "image/png", byteSize: 100 }],
      pendingExpiresAt: new Date(Date.now() + 60_000),
      hourlyLimit: 50,
      storageLimitBytes: 1024,
    });
    await markMediaAssetReady(database.db, {
      userId,
      assetId: asset!.id,
      mimeType: "image/png",
      byteSize: 80,
      width: 2,
      height: 2,
    });
    const media = {
      previewUrl: vi.fn().mockResolvedValue("https://media.invalid/preview"),
      modelImage: vi.fn().mockResolvedValue({
        mediaType: "image/png" as const,
        data: "aW1hZ2U=",
      }),
      deleteConversationAssets: vi.fn().mockResolvedValue(undefined),
    };
    service = new DefaultOrchestrationService(
      database.db,
      { ...config, theseanVisionEnabled: false },
      model,
      mcp,
      new PublishingPreferenceService(database.db),
      undefined,
      media,
    );
    vi.mocked(model.complete).mockResolvedValue(
      modelCompletion({ content: "Draft without pixels." }),
    );

    await service.createConversation(userId, {
      message: "Draft a Threads post with this image",
      requestId: "00000000-0000-4000-8000-000000000201",
      mediaAssetIds: [asset!.id],
    });

    expect(media.modelImage).not.toHaveBeenCalled();
    const messages = vi.mocked(model.complete).mock.calls[0]![0].messages;
    expect(messages.some((message) => message.content.some((block) => block.type === "image"))).toBe(false);
    expect(JSON.stringify(messages)).toContain("Visual analysis is unavailable");
    expect(vi.mocked(model.complete).mock.calls[0]![0].model).toBe("contract-model");
  });

  it("keeps large image bytes out of the context budget estimate", async () => {
    const [asset] = await createPendingMediaAssets(database.db, {
      userId,
      descriptors: [{ mimeType: "image/png", byteSize: 100 }],
      pendingExpiresAt: new Date(Date.now() + 60_000),
      hourlyLimit: 50,
      storageLimitBytes: 1024,
    });
    await markMediaAssetReady(database.db, {
      userId,
      assetId: asset!.id,
      mimeType: "image/png",
      byteSize: 80,
      width: 2,
      height: 2,
    });
    const hugeBase64 = "A".repeat(200_000);
    const media = {
      previewUrl: vi.fn().mockResolvedValue("https://media.invalid/preview"),
      modelImage: vi.fn().mockResolvedValue({
        mediaType: "image/png" as const,
        data: hugeBase64,
      }),
      deleteConversationAssets: vi.fn().mockResolvedValue(undefined),
    };
    const visionModel = {
      complete: vi.fn().mockResolvedValue(modelCompletion({ content: "Saw it." })),
    } as unknown as ModelProvider;
    service = new DefaultOrchestrationService(
      database.db,
      config,
      model,
      mcp,
      new PublishingPreferenceService(database.db),
      undefined,
      media,
      visionModel,
    );

    const result = await service.createConversation(userId, {
      message: "What is in this image?",
      requestId: "00000000-0000-4000-8000-000000000203",
      mediaAssetIds: [asset!.id],
    });

    expect(result.assistantMessage.content).toBe("Saw it.");
    expect(visionModel.complete).toHaveBeenCalled();
    expect(
      vi.mocked(visionModel.complete).mock.calls[0]![0].messages.some((message) =>
        message.content.some((block) => block.type === "image"),
      ),
    ).toBe(true);
  });

  it("keeps a multi-image triggering turn even when vision estimates exceed the history budget", async () => {
    const created = await createPendingMediaAssets(database.db, {
      userId,
      descriptors: [
        { mimeType: "image/png", byteSize: 100 },
        { mimeType: "image/png", byteSize: 100 },
        { mimeType: "image/png", byteSize: 100 },
        { mimeType: "image/png", byteSize: 100 },
        { mimeType: "image/png", byteSize: 100 },
      ],
      pendingExpiresAt: new Date(Date.now() + 60_000),
      hourlyLimit: 50,
      storageLimitBytes: 10_240,
    });
    for (const asset of created) {
      await markMediaAssetReady(database.db, {
        userId,
        assetId: asset.id,
        mimeType: "image/png",
        byteSize: 80,
        width: 2,
        height: 2,
      });
    }
    const media = {
      previewUrl: vi.fn().mockResolvedValue("https://media.invalid/preview"),
      modelImage: vi.fn().mockResolvedValue({
        mediaType: "image/png" as const,
        data: "aW1hZ2U=",
      }),
      deleteConversationAssets: vi.fn().mockResolvedValue(undefined),
    };
    const visionModel = {
      complete: vi.fn().mockResolvedValue(modelCompletion({ content: "Saw all five." })),
    } as unknown as ModelProvider;
    service = new DefaultOrchestrationService(
      database.db,
      { ...config, contextTokenLimit: 3000, outputTokenLimit: 1500 },
      model,
      mcp,
      new PublishingPreferenceService(database.db),
      undefined,
      media,
      visionModel,
    );

    const result = await service.createConversation(userId, {
      message: "Describe these images",
      requestId: "00000000-0000-4000-8000-000000000204",
      mediaAssetIds: created.map((asset) => asset.id),
    });

    expect(result.assistantMessage.content).toBe("Saw all five.");
    const imageCount = vi
      .mocked(visionModel.complete)
      .mock.calls[0]![0]
      .messages.flatMap((message) =>
        message.content.filter((block) => block.type === "image"),
      ).length;
    expect(imageCount).toBe(5);
  });

  it("skips direct live prepare when uploaded images have no usable caption", async () => {
    const previousEnabled = process.env.PUBLISHING_AUTHORITY_ENABLED;
    process.env.PUBLISHING_AUTHORITY_ENABLED = "true";
    await updatePublishingPreference(database.db, {
      userId,
      expectedRevision: 0,
      mode: "full_access",
      source: "settings",
      currentConsentVersion: "2026-08-01",
      acknowledged: true,
      consentVersion: "2026-08-01",
    });
    const [asset] = await createPendingMediaAssets(database.db, {
      userId,
      descriptors: [{ mimeType: "image/png", byteSize: 100 }],
      pendingExpiresAt: new Date(Date.now() + 60_000),
      hourlyLimit: 50,
      storageLimitBytes: 1024,
    });
    await markMediaAssetReady(database.db, {
      userId,
      assetId: asset!.id,
      mimeType: "image/png",
      byteSize: 80,
      width: 2,
      height: 2,
    });
    const media = {
      previewUrl: vi.fn().mockResolvedValue("https://media.invalid/preview"),
      modelImage: vi.fn().mockResolvedValue({
        mediaType: "image/png" as const,
        data: "aW1hZ2U=",
      }),
      deleteConversationAssets: vi.fn().mockResolvedValue(undefined),
    };
    const review = {
      updateDraft: vi.fn(),
      publishGroup: vi.fn(),
      checkAttempt: vi.fn(),
    } as unknown as ReviewService;
    const visionModel = {
      complete: vi.fn().mockResolvedValue(
        modelCompletion({ content: "Generated a caption from the image." }),
      ),
    } as unknown as ModelProvider;
    service = new DefaultOrchestrationService(
      database.db,
      config,
      model,
      mcp,
      new PublishingPreferenceService(database.db),
      review,
      media,
      visionModel,
    );

    try {
      const result = await service.createConversation(userId, {
        message: "Post this on Threads",
        requestId: "00000000-0000-4000-8000-000000000202",
        mediaAssetIds: [asset!.id],
      });

      expect(review.publishGroup).not.toHaveBeenCalled();
      expect(visionModel.complete).toHaveBeenCalled();
      expect(vi.mocked(visionModel.complete).mock.calls[0]![0].model).toBe(
        "vision-model",
      );
      expect(result.assistantMessage.content).toBe(
        "Generated a caption from the image.",
      );
    } finally {
      if (previousEnabled === undefined) delete process.env.PUBLISHING_AUTHORITY_ENABLED;
      else process.env.PUBLISHING_AUTHORITY_ENABLED = previousEnabled;
    }
  });

  it("keeps tool and review activity on the turn that created it", async () => {
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_review_owned", "prepare_review", {
              variants: [
                { platform: "threads", body: "Launch day", mediaUrls: [] },
              ],
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({ content: "Your Threads draft is ready to review." }),
      )
      .mockResolvedValueOnce(
        modelCompletion({ content: "Tell me what you would like to change." }),
      );

    const prepared = await service.createConversation(userId, {
      message: "Draft Launch day on Threads",
      requestId: "00000000-0000-4000-8000-000000000022",
    });
    const plain = await service.addMessage(userId, prepared.conversation.id, {
      message: "Explain the options for Threads",
      requestId: "00000000-0000-4000-8000-000000000023",
    });
    const restored = await service.getConversation(
      userId,
      prepared.conversation.id,
      { limit: 25 },
    );

    expect(plain.turnActivity).toBeNull();
    expect(restored.turnActivities).toHaveLength(1);
    expect(restored.turnActivities[0]).toMatchObject({
      requestMessageId: prepared.userMessage.id,
      assistantMessageId: prepared.assistantMessage.id,
    });
    expect(restored.turnActivities[0]?.reviewGroups).toHaveLength(1);
    expect(
      restored.turnActivities.some(
        (activity) => activity.assistantMessageId === plain.assistantMessage.id,
      ),
    ).toBe(false);
  });

  it("keeps an invalid Instagram review draft editable with a safe blocking error", async () => {
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_review", "prepare_review", {
              variants: [
                { platform: "instagram", body: "Launch day", mediaUrls: [] },
              ],
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({ content: "Add media to finish your Instagram draft." }),
      );

    const result = await service.createConversation(userId, {
      message: "Draft Launch day on Instagram",
      requestId: "00000000-0000-4000-8000-000000000013",
    });

    expect(result.reviewGroups[0]?.drafts[0]?.validation.errors).toContain(
      "Instagram requires at least one image.",
    );
    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it("uses only the current message image for a contextual review follow up", async () => {
    const [asset] = await createPendingMediaAssets(database.db, {
      userId,
      descriptors: [{ mimeType: "image/jpeg", byteSize: 100 }],
      pendingExpiresAt: new Date(Date.now() + 60_000),
      hourlyLimit: 50,
      storageLimitBytes: 1024,
    });
    await markMediaAssetReady(database.db, {
      userId,
      assetId: asset!.id,
      mimeType: "image/jpeg",
      byteSize: 80,
      width: 2,
      height: 2,
    });
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({ content: "Would you like a caption, or image only?" }),
      )
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_review", "prepare_review", {
              variants: [
                {
                  platform: "threads",
                  body: "",
                  mediaUrls: [],
                  attachmentIndexes: [0],
                },
              ],
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({ content: "Your Threads draft is ready to review." }),
      );

    const first = await service.createConversation(userId, {
      message: "Post this image on Threads",
      requestId: "00000000-0000-4000-8000-000000000014",
      mediaAssetIds: [asset!.id],
    });
    const confirmed = await service.addMessage(userId, first.conversation.id, {
      message: "Image only",
      requestId: "00000000-0000-4000-8000-000000000015",
      mediaAssetIds: [asset!.id],
    });

    expect(confirmed.run?.targetPlatforms).toEqual(["threads"]);
    expect(confirmed.reviewGroups[0]?.drafts[0]).toMatchObject({
      platform: "threads",
      body: "",
      validation: { errors: [] },
    });
    expect(confirmed.reviewGroups[0]?.drafts[0]?.mediaItems).toEqual([
      { assetId: asset!.id, externalUrl: null },
    ]);
    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it("returns the original terminal result for a repeated request id (AC-1)", async () => {
    vi.mocked(model.complete).mockResolvedValue(
      modelCompletion({ content: "Ready" }),
    );
    const input = {
      message: "Preview this on Threads",
      requestId: "00000000-0000-4000-8000-000000000003",
    };

    const first = await service.createConversation(userId, input);
    const repeated = await service.createConversation(userId, input);

    expect(repeated).toEqual(first);
    expect(model.complete).toHaveBeenCalledTimes(1);
    const messages = await database.db
      .select()
      .from(orchestrationMessages)
      .where(eq(orchestrationMessages.conversationId, first.conversation.id));
    expect(messages).toHaveLength(2);
  });

  it("redacts MCP errors before they reach the model or database (AC-6, AC-7, AC-9)", async () => {
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_secret", "validate_post", {
              platforms: ["threads"],
              text: "Launch",
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(modelCompletion({ content: "Safe result" }));
    vi.mocked(mcp.callTool).mockResolvedValue({
      attempts: 1,
      value: {
        ok: false,
        valid: false,
        errors: ["Bearer top.secret-token"],
        authorization: "Bearer top.secret-token",
      },
    });

    const result = await service.createConversation(userId, {
      message: "Validate Launch on Threads",
      requestId: "00000000-0000-4000-8000-000000000004",
    });

    const secondModelInput = vi.mocked(model.complete).mock.calls[1]?.[0];
    expect(JSON.stringify(secondModelInput)).not.toContain("top.secret-token");
    expect(JSON.stringify(result)).not.toContain("top.secret-token");
    const stored = await database.db
      .select()
      .from(orchestrationToolCalls)
      .where(eq(orchestrationToolCalls.runId, result.run!.id));
    expect(JSON.stringify(stored)).not.toContain("top.secret-token");
  });

  it("stops at the configured tool step cap with a chat reply (AC-3, AC-10)", async () => {
    service = new DefaultOrchestrationService(
      database.db,
      { ...config, maxToolSteps: 2 },
      model,
      mcp,
    );
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_1", "validate_post", {
              platforms: ["threads"],
              text: "Launch",
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_2", "validate_post", {
              platforms: ["threads"],
              text: "Launch",
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({
          content:
            "I need a tighter plan before I keep calling tools. Confirm the first post time and I will continue.",
        }),
      );
    vi.mocked(mcp.callTool).mockResolvedValue({
      attempts: 1,
      value: { ok: true, valid: true },
    });

    const result = await service.createConversation(userId, {
      message: "Validate Launch on Threads",
      requestId: "00000000-0000-4000-8000-000000000005",
    });
    expect(result.run?.status).toBe("completed");
    expect(result.assistantMessage.content).toContain("tighter plan");
    expect(model.complete).toHaveBeenCalledTimes(3);
    expect(mcp.callTool).toHaveBeenCalledTimes(1);
  });

  it("persists a safe failed run after SocialMCP terminal failure (AC-7)", async () => {
    vi.mocked(model.complete).mockResolvedValue(
      modelCompletion({
        toolCalls: [
          toolCall("call_fail", "publish_now", {
            platforms: ["threads"],
            text: "Launch",
          }),
        ],
      }),
    );
    vi.mocked(mcp.callTool).mockRejectedValue(
      new OrchestrationError(
        "SOCIALMCP_UNAVAILABLE",
        502,
        "Bearer private-secret",
      ),
    );

    const result = await service.createConversation(userId, {
      message: "Post Launch on Threads",
      requestId: "00000000-0000-4000-8000-000000000006",
    });

    expect(result.run).toMatchObject({
      status: "failed",
      safeError: "SOCIALMCP_UNAVAILABLE",
    });
    expect(result.assistantMessage.content).toContain(
      "social account service",
    );
    expect(JSON.stringify(result)).not.toContain("private-secret");
  });

  it("rejects oversized input before model or MCP execution (AC-10)", async () => {
    await expect(
      service.createConversation(userId, {
        message: "x".repeat(8001),
        requestId: "00000000-0000-4000-8000-000000000007",
      }),
    ).rejects.toMatchObject({ code: "INVALID_MESSAGE", status: 422 });
    expect(model.complete).not.toHaveBeenCalled();
    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it("keeps the triggering message while omitting old history outside the context budget (AC-8)", async () => {
    const oldMarker = `old-marker-${"x".repeat(900)}`;
    const turn = await createConversationTurn(database.db, {
      userId,
      requestId: "00000000-0000-4000-8000-000000000009",
      content: oldMarker,
      title: "Old context",
      assistantContent: "Old response",
    });
    for (let index = 0; index < 3; index += 1) {
      await appendConversationTurn(database.db, turn.conversation.id, {
        userId,
        requestId: `00000000-0000-4000-8000-00000000001${index}`,
        content: `middle-${index}-${"y".repeat(900)}`,
        assistantContent: `middle response ${index}`,
      });
    }
    service = new DefaultOrchestrationService(
      database.db,
      {
        ...config,
        contextTokenLimit: 2500,
        outputTokenLimit: 500,
      },
      model,
      mcp,
    );
    vi.mocked(model.complete).mockResolvedValue(
      modelCompletion({ content: "Ready" }),
    );

    await service.addMessage(userId, turn.conversation.id, {
      message: "Preview the current update on Threads",
      requestId: "00000000-0000-4000-8000-000000000020",
    });

    const sentMessages = vi.mocked(model.complete).mock.calls[0]?.[0].messages;
    expect(JSON.stringify(sentMessages)).toContain(
      "Preview the current update on Threads",
    );
    expect(JSON.stringify(sentMessages)).not.toContain("old-marker");
    const storedMessages = await database.db
      .select()
      .from(orchestrationMessages)
      .where(eq(orchestrationMessages.conversationId, turn.conversation.id));
    expect(storedMessages.some((row) => row.content === oldMarker)).toBe(true);
  });

  it("paginates conversation lists and message history without overlap (AC-1, AC-9)", async () => {
    vi.mocked(model.complete).mockResolvedValue(
      modelCompletion({ content: "Noted." }),
    );
    const conversationIds: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const created = await service.createConversation(userId, {
        message: `Hello for pagination ${index}`,
        requestId: `00000000-0000-4000-8000-00000000003${index}`,
      });
      conversationIds.push(created.conversation.id);
    }
    const firstList = await service.listConversations(userId, { limit: 2 });
    const secondList = await service.listConversations(userId, {
      limit: 2,
      cursor: firstList.nextCursor!,
    });

    expect(firstList.conversations).toHaveLength(2);
    expect(secondList.conversations).toHaveLength(1);
    expect(
      new Set(
        [...firstList.conversations, ...secondList.conversations].map(
          (row) => row.id,
        ),
      ),
    ).toEqual(new Set(conversationIds));

    const targetId = conversationIds[0]!;
    await service.addMessage(userId, targetId, {
      message: "Follow up for pagination again",
      requestId: "00000000-0000-4000-8000-000000000040",
    });
    await service.addMessage(userId, targetId, {
      message: "Follow up for pagination once more",
      requestId: "00000000-0000-4000-8000-000000000041",
    });
    const firstHistory = await service.getConversation(userId, targetId, {
      limit: 2,
    });
    const secondHistory = await service.getConversation(userId, targetId, {
      limit: 2,
      cursor: firstHistory.nextCursor!,
    });

    expect(firstHistory.messages).toHaveLength(2);
    expect(secondHistory.messages).toHaveLength(2);
    expect(
      firstHistory.messages.some((first) =>
        secondHistory.messages.some((second) => second.id === first.id),
      ),
    ).toBe(false);
  });

  it("returns invalid model tool names for correction without calling MCP (AC-3, AC-7)", async () => {
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [toolCall("call_unknown", "delete_account", {})],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({ content: "I need a supported action." }),
      );

    const result = await service.createConversation(userId, {
      message: "Preview this on Threads",
      requestId: "00000000-0000-4000-8000-000000000050",
    });

    expect(result.run?.status).toBe("completed");
    expect(mcp.callTool).not.toHaveBeenCalled();
    const correctionInput = vi.mocked(model.complete).mock.calls[1]?.[0];
    expect(JSON.stringify(correctionInput)).toContain(
      "INVALID_TOOL_ARGUMENTS",
    );
  });

  it("makes no external call when the initial database transaction fails (AC-7)", async () => {
    await expect(
      service.createConversation("user_missing", {
        message: "Post Launch on Threads",
        requestId: "00000000-0000-4000-8000-000000000008",
      }),
    ).rejects.toBeDefined();
    expect(model.complete).not.toHaveBeenCalled();
    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it("streams step events without thinking when the flag is off (SOC-8 AC-3, AC-5)", async () => {
    const events: Array<{ type: string; step?: string | number; delta?: string }> = [];
    vi.mocked(model.complete)
      .mockImplementationOnce(async (input) => {
        expect(input.thinking).toEqual({
          enabled: false,
          budgetTokens: 2048,
        });
        expect(input.stream).toBeDefined();
        return modelCompletion({
          toolCalls: [
            toolCall("call_review", "prepare_review", {
              variants: [
                { platform: "threads", body: "Launch day", mediaUrls: [] },
              ],
            }),
          ],
        });
      })
      .mockResolvedValueOnce(
        modelCompletion({ content: "Your Threads draft is ready to review." }),
      );

    const result = await service.createConversationStream(
      userId,
      {
        message: "Draft Launch day on Threads",
        requestId: "00000000-0000-4000-8000-000000000801",
      },
      {
        emit(event) {
          events.push(event);
        },
      },
    );

    expect(result.run?.thinkingText ?? null).toBeNull();
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "turn_started",
        "step_started",
        "step_completed",
        "turn_completed",
      ]),
    );
    expect(events.some((event) => event.type === "thinking_delta")).toBe(false);
    expect(events.some((event) => event.type === "thinking_completed")).toBe(
      false,
    );
    expect(
      events.some(
        (event) =>
          event.type === "step_started" && event.step === "preparing_draft",
      ),
    ).toBe(true);
  });

  it("does not stream thinking events even when the thinking flag is set", async () => {
    const events: Array<{ type: string; step?: string | number; delta?: string }> = [];
    service = new DefaultOrchestrationService(
      database.db,
      {
        ...config,
        theseanThinkingEnabled: true,
        theseanThinkingBudgetTokens: 1024,
      },
      model,
      mcp,
    );
    vi.mocked(model.complete)
      .mockImplementationOnce(async (input) => {
        expect(input.thinking).toEqual({
          enabled: false,
          budgetTokens: 1024,
        });
        return modelCompletion({
          thinking: "Consider Threads tone",
          toolCalls: [
            toolCall("call_review", "prepare_review", {
              variants: [
                { platform: "threads", body: "Launch day", mediaUrls: [] },
              ],
            }),
          ],
        });
      })
      .mockImplementationOnce(async () =>
        modelCompletion({
          content: "Your Threads draft is ready to review.",
        }),
      );

    const result = await service.createConversationStream(
      userId,
      {
        message: "Draft Launch day on Threads",
        requestId: "00000000-0000-4000-8000-000000000802",
      },
      {
        emit(event) {
          events.push(event);
        },
      },
    );

    expect(result.run?.thinkingText ?? null).toBeNull();
    expect(events.some((event) => event.type === "thinking_delta")).toBe(false);
    expect(events.some((event) => event.type === "thinking_completed")).toBe(
      false,
    );
    expect(
      events.some(
        (event) =>
          event.type === "step_started" && event.step === "preparing_draft",
      ),
    ).toBe(true);
  });
});

describe("DefaultOrchestrationService setup agent", () => {
  let database: Database;
  let userId: string;
  let model: ModelProvider;
  let mcp: SocialMcpGateway;
  let service: DefaultOrchestrationService;

  const setupConfig: OrchestrationConfig = {
    ...config,
    setupAgentEnabled: true,
  };

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "setup-orch@example.com")).id;
    model = { complete: vi.fn() };
    mcp = { callTool: vi.fn(), listTools: vi.fn() };
    service = new DefaultOrchestrationService(
      database.db,
      setupConfig,
      model,
      mcp,
    );
  });

  it("routes incomplete profiles to the setup model (AC-2)", async () => {
    vi.mocked(model.complete).mockResolvedValueOnce(
      modelCompletion({
        content: "What is your business name?",
      }),
    );

    const result = await service.createConversation(userId, {
      message: "Hello",
      requestId: "00000000-0000-4000-8000-00000000f701",
    });

    expect(result.conversation.title).toBe("Business setup");
    expect(result.run?.model).toBe("setup-model");
    expect(model.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "setup-model",
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "update_business_identity" }),
        ]),
      }),
    );
    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it("injects the compiled profile note after setup is complete (AC-6)", async () => {
    await patchBusinessProfile(database.db, userId, {
      businessName: "Orch Tools",
      businessDescription: "Hand tools for makers",
      competitorsSkipped: true,
      setupStatus: "in_progress",
    });
    await createProfileEntry(database.db, {
      userId,
      category: "tone",
      body: "Warm and short",
      source: "setup",
    });
    await tryCompleteSetupIfReady(database.db, userId);

    vi.mocked(model.complete).mockResolvedValueOnce(
      modelCompletion({ content: "Draft for Orch Tools." }),
    );

    await service.createConversation(userId, {
      message: "Draft a short LinkedIn hello",
      requestId: "00000000-0000-4000-8000-00000000f702",
    });

    expect(model.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "contract-model",
        system: expect.stringContaining("Business profile note (authoritative)"),
      }),
    );
    const system = vi.mocked(model.complete).mock.calls[0]?.[0]?.system as string;
    expect(system).toContain("Orch Tools");
  });

  it("asks for confirm before mid chat profile pivots (AC-7)", async () => {
    await patchBusinessProfile(database.db, userId, {
      businessName: "Pivot Co",
      businessDescription: "Hardware",
      competitorsSkipped: true,
      setupStatus: "in_progress",
    });
    await createProfileEntry(database.db, {
      userId,
      category: "tone",
      body: "Direct",
      source: "setup",
    });
    await tryCompleteSetupIfReady(database.db, userId);

    const result = await service.createConversation(userId, {
      message:
        "We are pivoting the business to sell only software now, not hardware.",
      requestId: "00000000-0000-4000-8000-00000000f703",
    });

    expect(model.complete).not.toHaveBeenCalled();
    expect(result.intentQuestions?.[0]?.id).toBe("profile_update");
    expect(result.assistantMessage.content).toMatch(/confirm/i);
  });

  it("writes operator_confirm entries after profile_update yes (AC-7)", async () => {
    await patchBusinessProfile(database.db, userId, {
      businessName: "Pivot Co",
      businessDescription: "Hardware",
      competitorsSkipped: true,
      setupStatus: "in_progress",
    });
    await createProfileEntry(database.db, {
      userId,
      category: "tone",
      body: "Direct",
      source: "setup",
    });
    await tryCompleteSetupIfReady(database.db, userId);

    const opened = await service.createConversation(userId, {
      message:
        "We are pivoting the business to sell only software now, not hardware.",
      requestId: "00000000-0000-4000-8000-00000000f704",
    });

    vi.mocked(model.complete).mockResolvedValueOnce(
      modelCompletion({ content: "Profile updated." }),
    );

    const confirmed = await service.addMessage(
      userId,
      opened.conversation.id,
      {
        message: "Yes, update the profile.",
        requestId: "00000000-0000-4000-8000-00000000f705",
        intentAnswers: [
          {
            questionId: "profile_update",
            optionId: "yes",
            customText: "Business now sells only software.",
          },
        ],
      },
    );

    expect(confirmed.run?.status).toBe("completed");
    const entries = await listProfileEntries(database.db, {
      userId,
      category: "brand_fact",
      limit: 20,
    });
    const operatorConfirm = entries.items.filter(
      (item) => item.source === "operator_confirm",
    );
    expect(operatorConfirm).toHaveLength(1);
    expect(operatorConfirm[0]?.body).toContain("software");
  });
});

describe("DefaultOrchestrationService conversation titles", () => {
  let database: Database;
  let userId: string;
  let model: ModelProvider;
  let mcp: SocialMcpGateway;
  let service: DefaultOrchestrationService;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.client`delete from users`;
    userId = (await provisionUser(database.db, "titles@example.com")).id;
    model = { complete: vi.fn() };
    mcp = { callTool: vi.fn(), listTools: vi.fn() };
    service = new DefaultOrchestrationService(
      database.db,
      config,
      model,
      mcp,
    );
  });

  it("names greeting opens as New chat instead of Hi", async () => {
    vi.mocked(model.complete).mockResolvedValueOnce(
      modelCompletion({ content: "How can I help?" }),
    );

    const result = await service.createConversation(userId, {
      message: "Hi",
      requestId: "00000000-0000-4000-8000-00000000a001",
    });

    expect(result.conversation.title).toBe("New chat");
    expect(model.complete).toHaveBeenCalledTimes(1);
  });

  it("renames once after a follow-up clarifies the goal", async () => {
    vi.mocked(model.complete)
      .mockResolvedValueOnce(modelCompletion({ content: "Hello — tell me more." }))
      .mockResolvedValueOnce(
        modelCompletion({ content: "Here is a Threads draft." }),
      )
      .mockResolvedValueOnce(modelCompletion({ content: "Threads launch draft" }));

    const first = await service.createConversation(userId, {
      message: "Hi",
      requestId: "00000000-0000-4000-8000-00000000a002",
    });
    expect(first.conversation.title).toBe("New chat");

    const second = await service.addMessage(userId, first.conversation.id, {
      message: "Draft a Threads post about our product launch",
      requestId: "00000000-0000-4000-8000-00000000a003",
    });

    expect(second.conversation.title).toBe("Threads launch draft");
    expect(model.complete).toHaveBeenCalledTimes(3);
    expect(vi.mocked(model.complete).mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({
        system: expect.stringContaining("conversation title"),
        tools: [],
        maxTokens: 32,
      }),
    );

    vi.mocked(model.complete).mockResolvedValueOnce(
      modelCompletion({ content: "Updated draft." }),
    );
    const third = await service.addMessage(userId, first.conversation.id, {
      message: "Make it shorter",
      requestId: "00000000-0000-4000-8000-00000000a004",
    });
    expect(third.conversation.title).toBe("Threads launch draft");
    expect(model.complete).toHaveBeenCalledTimes(4);
  });
});
