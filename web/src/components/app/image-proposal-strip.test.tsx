import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmImageJob,
  createImageJob,
  getImageJob,
  type ImageJob,
} from "@/lib/product-api";
import {
  ImageProposalStrip,
  mergeRetryDraft,
} from "./image-proposal-strip";

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return {
    ...actual,
    getImageJob: vi.fn(),
    createImageJob: vi.fn(),
    confirmImageJob: vi.fn(),
    cancelImageJob: vi.fn(),
    downloadMediaAsset: vi.fn(),
  };
});

function failedJob(overrides: Partial<ImageJob> = {}): ImageJob {
  return {
    id: "job_fail",
    kind: "prompt_edit",
    status: "failed",
    prompt: "Make the male character a female",
    sizePreset: "portrait_4_5",
    width: 1080,
    height: 1350,
    sourceMediaAssetId: null,
    resultMediaAssetId: null,
    estimatedCostCents: 2,
    creditsCharged: 2,
    errorCode: "INVALID",
    errorMessage: "source image required",
    conversationId: "conv_1",
    createdAt: "2026-08-13T00:00:00.000Z",
    startedAt: "2026-08-13T00:00:01.000Z",
    completedAt: "2026-08-13T00:00:02.000Z",
    ...overrides,
  };
}

describe("mergeRetryDraft", () => {
  it("keeps the original prompt and source when a later job omits them", () => {
    const kept = mergeRetryDraft(
      {
        kind: "prompt_edit",
        prompt: "Make the male character a female",
        sizePreset: "portrait_4_5",
        sourceMediaAssetId: "media_source",
        conversationId: "conv_1",
        variantCount: 1,
      },
      {
        kind: "prompt_edit",
        prompt: null,
        sourceMediaAssetId: null,
      },
    );
    expect(kept.prompt).toBe("Make the male character a female");
    expect(kept.sourceMediaAssetId).toBe("media_source");
  });

  it("fills a missing source from the attached message image", () => {
    const kept = mergeRetryDraft(
      null,
      { kind: "prompt_edit", prompt: "Make them smile" },
      "media_attached",
    );
    expect(kept.sourceMediaAssetId).toBe("media_attached");
    expect(kept.prompt).toBe("Make them smile");
  });
});

describe("ImageProposalStrip failed retry", () => {
  beforeEach(() => {
    vi.mocked(getImageJob).mockReset();
    vi.mocked(createImageJob).mockReset();
    vi.mocked(confirmImageJob).mockReset();
    vi.mocked(getImageJob).mockResolvedValue({
      job: failedJob(),
      inputs: [],
      resultPreviewUrl: null,
    });
    vi.mocked(createImageJob).mockResolvedValue({
      job: failedJob({
        id: "job_retry",
        status: "pending_confirm",
        sourceMediaAssetId: "media_attached",
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
      }),
      remainingCredits: 18,
      monthlyBudget: 100,
    });
    vi.mocked(confirmImageJob).mockResolvedValue({
      job: failedJob({
        id: "job_retry",
        status: "queued",
        sourceMediaAssetId: "media_attached",
        errorCode: null,
        errorMessage: null,
        completedAt: null,
      }),
    });
  });

  it("shows Try again and retries with the stored prompt plus attached source", async () => {
    const user = userEvent.setup();
    render(
      <ImageProposalStrip
        summary={{
          ok: true,
          jobId: "job_fail",
          status: "failed",
          kind: "prompt_edit",
          sizePreset: "portrait_4_5",
          creditsCharged: 2,
          estimatedCostCents: 2,
          needsConfirm: true,
        }}
        fallbackSourceMediaAssetId="media_attached"
      />,
    );

    expect(
      await screen.findByText(/That image request was not valid/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(createImageJob).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "prompt_edit",
          prompt: "Make the male character a female",
          sourceMediaAssetId: "media_attached",
          conversationId: "conv_1",
          sizePreset: "portrait_4_5",
        }),
      ),
    );
    expect(confirmImageJob).toHaveBeenCalledWith(
      "job_retry",
      expect.objectContaining({ sizePreset: "portrait_4_5" }),
    );
  });
});

describe("ImageProposalStrip succeeded preview", () => {
  function succeededJob(overrides: Partial<ImageJob> = {}): ImageJob {
    return {
      id: "job_gen",
      kind: "generate",
      status: "succeeded",
      prompt: "Launch flyer",
      sizePreset: "portrait_4_5",
      width: 1080,
      height: 1350,
      sourceMediaAssetId: null,
      resultMediaAssetId: "media_result",
      resultMediaAssetIds: ["media_result"],
      estimatedCostCents: 2,
      creditsCharged: 2,
      errorCode: null,
      errorMessage: null,
      conversationId: "conv_1",
      createdAt: "2026-08-12T20:04:21.000Z",
      startedAt: "2026-08-12T20:04:22.000Z",
      completedAt: "2026-08-12T20:06:32.000Z",
      ...overrides,
    };
  }

  const summary = {
    ok: true,
    jobId: "job_gen",
    status: "pending_confirm",
    kind: "generate",
    sizePreset: "portrait_4_5",
    creditsCharged: 2,
    estimatedCostCents: 2,
    needsConfirm: true,
  };

  beforeEach(() => {
    vi.mocked(getImageJob).mockReset();
    vi.mocked(createImageJob).mockReset();
    vi.mocked(confirmImageJob).mockReset();
  });

  it("does not treat a finished generate as failed when the preview file is gone", async () => {
    vi.mocked(getImageJob).mockResolvedValue({
      job: succeededJob(),
      inputs: [],
      resultPreviewUrl: null,
      resultPreviewUrls: [""],
    });
    render(<ImageProposalStrip summary={summary} />);

    expect(await screen.findByText("Preview unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(/The image was generated, but the file is no longer available/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate again" })).toBeInTheDocument();
    expect(screen.queryByText("Failed")).toBeNull();
  });

  it("loads the preview after a successful generate instead of showing removed", async () => {
    const recent = succeededJob({
      completedAt: new Date().toISOString(),
    });
    vi.mocked(getImageJob)
      .mockResolvedValueOnce({
        job: recent,
        inputs: [],
        resultPreviewUrl: null,
        resultPreviewUrls: [""],
      })
      .mockResolvedValue({
        job: recent,
        inputs: [],
        resultPreviewUrl: "https://media.invalid/result.png",
        resultPreviewUrls: ["https://media.invalid/result.png"],
      });
    render(<ImageProposalStrip summary={summary} />);

    expect(
      await screen.findByRole("img", { name: "Generated image result" }),
    ).toHaveAttribute("src", "https://media.invalid/result.png");
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });
});
