"use client";

import { useEffect, useState } from "react";
import { Download, LoaderCircle, Ratio } from "lucide-react";

import { SelectChip } from "@/components/workspace/select-chip";
import { userFacingError } from "@/lib/user-facing-error";
import {
  ApiError,
  IMAGE_SIZE_PRESET_LABELS,
  cancelImageJob,
  confirmImageJob,
  createImageJob,
  downloadMediaAsset,
  getImageJob,
  type ImageJob,
  type ImageJobKind,
  type ImageSizePreset,
  type ProposeImageJobSummary,
} from "@/lib/product-api";

const PRESETS = Object.keys(IMAGE_SIZE_PRESET_LABELS) as ImageSizePreset[];
const VARIANT_COUNTS = [1, 2, 3] as const;
const JOB_KINDS: ImageJobKind[] = ["generate", "reframe", "vary", "prompt_edit"];

export type ImageRetryDraft = {
  kind: ImageJobKind;
  prompt: string | null;
  sizePreset: ImageSizePreset;
  sourceMediaAssetId: string | null;
  conversationId: string | null;
  variantCount: number;
};

function nonempty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isJobKind(value: string | null | undefined): value is ImageJobKind {
  return JOB_KINDS.includes(value as ImageJobKind);
}

function isPreset(value: string | null | undefined): value is ImageSizePreset {
  return PRESETS.includes(value as ImageSizePreset);
}

function needsEditSource(kind: string): boolean {
  return kind === "reframe" || kind === "vary" || kind === "prompt_edit";
}

/** Keep prompt and source once known so a failed retry can reuse the original ask. */
export function mergeRetryDraft(
  current: ImageRetryDraft | null,
  next: {
    kind?: string | null;
    prompt?: string | null;
    sizePreset?: string | null;
    sourceMediaAssetId?: string | null;
    conversationId?: string | null;
    variantCount?: number | null;
  },
  fallbackSourceMediaAssetId?: string | null,
): ImageRetryDraft {
  return {
    kind: isJobKind(next.kind) ? next.kind : current?.kind ?? "generate",
    prompt: nonempty(next.prompt) ?? current?.prompt ?? null,
    sizePreset: isPreset(next.sizePreset)
      ? next.sizePreset
      : current?.sizePreset ?? "portrait_4_5",
    sourceMediaAssetId:
      nonempty(next.sourceMediaAssetId) ??
      current?.sourceMediaAssetId ??
      nonempty(fallbackSourceMediaAssetId) ??
      null,
    conversationId:
      nonempty(next.conversationId) ?? current?.conversationId ?? null,
    variantCount:
      typeof next.variantCount === "number" && next.variantCount >= 1
        ? next.variantCount
        : current?.variantCount ?? 1,
  };
}

const SIZE_OPTIONS = PRESETS.map((preset) => ({
  value: preset,
  label: IMAGE_SIZE_PRESET_LABELS[preset],
  description: ratioForPreset(preset),
}));

function ratioForPreset(preset: string): string {
  if (preset === "square") return "1:1";
  if (preset === "story_9_16") return "9:16";
  if (preset === "linkedin_landscape") return "1.91:1";
  return "4:5";
}

function aspectForPreset(preset: string): string {
  if (preset === "square") return "1 / 1";
  if (preset === "story_9_16") return "9 / 16";
  if (preset === "linkedin_landscape") return "1.91 / 1";
  return "4 / 5";
}

function titleForKind(kind: string): string {
  if (kind === "prompt_edit") return "Adjust image";
  if (kind === "reframe") return "Reframe image";
  if (kind === "vary") return "Vary image";
  return "Generate image";
}

function confirmHint(kind: string): string {
  if (kind === "reframe") return "Pick a size, then Apply to crop this image.";
  if (kind === "vary") return "Pick a size, then Apply to create a variation.";
  if (kind === "prompt_edit") return "Pick a size, then Apply to generate this edit.";
  return "Pick a size, then Generate.";
}

function resultIds(job: ImageJob | null): string[] {
  if (!job) return [];
  if (job.resultMediaAssetIds && job.resultMediaAssetIds.length > 0) {
    return job.resultMediaAssetIds;
  }
  return job.resultMediaAssetId ? [job.resultMediaAssetId] : [];
}

