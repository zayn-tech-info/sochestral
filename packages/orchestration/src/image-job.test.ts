import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  brandAssets,
  createBrandAsset,
  createDb,
  createPendingMediaAssets,
  fallbackBrandBriefText,
  getOwnedImageJob,
  listBrandAssets,
  listImageJobInputs,
  markBrandBriefFailed,
  markBrandBriefReady,
  markMediaAssetReady,
  pickBrandJobExemplars,
  provisionUser,
  requireTestDatabaseUrl,
  scheduleBrandBriefCompile,
  type Database,
} from "@sochestral/database";
import type { OrchestrationConfig } from "./config.js";
import type { SocialMcpGateway } from "./mcp.js";
import type { ModelProvider } from "./model.js";
import { DefaultOrchestrationService } from "./service.js";

const config: OrchestrationConfig = {
  theseanApiKey: "unused",
  theseanModel: "contract-model",
  theseanIntentModel: "intent-model",
  theseanVisionModel: "vision-model",
  theseanSetupModel: "setup-model",
  theseanVoiceModel: "voice-model",
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

function modelCompletion(input: {
  content?: string | null;
  toolCalls?: Array<{ id: string; name: string; input: unknown }>;
}) {
  return {
    content: input.content ?? null,
    thinking: null,
    toolCalls: input.toolCalls ?? [],
    inputTokens: 10,
    outputTokens: 5,
    attempts: 1,
  };
}

function toolCall(
  id: string,
  name: string,
  args: Record<string, unknown>,
) {
  return { id, name, input: args };
}

async function readyMedia(db: Database["db"], userId: string) {
  const [asset] = await createPendingMediaAssets(db, {
    userId,
    descriptors: [{ mimeType: "image/png", byteSize: 80 }],
    pendingExpiresAt: new Date(Date.now() + 60_000),
    hourlyLimit: 50,
    storageLimitBytes: 1024,
  });
  await markMediaAssetReady(db, {
    userId,
    assetId: asset!.id,
    mimeType: "image/png",
    byteSize: 80,
    width: 2,
    height: 2,
  });
  return asset!.id;
}

describe("propose_image_job brand packing", () => {
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
    userId = (await provisionUser(database.db, "image-job@example.com")).id;
    model = { complete: vi.fn() };
    mcp = { callTool: vi.fn(), listTools: vi.fn() };
    service = new DefaultOrchestrationService(
      database.db,
      config,
      model,
      mcp,
    );
  });

  it("injects a ready brief as text and never attaches brand gallery pixels (AC-4)", async () => {
    await createBrandAsset(database.db, {
      userId,
      kind: "color",
      name: "Primary",
      colorValue: "#111111",
    });
    await scheduleBrandBriefCompile(database.db, userId);
    await markBrandBriefReady(database.db, {
      userId,
      sourceHash: "ready-hash",
      briefText: "Navy blocks, mark top left.",
    });
    const visionModel = {
      complete: vi.fn(),
    } as unknown as ModelProvider;
    service = new DefaultOrchestrationService(
      database.db,
      config,
      model,
      mcp,
      undefined,
      undefined,
      undefined,
      visionModel,
    );
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_img", "propose_image_job", {
              kind: "generate",
              prompt: "A product flyer",
              brandIntent: "use",
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({ content: "Confirm Generate when you are ready." }),
      );

    await service.createConversation(userId, {
      message: "Make a branded flyer",
      requestId: "00000000-0000-4000-8000-0000000000b1",
    });

    expect(visionModel.complete).not.toHaveBeenCalled();
    const first = vi.mocked(model.complete).mock.calls[0]![0];
    expect(first.system).toContain("Navy blocks, mark top left.");
    expect(
      first.messages.some((message) =>
        message.content.some((block) => block.type === "image"),
      ),
    ).toBe(false);
  });

  it("packs logo plus two newest refs and prepends the brief when brandIntent is use (AC-6, AC-8)", async () => {
    const logoId = await readyMedia(database.db, userId);
    const oldId = await readyMedia(database.db, userId);
    const midId = await readyMedia(database.db, userId);
    const newId = await readyMedia(database.db, userId);
    const logo = await createBrandAsset(database.db, {
      userId,
      kind: "logo",
      name: "Mark",
      mediaAssetId: logoId,
    });
    const older = await createBrandAsset(database.db, {
      userId,
      kind: "reference_image",
      name: "Old",
      mediaAssetId: oldId,
    });
    const mid = await createBrandAsset(database.db, {
      userId,
      kind: "reference_image",
      name: "Mid",
      mediaAssetId: midId,
    });
    const newest = await createBrandAsset(database.db, {
      userId,
      kind: "reference_image",
      name: "New",
      mediaAssetId: newId,
    });
    await database.db
      .update(brandAssets)
      .set({ createdAt: new Date("2026-08-01T10:00:00.000Z") })
      .where(eq(brandAssets.id, older.id));
    await database.db
      .update(brandAssets)
      .set({ createdAt: new Date("2026-08-01T11:00:00.000Z") })
      .where(eq(brandAssets.id, mid.id));
    await database.db
      .update(brandAssets)
      .set({ createdAt: new Date("2026-08-01T12:00:00.000Z") })
      .where(eq(brandAssets.id, newest.id));
    await scheduleBrandBriefCompile(database.db, userId);
    await markBrandBriefReady(database.db, {
      userId,
      sourceHash: "use-hash",
      briefText: "Keep the mark small in the corner.",
    });

    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_img", "propose_image_job", {
              kind: "generate",
              prompt: "A summer sale flyer",
              brandIntent: "use",
              brandAssetIds: [older.id],
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({ content: "Confirm Generate when you are ready." }),
      );

    const result = await service.createConversation(userId, {
      message: "Use my brand for a flyer",
      requestId: "00000000-0000-4000-8000-0000000000b2",
    });
    const jobId = (result.toolSummaries[0]?.summary as { jobId?: string })
      .jobId;
    expect(jobId).toBeTruthy();
    const inputs = await listImageJobInputs(database.db, jobId!);
    const brandInputs = inputs.filter((row) => row.role === "brand");
    expect(brandInputs).toHaveLength(3);
    expect(brandInputs.map((row) => row.brandAssetId)).toEqual([
      logo.id,
      newest.id,
      mid.id,
    ]);
    const expected = pickBrandJobExemplars(
      await listBrandAssets(database.db, { userId }),
    );
    expect(brandInputs.map((row) => row.brandAssetId)).toEqual(
      expected.map((item) => item.id),
    );

    const job = await getOwnedImageJob(database.db, userId, jobId!);
    expect(job?.prompt).toContain("Keep the mark small in the corner.");
    expect(job?.prompt).toContain("A summer sale flyer");
  });

  it("leaves skip jobs brand free (AC-5)", async () => {
    await createBrandAsset(database.db, {
      userId,
      kind: "logo",
      name: "Mark",
      mediaAssetId: await readyMedia(database.db, userId),
    });
    await scheduleBrandBriefCompile(database.db, userId);
    await markBrandBriefReady(database.db, {
      userId,
      sourceHash: "skip-hash",
      briefText: "Should not appear on skip.",
    });
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_img", "propose_image_job", {
              kind: "generate",
              prompt: "A random sunset",
              brandIntent: "skip",
              brandAssetIds: ["ba_should_ignore"],
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({ content: "Confirm Generate when you are ready." }),
      );

    const result = await service.createConversation(userId, {
      message: "Generate a random sunset",
      requestId: "00000000-0000-4000-8000-0000000000b3",
    });
    const jobId = (result.toolSummaries[0]?.summary as { jobId?: string })
      .jobId;
    const inputs = await listImageJobInputs(database.db, jobId!);
    expect(inputs.filter((row) => row.role === "brand")).toHaveLength(0);
    const job = await getOwnedImageJob(database.db, userId, jobId!);
    expect(job?.prompt).toBe("A random sunset");
    expect(job?.prompt).not.toContain("Should not appear on skip.");
  });

  it("still proposes a confirmable job when the brief failed (AC-7)", async () => {
    await createBrandAsset(database.db, {
      userId,
      kind: "color",
      name: "Primary",
      colorValue: "#0b1f3a",
    });
    await createBrandAsset(database.db, {
      userId,
      kind: "logo",
      name: "Mark",
      mediaAssetId: await readyMedia(database.db, userId),
    });
    await scheduleBrandBriefCompile(database.db, userId);
    await markBrandBriefFailed(database.db, {
      userId,
      sourceHash: "failed-hash",
      errorCode: "COMPILE_FAILED",
    });
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_img", "propose_image_job", {
              kind: "generate",
              prompt: "A branded poster",
              brandIntent: "use",
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({ content: "Confirm Generate when you are ready." }),
      );

    const result = await service.createConversation(userId, {
      message: "Make a branded poster",
      requestId: "00000000-0000-4000-8000-0000000000b4",
    });
    const summary = result.toolSummaries[0]?.summary as {
      jobId?: string;
      needsConfirm?: boolean;
      status?: string;
    };
    expect(summary.needsConfirm).toBe(true);
    expect(summary.status).toBe("pending_confirm");
    const inputs = await listImageJobInputs(database.db, summary.jobId!);
    expect(inputs.some((row) => row.role === "brand")).toBe(true);
    const job = await getOwnedImageJob(database.db, userId, summary.jobId!);
    const fallback = fallbackBrandBriefText(
      await listBrandAssets(database.db, { userId }),
    );
    expect(job?.prompt).toContain(fallback.split("\n")[1] ?? "Primary");
  });

  it("uses the attached image as the edit source when the model omits sourceMediaAssetId", async () => {
    const assetId = await readyMedia(database.db, userId);
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_img", "propose_image_job", {
              kind: "prompt_edit",
              prompt: "Make the male character a female",
              brandIntent: "skip",
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({ content: "Hit Apply to generate it." }),
      );

    const result = await service.createConversation(userId, {
      message: "Make the male character a female",
      requestId: "00000000-0000-4000-8000-0000000000c1",
      mediaAssetIds: [assetId],
    });
    const jobId = (result.toolSummaries[0]?.summary as { jobId?: string })
      .jobId;
    const job = await getOwnedImageJob(database.db, userId, jobId!);
    expect(job?.kind).toBe("prompt_edit");
    expect(job?.sourceMediaAssetId).toBe(assetId);
    expect(job?.status).toBe("pending_confirm");
  });

  it("does not propose an edit job when no source image is attached", async () => {
    vi.mocked(model.complete)
      .mockResolvedValueOnce(
        modelCompletion({
          toolCalls: [
            toolCall("call_img", "propose_image_job", {
              kind: "prompt_edit",
              prompt: "Make them smile",
              brandIntent: "skip",
            }),
          ],
        }),
      )
      .mockResolvedValueOnce(
        modelCompletion({ content: "Attach the image first." }),
      );

    const result = await service.createConversation(userId, {
      message: "Make them smile",
      requestId: "00000000-0000-4000-8000-0000000000c2",
    });
    const summary = result.toolSummaries[0]?.summary as {
      ok?: boolean;
      code?: string;
      jobId?: string;
    };
    expect(summary.ok).toBe(false);
    expect(summary.code).toBe("SOURCE_REQUIRED");
    expect(summary.jobId).toBeUndefined();
  });
});
