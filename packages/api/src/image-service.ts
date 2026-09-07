import {
  archiveBrandAsset,
  cancelImageJob,
  confirmImageJob,
  createBrandAsset,
  createPendingImageJob,
  currentPeriodYm,
  getBrandDesignBrief,
  getOrCreateWallet,
  getOwnedBrandAsset,
  getOwnedImageJob,
  ImageDatabaseError,
  IMAGE_SIZE_PRESETS,
  isBrandAssetKind,
  isImageJobKind,
  isImageSizePreset,
  listBrandAssets,
  listImageJobInputs,
  listRecentImageJobs,
  listSucceededGenerations,
  markImageJobFailed,
  markImageJobSucceeded,
  patchBrandAsset,
  pickBrandJobExemplars,
  claimNextQueuedJob,
  reclaimStaleRunningJobs,
  scheduleBrandBriefCompile,
  refreshVoiceBibleHash,
  type BrandAssetKind,
  type ImageJob,
  type ImageJobInputSpec,
  type ImageJobKind,
  type ImageSizePreset,
  type Database,
} from "@sochestral/database";
import {
  creditCostForKind,
  loadImageRuntimeConfig,
  parseVariantCount,
  type ImageRuntimeConfig,
} from "./image-config.js";
import {
  ImageProviderError,
  OpenAIImageProvider,
  reframeLocal,
  type ImageProvider,
} from "./image-provider.js";
import { MediaError, type MediaService } from "./media-storage.js";
import {
  brandBriefVisionModel,
  compileDueBrandBrief,
  createBrandBriefVision,
} from "./brand-brief.js";

export class ImageServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ImageServiceError";
  }
}

function mapDb(error: unknown): never {
  if (error instanceof ImageDatabaseError) {
    const status =
      error.code === "NOT_FOUND"
        ? 404
        : error.code === "BUDGET_EXCEEDED" || error.code === "IN_FLIGHT"
          ? 429
          : error.code === "DISABLED"
            ? 403
            : error.code === "CONFLICT"
              ? 409
              : 422;
    throw new ImageServiceError(error.code, status, error.message);
  }
  throw error;
}

export class ImageService {
  private readonly config: ImageRuntimeConfig;

  constructor(
    private readonly db: Database["db"],
    private readonly media: MediaService,
    private readonly providerFactory: (apiKey: string) => ImageProvider = (
      apiKey,
    ) => new OpenAIImageProvider(apiKey),
    config: ImageRuntimeConfig = loadImageRuntimeConfig(),
  ) {
    this.config = config;
  }

  getConfig() {
    return this.config;
  }

  async listBrand(userId: string, kind?: string) {
    const parsed =
      kind === undefined || kind === ""
        ? undefined
        : isBrandAssetKind(kind)
          ? kind
          : null;
    if (kind && parsed === null) {
      throw new ImageServiceError("INVALID", 422, "invalid kind");
    }
    const items = await listBrandAssets(this.db, {
      userId,
      kind: parsed as BrandAssetKind | undefined,
    });
    return Promise.all(
      items.map(async (item) => {
        let previewUrl: string | null = null;
        if (item.mediaAssetId) {
          try {
            previewUrl = await this.media.previewUrl(userId, item.mediaAssetId);
          } catch {
            previewUrl = null;
          }
        }
        return { ...item, previewUrl };
      }),
    );
  }

  async createBrand(
    userId: string,
    body: {
      kind?: string;
      name?: string;
      mediaAssetId?: string;
      colorValue?: string;
      noteText?: string;
      sortOrder?: number;
    },
  ) {
    if (!body.kind || !isBrandAssetKind(body.kind)) {
      throw new ImageServiceError("INVALID", 422, "invalid kind");
    }
    try {
      const item = await createBrandAsset(this.db, {
        userId,
        kind: body.kind,
        name: body.name ?? "",
        mediaAssetId: body.mediaAssetId,
        colorValue: body.colorValue,
        noteText: body.noteText,
        sortOrder: body.sortOrder,
      });
      await scheduleBrandBriefCompile(this.db, userId);
      await refreshVoiceBibleHash(this.db, userId).catch(() => undefined);
      return item;
    } catch (error) {
      mapDb(error);
    }
  }