function usablePreviewUrls(result: {
  resultPreviewUrls?: string[] | null;
  resultPreviewUrl?: string | null;
}): string[] {
  const listed = (result.resultPreviewUrls ?? []).filter(
    (url): url is string => typeof url === "string" && url.trim().length > 0,
  );
  if (listed.length) return listed;
  const single = result.resultPreviewUrl?.trim();
  return single ? [single] : [];
}

function recentlyCompleted(completedAt: string | null | undefined): boolean {
  if (!completedAt) return true;
  const at = Date.parse(completedAt);
  if (Number.isNaN(at)) return true;
  return Date.now() - at < 120_000;
}

export function ImageProposalStrip({
  summary,
  disabled = false,
  fallbackSourceMediaAssetId = null,
  onAttachResult,
}: {
  summary: ProposeImageJobSummary;
  disabled?: boolean;
  fallbackSourceMediaAssetId?: string | null;
  onAttachResult?: (input: {
    assetId: string;
    previewUrl: string;
  }) => void;
}) {
  const [jobId, setJobId] = useState(summary.jobId);
  const [sizePreset, setSizePreset] = useState<ImageSizePreset>(
    (summary.sizePreset as ImageSizePreset) || "portrait_4_5",
  );
  const [variantCount, setVariantCount] = useState(1);
  const [job, setJob] = useState<ImageJob | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryDraft, setRetryDraft] = useState<ImageRetryDraft | null>(() =>
    mergeRetryDraft(
      null,
      {
        kind: summary.kind,
        sizePreset: summary.sizePreset,
      },
      fallbackSourceMediaAssetId,
    ),
  );

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    void getImageJob(jobId)
      .then((result) => {
        if (cancelled) return;
        setJob(result.job);
        setPreviewUrls(usablePreviewUrls(result));
        if (
          result.job.sizePreset &&
          PRESETS.includes(result.job.sizePreset as ImageSizePreset)
        ) {
          setSizePreset(result.job.sizePreset as ImageSizePreset);
        }
        if (result.job.variantCount) {
          setVariantCount(result.job.variantCount);
        }
        setRetryDraft((current) =>
          mergeRetryDraft(current, result.job, fallbackSourceMediaAssetId),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [jobId, fallbackSourceMediaAssetId]);

  const hasStoredPreview = previewUrls.some((url) => url.trim());
  const jobStatus = job?.status;
  const jobCompletedAt = job?.completedAt;
  const jobResultKey = resultIds(job).join(",");

  useEffect(() => {
    if (!jobId || !jobStatus) return;
    const keepLooking =
      jobStatus === "queued" ||
      jobStatus === "running" ||
      (jobStatus === "succeeded" &&
        jobResultKey.length > 0 &&
        !hasStoredPreview &&
        recentlyCompleted(jobCompletedAt));
    if (!keepLooking) return;
    let cancelled = false;
    const tick = () => {
      void getImageJob(jobId)
        .then((result) => {
          if (cancelled) return;
          setJob(result.job);
          setPreviewUrls(usablePreviewUrls(result));
          setRetryDraft((current) =>
            mergeRetryDraft(current, result.job, fallbackSourceMediaAssetId),
          );
        })
        .catch(() => undefined);
    };
    tick();
    const timer = window.setInterval(tick, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    jobId,
    jobStatus,
    jobCompletedAt,
    jobResultKey,
    hasStoredPreview,
    fallbackSourceMediaAssetId,
  ]);

  if (!jobId || !summary.needsConfirm) return null;

  const status = job?.status ?? summary.status ?? "pending_confirm";
  const charged = job?.creditsCharged ?? summary.creditsCharged ?? 0;
  const storedCount = job?.variantCount || 1;
  const unitCredits = storedCount > 0 ? Math.round(charged / storedCount) : charged;
  const credits = unitCredits * variantCount;
  const storedCents = job?.estimatedCostCents ?? summary.estimatedCostCents ?? 0;
  const unitCents = storedCount > 0 ? Math.round(storedCents / storedCount) : storedCents;
  const costCents = unitCents * variantCount;
  const kind = retryDraft?.kind ?? job?.kind ?? summary.kind ?? "generate";
  const actionLabel = kind === "generate" ? "Generate" : "Apply";
  const ids = resultIds(job);
  const results = ids.map((assetId, index) => ({
    assetId,
    previewUrl: previewUrls[index] || null,
  }));
  const hasPreview = results.some((item) => item.previewUrl);
  const awaitingPreview =
    status === "succeeded" &&
    ids.length > 0 &&
    !hasPreview &&
    recentlyCompleted(job?.completedAt);
  const generating =
    status === "queued" || status === "running" || retrying || awaitingPreview;

  async function onConfirm() {
    if (!jobId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await confirmImageJob(jobId, {
        requestId: `confirm_${jobId}`,
        sizePreset,
        variantCount: kind === "generate" ? variantCount : 1,
      });
      setJob(result.job);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "CONFIRM_FAILED";
      if (code === "BUDGET_EXCEEDED" || code === "DISABLED") {
        setError(
          code === "BUDGET_EXCEEDED"
            ? "Out of credits. Add credit or upgrade to the next higher plan."
            : "Image generation is turned off.",
        );
      } else {
        setError(code);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!jobId || busy) return;
    setBusy(true);
    try {
      const result = await cancelImageJob(jobId);
      setJob(result.job);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : "CANCEL_FAILED");
    } finally {
      setBusy(false);
    }
  }

  async function retryWithDraft(autoConfirm: boolean) {
    const draft = mergeRetryDraft(
      retryDraft,
      {
        kind,
        sizePreset,
        variantCount,
      },
      fallbackSourceMediaAssetId,
    );
    setRetryDraft(draft);
    if (needsEditSource(draft.kind) && !draft.sourceMediaAssetId) {
      setError("SOURCE_REQUIRED");
      return;
    }
    setBusy(true);
    setError(null);
    if (autoConfirm) setRetrying(true);
    try {
      const result = await createImageJob({
        kind: draft.kind,
        prompt: draft.prompt ?? undefined,
        sizePreset: draft.sizePreset,
        sourceMediaAssetId: draft.sourceMediaAssetId ?? undefined,
        conversationId: draft.conversationId ?? undefined,
        variantCount: draft.kind === "generate" ? draft.variantCount : 1,
      });
      setRetryDraft((current) =>
        mergeRetryDraft(current, result.job, fallbackSourceMediaAssetId),
      );
      setJobId(result.job.id);
      setJob(result.job);
      setPreviewUrls([]);
      if (result.job.variantCount) setVariantCount(result.job.variantCount);
      if (autoConfirm) {
        const confirmed = await confirmImageJob(result.job.id, {
          requestId: `confirm_${result.job.id}`,
          sizePreset: draft.sizePreset,
          variantCount: draft.kind === "generate" ? draft.variantCount : 1,
        });
        setJob(confirmed.job);
      }
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "REQUEST_FAILED";
      setError(code);
    } finally {
      setBusy(false);
      setRetrying(false);
    }
  }

  async function onGenerateAgain() {
    if (busy) return;
    await retryWithDraft(false);
  }

  async function onTryAgain() {
    if (busy || disabled) return;
    await retryWithDraft(true);
  }

  async function onDownload(assetId: string) {
    if (!assetId || downloadingId) return;
    setDownloadingId(assetId);
    setError(null);
    try {
      await downloadMediaAsset(assetId);
    } catch {
      setError("Could not download the image.");
    } finally {
      setDownloadingId(null);
    }
  }

  const stagePreset = job?.sizePreset || sizePreset;

  return (
    <section className="image-proposal-strip" aria-label={titleForKind(kind)}>
      <div className="image-proposal-head">
        <p className="image-proposal-title">{titleForKind(kind)}</p>
        <p className="image-proposal-meta">
          {generating && !awaitingPreview
            ? "Creating…"
            : awaitingPreview
              ? "Loading preview…"
              : hasPreview
                ? "Ready"
                : status === "succeeded"
                  ? "Preview unavailable"
                  : status === "failed"
                    ? "Failed"
                    : `${credits} credit${credits === 1 ? "" : "s"}${costCents ? ` · ~${costCents}¢` : ""}`}
        </p>
      </div>

      {status === "pending_confirm" && !retrying ? (
        <>
          <p className="image-proposal-hint">{confirmHint(kind)}</p>
          <div className="image-proposal-toolbar">
          <SelectChip
            className="os-select-chip-compact"
            label="Size"
            icon={<Ratio className="size-3.5" />}
            value={sizePreset}
            onChange={(value) => {
              const next = value as ImageSizePreset;
              setSizePreset(next);
              setRetryDraft((current) =>
                mergeRetryDraft(current, { sizePreset: next }, fallbackSourceMediaAssetId),
              );
            }}
            disabled={disabled || busy}
            options={SIZE_OPTIONS}
          />
          {kind === "generate" ? (
            <div
              className="image-proposal-count-seg"
              role="radiogroup"
              aria-label="How many images"
            >
              {VARIANT_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  role="radio"
                  aria-checked={variantCount === count}
                  className={
                    variantCount === count
                      ? "image-proposal-count-option is-selected"
                      : "image-proposal-count-option"
                  }
                  aria-label={`${count} image${count === 1 ? "" : "s"}`}
                  disabled={disabled || busy}
                  onClick={() => setVariantCount(count)}
                >
                  {count}
                </button>
              ))}
            </div>
          ) : null}
          <div className="image-proposal-actions">
            <button
              type="button"
              className="os-generate-btn"
              disabled={disabled || busy}
              onClick={() => void onConfirm()}
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {actionLabel}
            </button>
            <button
              type="button"
              className="image-proposal-cancel"
              disabled={disabled || busy}
              onClick={() => void onCancel()}
            >
              Cancel
            </button>
          </div>
        </div>
        </>
      ) : null}

      {generating ? (
        <div
          className="image-proposal-gallery"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          {Array.from({ length: variantCount }, (_, index) => (
            <div key={index} className="image-proposal-card">
              <div
                className="image-proposal-stage"
                style={{ aspectRatio: aspectForPreset(sizePreset) }}
              >
                <div className="image-proposal-shimmer" />
              </div>
              <p>
                {awaitingPreview
                  ? "Loading your image…"
                  : variantCount > 1
                    ? `Creating ${index + 1} of ${variantCount}…`
                    : "Creating your image…"}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {status === "succeeded" && results.length && !awaitingPreview ? (
        <div className="image-proposal-gallery">
          {results.map((item, index) => (
            <div key={item.assetId} className="image-proposal-card">
              {item.previewUrl ? (
                <div className="image-proposal-stage image-proposal-stage-done">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.previewUrl}
                    alt={
                      results.length > 1
                        ? `Generated image ${index + 1}`
                        : "Generated image result"
                    }
                  />
                </div>
              ) : (
                <div
                  className="image-proposal-stage"
                  style={{ aspectRatio: aspectForPreset(stagePreset) }}
                >
                  <p className="image-proposal-stage-empty">
                    The image was generated, but the file is no longer available.
                  </p>
                </div>
              )}
              {!item.previewUrl ? (
                <div className="image-proposal-actions">
                  <button
                    type="button"
                    className="os-generate-btn"
                    disabled={disabled || busy}
                    onClick={() => void onGenerateAgain()}
                  >
                    {busy ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    Generate again
                  </button>
                </div>
              ) : null}
              {item.previewUrl ? (
              <div className="image-proposal-actions">
                <button
                  type="button"
                  className="image-proposal-secondary"
                  disabled={downloadingId === item.assetId}
                  onClick={() => void onDownload(item.assetId)}
                >
                  {downloadingId === item.assetId ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="size-4" aria-hidden="true" />
                  )}
                  Download
                </button>
                {onAttachResult ? (
                  <button
                    type="button"
                    className="image-proposal-secondary"
                    onClick={() =>
                      onAttachResult({
                        assetId: item.assetId,
                        previewUrl: item.previewUrl!,
                      })
                    }
                  >
                    Attach
                  </button>
                ) : null}
              </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {status === "failed" && !retrying ? (
        <div className="image-proposal-failed">
          <p className="image-proposal-error" role="alert">
            {userFacingError(job?.errorCode, {
              fallback: job?.errorMessage || "That image job failed. Try again.",
            })}
          </p>
          <div className="image-proposal-actions">
            <button
              type="button"
              className="os-generate-btn"
              disabled={disabled || busy}
              onClick={() => void onTryAgain()}
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Try again
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="image-proposal-error" role="alert">
          {userFacingError(error)}
        </p>
      ) : null}
    </section>
  );
}
