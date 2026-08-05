import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  appendConversationTurn,
  createPendingMediaAssets,
  createConversationTurn,
  createDb,
  drafts,
  orchestrationMessages,
  orchestrationRuns,
  orchestrationToolCalls,
  markMediaAssetReady,
  provisionUser,
  requireTestDatabaseUrl,
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
    toolCalls?: Array<{ id: string; name: string; input: unknown }>;
    attempts?: number;
  } = {},
) {
  return {
    content: input.content ?? null,
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

  it("stores a clarification without calling external services (AC-2)", async () => {
    const result = await service.createConversation(userId, {
      message: "Post this everywhere",
      requestId: "00000000-0000-4000-8000-000000000002",
    });

    expect(result.run).toBeNull();
    expect(result.assistantMessage.content).toContain(
      "Please name Threads, LinkedIn, Instagram",
    );
    expect(model.complete).not.toHaveBeenCalled();
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
        toolCalls: [toolCall("intent_1", "resolve_live_publish_intent", {
          explicitLivePublish: true,
        })],
      }))
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
      });
      expect(vi.mocked(model.complete).mock.calls[0]?.[0]).toMatchObject({
        toolChoice: { type: "tool", name: "resolve_live_publish_intent" },
        model: "intent-model",
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
      expect(vi.mocked(model.complete).mock.calls[1]?.[0].system).toContain(
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

  it("keeps Full access in review when product intent classification is not explicit", async () => {
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
          explicitLivePublish: false,
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
        message: "Ship the Threads launch post now",
        requestId: "00000000-0000-4000-8000-000000000097",
      });

      expect(result.run).toMatchObject({
        publishingMode: "full_access",
        explicitLiveIntent: false,
      });
      expect(review.publishGroup).not.toHaveBeenCalled();
      expect(result.assistantMessage.content).toBe("Prepared a review set.");
    } finally {
      if (previousEnabled === undefined) delete process.env.PUBLISHING_AUTHORITY_ENABLED;
      else process.env.PUBLISHING_AUTHORITY_ENABLED = previousEnabled;
    }
  });

  it("skips intent classification on platform-clarify turns", async () => {
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

    try {
      const result = await service.createConversation(userId, {
        message: "Publish this",
        requestId: "00000000-0000-4000-8000-000000000096",
      });

      expect(result.run).toBeNull();
      expect(result.assistantMessage.content).toContain("Which supported platform");
      expect(vi.mocked(model.complete)).not.toHaveBeenCalled();
    } finally {
      if (previousEnabled === undefined) delete process.env.PUBLISHING_AUTHORITY_ENABLED;
      else process.env.PUBLISHING_AUTHORITY_ENABLED = previousEnabled;
    }
  });

  it("retries a rejected vision request with safe text metadata and keeps the asset attached", async () => {
    const previousVision = process.env.THESEAN_VISION_ENABLED;
    process.env.THESEAN_VISION_ENABLED = "true";
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
      config,
      model,
      mcp,
      new PublishingPreferenceService(database.db),
      undefined,
      media,
    );
    vi.mocked(model.complete)
      .mockRejectedValueOnce(new Error("vision input unsupported"))
      .mockResolvedValueOnce(modelCompletion({ content: "I can keep the image attached without describing it." }));

    try {
      const result = await service.createConversation(userId, {
        message: "Draft a Threads post with this image",
        requestId: "00000000-0000-4000-8000-000000000098",
        mediaAssetIds: [asset!.id],
      });

      expect(model.complete).toHaveBeenCalledTimes(2);
      const firstMessages = vi.mocked(model.complete).mock.calls[0]![0].messages;
      const secondMessages = vi.mocked(model.complete).mock.calls[1]![0].messages;
      expect(firstMessages.some((message) => message.content.some((block) => block.type === "image"))).toBe(true);
      expect(secondMessages.some((message) => message.content.some((block) => block.type === "image"))).toBe(false);
      expect(JSON.stringify(secondMessages)).toContain("Do not invent visual details");
      expect(result.userMessage.attachments).toHaveLength(1);
    } finally {
      if (previousVision === undefined) delete process.env.THESEAN_VISION_ENABLED;
      else process.env.THESEAN_VISION_ENABLED = previousVision;
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

  it("inherits the platform and image for a contextual review follow up", async () => {
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

  it("stops at the configured tool step cap (AC-3, AC-10)", async () => {
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
      );
    vi.mocked(mcp.callTool).mockResolvedValue({
      attempts: 1,
      value: { ok: true, valid: true },
    });

    await expect(
      service.createConversation(userId, {
        message: "Validate Launch on Threads",
        requestId: "00000000-0000-4000-8000-000000000005",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_TOOL_ARGUMENTS",
      status: 422,
    });
    expect(model.complete).toHaveBeenCalledTimes(2);
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

    let rejection: OrchestrationError | undefined;
    try {
      await service.createConversation(userId, {
        message: "Post Launch on Threads",
        requestId: "00000000-0000-4000-8000-000000000006",
      });
    } catch (error) {
      rejection = error as OrchestrationError;
    }

    expect(rejection).toMatchObject({
      code: "SOCIALMCP_UNAVAILABLE",
      status: 502,
    });
    expect(JSON.stringify(rejection!.details)).not.toContain("private-secret");
    const [run] = await database.db
      .select()
      .from(orchestrationRuns)
      .where(
        eq(
          orchestrationRuns.id,
          String(rejection!.details?.runId),
        ),
      );
    expect(run).toMatchObject({
      status: "failed",
      safeError: "SOCIALMCP_UNAVAILABLE",
    });
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
    const conversationIds: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const created = await service.createConversation(userId, {
        message: `Post this everywhere ${index}`,
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
      message: "Post this everywhere again",
      requestId: "00000000-0000-4000-8000-000000000040",
    });
    await service.addMessage(userId, targetId, {
      message: "Post this everywhere once more",
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
});