  async patchBrand(
    userId: string,
    id: string,
    body: {
      name?: string;
      sortOrder?: number;
      colorValue?: string | null;
      noteText?: string | null;
    },
  ) {
    try {
      const item = await patchBrandAsset(this.db, { userId, id, ...body });
      await scheduleBrandBriefCompile(this.db, userId);
      await refreshVoiceBibleHash(this.db, userId).catch(() => undefined);
      return item;
    } catch (error) {
      mapDb(error);
    }
  }

  async archiveBrand(userId: string, id: string) {
    try {
      const item = await archiveBrandAsset(this.db, userId, id);
      await scheduleBrandBriefCompile(this.db, userId);
      await refreshVoiceBibleHash(this.db, userId).catch(() => undefined);
      return item;
    } catch (error) {
      mapDb(error);
    }
  }

  async getDesignBrief(userId: string) {
    const brief = await getBrandDesignBrief(this.db, userId);
    return {
      status: brief?.status ?? "missing",
      updating: brief?.status === "pending",
      compiledAt: brief?.compiledAt?.toISOString() ?? null,
      errorCode: brief?.errorCode ?? null,
    };
  }

  async processOnePendingBrief() {
    return compileDueBrandBrief(this.db, this.media, {
      debounceMs: this.config.briefDebounceMs,
      compileCap: this.config.briefCompileCap,
      vision: createBrandBriefVision(),
      visionModel: brandBriefVisionModel(),
      visionEnabled: process.env.THESEAN_VISION_ENABLED !== "false",
    });
  }

  async recentGenerations(userId: string) {
    const items = await listSucceededGenerations(this.db, userId, 12);
    return Promise.all(
      items.map(async (job) => {
        let resultPreviewUrl: string | null = null;
        if (job.resultMediaAssetId) {
          try {
            resultPreviewUrl = await this.media.previewUrl(
              userId,
              job.resultMediaAssetId,
            );
          } catch {
            resultPreviewUrl = null;
          }
        }
        return { ...job, resultPreviewUrl };
      }),
    );
  }

  estimate(kind: ImageJobKind) {
    const credits = creditCostForKind(this.config, kind);
    return {
      credits,
      estimatedCostCents: credits * this.config.creditCentValue,
    };
  }

  async createJob(
    userId: string,
    body: {
      kind?: string;
      prompt?: string;
      sizePreset?: string;
      sourceMediaAssetId?: string;
      conversationId?: string;
      requestId?: string;
      variantCount?: number;
      inputs?: Array<{
        mediaAssetId?: string;
        brandAssetId?: string;
        role?: string;
      }>;
    },
  ) {
    if (!this.config.enabled) {
      throw new ImageServiceError("DISABLED", 403, "image generation disabled");
    }
    if (!body.kind || !isImageJobKind(body.kind)) {
      throw new ImageServiceError("INVALID", 422, "invalid kind");
    }
    const sizePreset: ImageSizePreset =
      body.sizePreset && isImageSizePreset(body.sizePreset)
        ? body.sizePreset
        : "portrait_4_5";
    const inputsRaw = Array.isArray(body.inputs) ? body.inputs : [];
    if (inputsRaw.length > this.config.referenceCap) {
      throw new ImageServiceError("INVALID", 422, "too many references");
    }
    const inputs: ImageJobInputSpec[] = inputsRaw.map((entry) => {
      if (entry.role !== "reference" && entry.role !== "brand") {
        throw new ImageServiceError("INVALID", 422, "invalid input role");
      }
      return {
        mediaAssetId: entry.mediaAssetId,
        brandAssetId: entry.brandAssetId,
        role: entry.role,
      };
    });
    const { credits: unitCredits, estimatedCostCents: unitCents } = this.estimate(
      body.kind,
    );
    let variantCount = 1;
    try {
      variantCount = parseVariantCount(body.kind, body.variantCount);
    } catch {
      throw new ImageServiceError("INVALID", 422, "variant count must be 1 to 3");
    }
    const credits = unitCredits * variantCount;
    const estimatedCostCents = unitCents * variantCount;
    try {
      const created = await createPendingImageJob(this.db, {
        userId,
        kind: body.kind,
        prompt: body.prompt,
        sizePreset,
        sourceMediaAssetId: body.sourceMediaAssetId,
        conversationId: body.conversationId,
        requestId: body.requestId,
        provider: "openai",
        model: this.config.model,
        estimatedCostCents,
        creditsCharged: credits,
        variantCount,
        inputs,
      });
      const wallet = await getOrCreateWallet(
        this.db,
        userId,
        currentPeriodYm(),
      );
      return {
        ...created,
        remainingCredits: Math.max(
          0,
          this.config.monthlyBudget - wallet.creditsUsed,
        ),
        monthlyBudget: this.config.monthlyBudget,
      };
    } catch (error) {
      mapDb(error);
    }
  }

  async getJob(userId: string, jobId: string) {
    const job = await getOwnedImageJob(this.db, userId, jobId);
    if (!job) throw new ImageServiceError("NOT_FOUND", 404);
    const inputs = await listImageJobInputs(this.db, job.id);
    const resultIds =
      job.resultMediaAssetIds && job.resultMediaAssetIds.length > 0
        ? job.resultMediaAssetIds
        : job.resultMediaAssetId
          ? [job.resultMediaAssetId]
          : [];
    const resultPreviewUrls: string[] = [];
    for (const assetId of resultIds) {
      resultPreviewUrls.push(
        (await this.media.previewUrlOrRevive(userId, assetId)) ?? "",
      );
    }
    return {
      job,
      inputs,
      resultPreviewUrl: resultPreviewUrls[0] || null,
      resultPreviewUrls,
    };
  }

  async listJobs(userId: string, limit: number, cursor?: string) {
    return listRecentImageJobs(this.db, { userId, limit, cursor });
  }

  async confirm(
    userId: string,
    jobId: string,
    body: {
      requestId?: string;
      sizePreset?: string;
      brandAssetIds?: string[];
      variantCount?: number;
    },
  ) {
    if (!this.config.enabled) {
      throw new ImageServiceError("DISABLED", 403, "image generation disabled");
    }
    const sizePreset =
      body.sizePreset && isImageSizePreset(body.sizePreset)
        ? body.sizePreset
        : undefined;
    try {
      const existing = await getOwnedImageJob(this.db, userId, jobId);
      if (!existing) {
        throw new ImageDatabaseError("NOT_FOUND", "job not found");
      }
      let variantCount = existing.variantCount;
      try {
        variantCount = parseVariantCount(existing.kind as ImageJobKind, body.variantCount ?? existing.variantCount);
      } catch {
        throw new ImageServiceError("INVALID", 422, "variant count must be 1 to 3");
      }
      const unitCredits = creditCostForKind(
        this.config,
        existing.kind as ImageJobKind,
      );
      const creditsCharged = unitCredits * variantCount;
      const estimatedCostCents = creditsCharged * this.config.creditCentValue;
      const existingInputs = await listImageJobInputs(this.db, jobId);
      const branded = existingInputs.some((row) => row.role === "brand");
      const brandAssetIds = branded
        ? pickBrandJobExemplars(
            await listBrandAssets(this.db, { userId }),
          ).map((item) => item.id)
        : undefined;
      const job = await confirmImageJob(this.db, {
        userId,
        jobId,
        requestId: body.requestId,
        sizePreset,
        brandAssetIds,
        variantCount,
        creditsCharged,
        estimatedCostCents,
        referenceCap: this.config.referenceCap,
        budget: this.config.monthlyBudget,
      });
      return job;
    } catch (error) {
      mapDb(error);
    }
  }

  async cancel(userId: string, jobId: string) {
    try {
      return await cancelImageJob(this.db, userId, jobId);
    } catch (error) {
      mapDb(error);
    }
  }

  async processOneQueuedJob(): Promise<ImageJob | null> {
    await reclaimStaleRunningJobs(this.db, this.config.reclaimMs);
    const job = await claimNextQueuedJob(this.db);
    if (!job) return null;
    try {
      await this.runJob(job);
    } catch (error) {
      const code =
        error instanceof ImageProviderError
          ? error.code
          : error instanceof ImageServiceError
            ? error.code
            : error instanceof MediaError
              ? error.code
              : "INTERNAL_ERROR";
      const message =
        error instanceof Error ? error.message.slice(0, 200) : "job failed";
      await markImageJobFailed(this.db, {
        jobId: job.id,
        userId: job.userId,
        errorCode: code,
        errorMessage: message,
        refund: true,
      });
    }
    return job;
  }

  private async runJob(job: ImageJob): Promise<void> {
    if (job.kind === "reframe") {
      if (!job.sourceMediaAssetId) {
        throw new ImageServiceError("SOURCE_REQUIRED", 422, "source required");
      }
      const source = await this.media.getOwnedBytes(
        job.userId,
        job.sourceMediaAssetId,
      );
      try {
        const bytes = await reframeLocal(source, job.width, job.height);
        const asset = await this.media.ingestGeneratedBytes(
          job.userId,
          bytes,
          "reframe.png",
          job.conversationId,
        );
        await markImageJobSucceeded(this.db, {
          jobId: job.id,
          userId: job.userId,
          resultMediaAssetId: asset.id,
        });
        return;
      } catch (error) {
        if (
          error instanceof ImageProviderError &&
          error.code === "REFRAME_SOURCE_TOO_SMALL"
        ) {
          await markImageJobFailed(this.db, {
            jobId: job.id,
            userId: job.userId,
            errorCode: "REFRAME_SOURCE_TOO_SMALL",
            errorMessage: error.message,
            refund: true,
          });
          return;
        }
        throw error;
      }
    }

    if (!this.config.apiKey) {
      throw new ImageServiceError("DISABLED", 503, "OPENAI_API_KEY missing");
    }
    const provider = this.providerFactory(this.config.apiKey);
    let sourceBytes: Uint8Array | undefined;
    if (job.sourceMediaAssetId) {
      sourceBytes = await this.media.getOwnedBytes(
        job.userId,
        job.sourceMediaAssetId,
      );
    }
    const inputs = await listImageJobInputs(this.db, job.id);
    const referenceBytes: Uint8Array[] = [];
    for (const input of inputs) {
      if (input.mediaAssetId) {
        referenceBytes.push(
          await this.media.getOwnedBytes(job.userId, input.mediaAssetId),
        );
      } else if (input.brandAssetId) {
        const brand = await getOwnedBrandAsset(
          this.db,
          job.userId,
          input.brandAssetId,
        );
        if (brand?.mediaAssetId) {
          referenceBytes.push(
            await this.media.getOwnedBytes(job.userId, brand.mediaAssetId),
          );
        }
      }
    }

    const kind = job.kind as Exclude<ImageJobKind, "reframe">;
    if (kind !== "generate" && !sourceBytes) {
      throw new ImageServiceError("SOURCE_REQUIRED", 422, "source image required");
    }
    const count = kind === "generate" ? Math.min(3, Math.max(1, job.variantCount || 1)) : 1;
    const resultIds: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const bytes = await provider.generate({
        kind,
        prompt: job.prompt ?? "",
        model: job.model,
        width: job.width,
        height: job.height,
        sourceBytes,
        referenceBytes,
      });
      const asset = await this.media.ingestGeneratedBytes(
        job.userId,
        bytes,
        count === 1 ? "generated.png" : `generated-${index + 1}.png`,
        job.conversationId,
      );
      resultIds.push(asset.id);
    }
    await markImageJobSucceeded(this.db, {
      jobId: job.id,
      userId: job.userId,
      resultMediaAssetId: resultIds[0]!,
      resultMediaAssetIds: resultIds,
    });
  }
}

export { IMAGE_SIZE_PRESETS };
