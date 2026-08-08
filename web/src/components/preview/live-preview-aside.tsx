"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleAlert,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  ApiError,
  apiRequest,
  type ConnectorPlatform,
  type ConnectorSummary,
  type ReviewDraft,
  type ReviewGroup as ReviewGroupValue,
} from "@/lib/product-api";
import { SelectChip } from "@/components/workspace/select-chip";
import { productMotion } from "@/components/app/product-motion-provider";
import {
  InstagramIcon,
  LinkedInIcon,
  ThreadsIcon,
} from "@/components/auth/platform-icons";
import { InstagramPreview } from "./instagram-preview";
import { LinkedInPreview } from "./linkedin-preview";
import {
  accountLabel,
  isImageFile,
  platformNames,
  type EditableDraft,
  type ReviewMediaItem,
} from "./preview-shared";
import { ThreadsPreview } from "./threads-preview";

function sameDraft(a: EditableDraft, b: ReviewDraft) {
  return (
    a.body === b.body &&
    a.selectedAccountId === b.selectedAccountId &&
    JSON.stringify(a.mediaItems) ===
      JSON.stringify(
        b.mediaItems ??
          b.mediaUrls.map((externalUrl) => ({ assetId: null, externalUrl })),
      )
  );
}

function reviewHeaders() {
  return { "X-Sochestral-Request": "review-action" };
}

const previewPlatforms: ConnectorPlatform[] = [
  "threads",
  "linkedin_personal",
  "instagram",
];

function PlatformGlyph({ platform }: { platform: ConnectorPlatform }) {
  const Icon =
    platform === "linkedin_personal"
      ? LinkedInIcon
      : platform === "instagram"
        ? InstagramIcon
        : ThreadsIcon;
  return (
    <span
      className={`preview-platform-glyph preview-platform-glyph-${platform}`}
      aria-hidden="true"
    >
      <Icon className="size-3.5" />
    </span>
  );
}

export function LivePreviewAside({
  group,
  onRefresh,
  onClose,
  mediaPreviews = {},
}: {
  group: ReviewGroupValue;
  onRefresh: () => Promise<void>;
  onClose?: () => void;
  mediaPreviews?: Record<string, string>;
}) {
  const reduceMotion = useReducedMotion();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [connectors, setConnectors] = useState<ConnectorSummary[] | null>(null);
  const [connectorError, setConnectorError] = useState(false);
  const [edits, setEdits] = useState<Record<string, EditableDraft>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [groupBusy, setGroupBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const requestId = useRef<string | null>(null);
  const [activePlatform, setActivePlatform] = useState<ConnectorPlatform>(
    group.drafts[0]?.platform ?? "threads",
  );

  const allPublished = group.drafts.every((draft) => draft.status === "published");
  const hasUnknown = group.drafts.some((draft) => draft.status === "unknown");
  const hasFailure = group.drafts.some((draft) => draft.status === "failed");
  const mergedPreviews = { ...mediaPreviews, ...localPreviews };

  useEffect(() => {
    setEdits(
      Object.fromEntries(
        group.drafts.map((draft) => [
          draft.id,
          {
            body: draft.body,
            mediaItems:
              draft.mediaItems ??
              draft.mediaUrls.map((externalUrl) => ({
                assetId: null,
                externalUrl,
              })),
            selectedAccountId: draft.selectedAccountId,
          },
        ]),
      ),
    );
  }, [group]);

  useEffect(() => {
    if (!onClose) return;
    const close = onClose;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    apiRequest<{ connectors: ConnectorSummary[] }>("/connectors")
      .then((result) => {
        if (!active) return;
        setConnectors(result.connectors);
        setConnectorError(false);
        setEdits((current) => {
          const next = { ...current };
          for (const draft of group.drafts) {
            const accounts =
              result.connectors
                .find((connector) => connector.platform === draft.platform)
                ?.accounts.filter((account) => account.state === "connected") ??
              [];
            if (
              accounts.length === 1 &&
              next[draft.id] &&
              !next[draft.id]!.selectedAccountId
            ) {
              next[draft.id] = {
                ...next[draft.id]!,
                selectedAccountId: accounts[0]!.id,
              };
            }
          }
          return next;
        });
      })
      .catch(() => active && setConnectorError(true));
    return () => {
      active = false;
    };
  }, [group.drafts]);

  const dirty = useMemo(
    () =>
      group.drafts.some((draft) => {
        const edit = edits[draft.id];
        return edit ? !sameDraft(edit, draft) : false;
      }),
    [edits, group.drafts],
  );

  const draftInSet = group.drafts.find((item) => item.platform === activePlatform) ?? null;
  const sourceDraft = draftInSet ?? group.drafts[0]!;
  const previewOnly = !draftInSet;
  const draft = sourceDraft;
  const edit = edits[draft.id] ?? {
    body: draft.body,
    selectedAccountId: draft.selectedAccountId,
    mediaItems:
      draft.mediaItems ??
      draft.mediaUrls.map((externalUrl) => ({
        assetId: null,
        externalUrl,
      })),
  };
  const accounts =
    connectors
      ?.find((connector) => connector.platform === activePlatform)
      ?.accounts.filter((account) => account.state === "connected") ?? [];
  // Always resolve chrome from the signed in user's connected accounts for this platform.
  const selectedAccount =
    accounts.find((account) => account.id === edit.selectedAccountId) ??
    accounts[0] ??
    null;
  const locked =
    previewOnly ||
    draft.status === "published" ||
    draft.status === "unknown";
  const live = !previewOnly && draft.status === "published";
  const isDirty = !previewOnly && !sameDraft(edit, draft);
  const connectorMissing = connectors !== null && accounts.length === 0;

  const blocking = group.drafts.some((item) => {
    const itemEdit = edits[item.id];
    const itemAccounts =
      connectors
        ?.find((connector) => connector.platform === item.platform)
        ?.accounts.filter((account) => account.state === "connected") ?? [];
    return (
      item.validation.errors.length > 0 ||
      !itemEdit?.selectedAccountId ||
      itemAccounts.length === 0
    );
  });

  function setDraft(draftId: string, change: Partial<EditableDraft>) {
    setEdits((current) => ({
      ...current,
      [draftId]: { ...current[draftId]!, ...change },
    }));
  }

  async function save(target: ReviewDraft) {
    const nextEdit = edits[target.id];
    if (!nextEdit) return;
    setBusy((current) => ({ ...current, [target.id]: true }));
    setNotice(null);
    try {
      await apiRequest(`/review/drafts/${target.id}`, {
        method: "PATCH",
        headers: reviewHeaders(),
        body: JSON.stringify({
          expectedRevision: target.revision,
          ...nextEdit,
          mediaUrls: nextEdit.mediaItems.flatMap((item) =>
            item.externalUrl ? [item.externalUrl] : [],
          ),
        }),
      });
      setNotice(`${platformNames[target.platform]} draft saved.`);
      await onRefresh();
    } catch (error) {
      setNotice(
        error instanceof ApiError && error.code === "STALE_REVISION"
          ? "This draft changed elsewhere. The latest version has been restored."
          : "The draft could not be saved safely.",
      );
      if (error instanceof ApiError && error.code === "STALE_REVISION") {
        await onRefresh();
      }
    } finally {
      setBusy((current) => ({ ...current, [target.id]: false }));
    }
  }

  async function publish() {
    setGroupBusy(true);
    setNotice("Publishing the approved review set.");
    requestId.current ??= crypto.randomUUID();
    try {
      await apiRequest(`/review/groups/${group.id}/publish`, {
        method: "POST",
        headers: reviewHeaders(),
        body: JSON.stringify({
          requestId: requestId.current,
          drafts: group.drafts.map((item) => ({
            draftId: item.id,
            expectedRevision: item.revision,
          })),
        }),
      });
      requestId.current = null;
      setNotice("Published. Live preview is ready in this panel.");
      await onRefresh();
    } catch (error) {
      setNotice(
        error instanceof ApiError && error.code === "PREFLIGHT_FAILED"
          ? "Fix the blocking draft errors before publishing. No platform call was made."
          : error instanceof ApiError && error.code === "PUBLISH_RATE_LIMIT"
            ? "The hourly publish limit is reached. No platform call was made."
            : "The publish result is not available yet. Retry this action safely.",
      );
      await onRefresh();
    } finally {
      setGroupBusy(false);
    }
  }

  async function check(target: ReviewDraft) {
    if (!target.latestAttempt) return;
    setBusy((current) => ({ ...current, [target.id]: true }));
    setNotice("Checking the reserved platform execution.");
    try {
      await apiRequest(`/review/attempts/${target.latestAttempt.id}/check`, {
        method: "POST",
        headers: reviewHeaders(),
        body: "{}",
      });
      await onRefresh();
      setNotice("The platform status has been refreshed.");
    } catch {
      setNotice("The status is still unavailable. No new post was created.");
    } finally {
      setBusy((current) => ({ ...current, [target.id]: false }));
    }
  }

  async function addImages(files: File[]) {
    const images = files.filter(isImageFile).slice(0, Math.max(0, 5 - edit.mediaItems.length));
    const rejected = files.some((file) => !isImageFile(file));
    if (rejected) {
      setNotice("Videos are not supported yet. Add images only.");
    }
    if (!images.length || locked) return;
    setUploading(true);
    setNotice(null);
    try {
      const tickets = await apiRequest<{
        uploads: Array<{ assetId: string; uploadUrl: string }>;
      }>("/media/uploads", {
        method: "POST",
        headers: { "X-Sochestral-Request": "publishing-action" },
        body: JSON.stringify({
          files: images.map((file) => ({
            name: file.name,
            mimeType: file.type,
            byteSize: file.size,
          })),
        }),
      });
      const added: ReviewMediaItem[] = [];
      for (const [index, file] of images.entries()) {
        const ticket = tickets.uploads[index];
        if (!ticket) continue;
        const uploaded = await fetch(ticket.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!uploaded.ok) throw new Error("Upload failed");
        await apiRequest(`/media/uploads/${ticket.assetId}/complete`, {
          method: "POST",
          headers: { "X-Sochestral-Request": "publishing-action" },
          body: "{}",
        });
        const previewUrl = URL.createObjectURL(file);
        setLocalPreviews((current) => ({
          ...current,
          [ticket.assetId]: previewUrl,
        }));
        added.push({ assetId: ticket.assetId, externalUrl: null });
      }
      setDraft(draft.id, { mediaItems: [...edit.mediaItems, ...added] });
    } catch {
      setNotice("Image upload failed. Try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const Preview =
    activePlatform === "linkedin_personal"
      ? LinkedInPreview
      : activePlatform === "instagram"
        ? InstagramPreview
        : ThreadsPreview;

  return (
    <motion.aside
      className="live-preview-aside"
      aria-label="Live platform preview"
      initial={{ opacity: 0, x: reduceMotion ? 0 : 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={reduceMotion ? { duration: 0 } : productMotion.enter}
    >
      <header className="live-preview-header">
        <div className="live-preview-heading">
          <p className="live-preview-kicker">Live preview</p>
          <h2>{live ? "Live on platform" : "How it will look"}</h2>
        </div>
        <div className="live-preview-header-actions">
          {live ? (
            <span className="live-preview-badge" role="status">
              Live
            </span>
          ) : null}
          {onClose ? (
            <motion.button
              type="button"
              className="live-preview-close"
              onClick={onClose}
              aria-label="Close preview"
              whileHover={reduceMotion ? undefined : { scale: 1.04 }}
              whileTap={reduceMotion ? undefined : { scale: 0.94 }}
              transition={productMotion.press}
            >
              <X className="size-4" aria-hidden="true" />
            </motion.button>
          ) : null}
        </div>
      </header>

      <div
        className="preview-platform-strip"
        role="tablist"
        aria-label="Platforms"
      >
        {previewPlatforms.map((platform) => {
          const selected = platform === activePlatform;
          const inSet = group.drafts.find((item) => item.platform === platform);
          return (
            <motion.button
              key={platform}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`preview-platform-tab${selected ? " preview-platform-tab-active" : ""}`}
              onClick={() => setActivePlatform(platform)}
              whileHover={reduceMotion ? undefined : { y: -1 }}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              transition={productMotion.press}
            >
              {selected && !reduceMotion ? (
                <motion.span
                  layoutId="preview-platform-pill"
                  className="preview-platform-pill"
                  transition={productMotion.press}
                />
              ) : selected ? (
                <span className="preview-platform-pill" />
              ) : null}
              <span className="preview-platform-tab-inner">
                <PlatformGlyph platform={platform} />
                <span>{platformNames[platform]}</span>
                {inSet?.status === "published" ? (
                  <Check className="size-3.5" aria-label="Published" />
                ) : null}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div className="live-preview-body">
        {previewOnly ? (
          <p className="live-preview-hint" role="status">
            Preview only for {platformNames[activePlatform]}. This review set
            does not include that platform yet, so you are seeing the same post
            styled for it.
          </p>
        ) : null}

        {connectorError ? (
          <p className="review-service-error" role="alert">
            Account choices are unavailable. Nothing can be published until they
            return.
          </p>
        ) : null}

        {connectorMissing ? (
          <p className="review-service-error" role="alert">
            Connect {platformNames[activePlatform]} in Settings to use that
            destination account.
          </p>
        ) : null}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activePlatform}
            className="live-preview-stage"
            initial={
              reduceMotion ? false : { opacity: 0, y: 8, scale: 0.985 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduceMotion ? undefined : { opacity: 0, y: -6, scale: 0.99 }
            }
            transition={reduceMotion ? { duration: 0 } : productMotion.enter}
          >
            <Preview
              platform={activePlatform}
              body={edit.body}
              mediaItems={edit.mediaItems}
              mediaPreviews={mergedPreviews}
              account={selectedAccount}
              locked={locked}
              live={live}
              onBodyChange={(value) => setDraft(draft.id, { body: value })}
            />
          </motion.div>
        </AnimatePresence>

        {!locked || !previewOnly || selectedAccount ? (
          <section
            className="live-preview-controls"
            aria-label="Preview controls"
          >
            {!locked ? (
              <div className="live-preview-media-tools">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    void addImages(Array.from(event.target.files ?? []));
                  }}
                />
                <motion.button
                  type="button"
                  className="live-preview-tool-btn"
                  disabled={uploading || edit.mediaItems.length >= 5}
                  onClick={() => fileInputRef.current?.click()}
                  whileHover={
                    reduceMotion || uploading || edit.mediaItems.length >= 5
                      ? undefined
                      : { y: -1, scale: 1.015 }
                  }
                  whileTap={
                    reduceMotion || uploading || edit.mediaItems.length >= 5
                      ? undefined
                      : { scale: 0.97 }
                  }
                  transition={productMotion.press}
                >
                  {uploading ? (
                    <LoaderCircle
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <ImagePlus className="size-4" aria-hidden="true" />
                  )}
                  Add image
                </motion.button>
                {edit.mediaItems.map((item, index) => (
                  <div
                    className="live-preview-media-row"
                    key={`${draft.id}-m-${index}`}
                  >
                    <span>
                      {item.assetId
                        ? `Image ${index + 1}`
                        : item.externalUrl || `Media ${index + 1}`}
                    </span>
                    <button
                      type="button"
                      aria-label={`Move image ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => {
                        const next = [...edit.mediaItems];
                        [next[index - 1], next[index]] = [
                          next[index],
                          next[index - 1],
                        ];
                        setDraft(draft.id, { mediaItems: next });
                      }}
                    >
                      <ArrowUp className="size-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move image ${index + 1} down`}
                      disabled={index === edit.mediaItems.length - 1}
                      onClick={() => {
                        const next = [...edit.mediaItems];
                        [next[index], next[index + 1]] = [
                          next[index + 1],
                          next[index],
                        ];
                        setDraft(draft.id, { mediaItems: next });
                      }}
                    >
                      <ArrowDown className="size-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove image ${index + 1}`}
                      onClick={() =>
                        setDraft(draft.id, {
                          mediaItems: edit.mediaItems.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        })
                      }
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {!previewOnly ? (
              <div className="review-field live-preview-account">
                <span className="review-field-label">Destination account</span>
                <SelectChip
                  className="os-select-chip-field"
                  label="Destination account"
                  value={edit.selectedAccountId ?? ""}
                  onChange={(value) =>
                    setDraft(draft.id, { selectedAccountId: value || null })
                  }
                  disabled={locked || busy[draft.id] || connectors === null}
                  options={[
                    { value: "", label: "Choose an account" },
                    ...accounts.map((account) => ({
                      value: account.id,
                      label: accountLabel(account),
                    })),
                  ]}
                />
              </div>
            ) : selectedAccount ? (
              <p className="live-preview-hint">
                Showing as {accountLabel(selectedAccount)} on{" "}
                {platformNames[activePlatform]}.
              </p>
            ) : null}
          </section>
        ) : null}

        {!previewOnly && draft.validation.errors.length ? (
          <ul className="review-errors" aria-label="Blocking errors">
            {draft.validation.errors.map((error) => (
              <li key={error}>
                <CircleAlert aria-hidden="true" />
                {error}
              </li>
            ))}
          </ul>
        ) : null}
        {!previewOnly && draft.validation.warnings.length ? (
          <ul className="review-warnings" aria-label="Warnings">
            {draft.validation.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
        {!previewOnly && draft.latestAttempt?.error ? (
          <p className="review-result-error" role="alert">
            {draft.latestAttempt.error.message}
          </p>
        ) : null}

        <AnimatePresence initial={false}>
          {notice ? (
            <motion.p
              className="review-notice"
              role="status"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {notice}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <footer className="live-preview-footer">
        <p className="live-preview-footer-note">
          {previewOnly
            ? "Switch back to a platform in this review set to edit, save, or publish."
            : live
              ? "This platform is live. Switch tabs to review the rest of the set."
              : dirty
                ? "Save your edits before you can approve this set."
                : "Approving publishes the entire validated set."}
        </p>
        <div className="live-preview-footer-actions">
          {!previewOnly && draft.status === "unknown" ? (
            <motion.button
              type="button"
              className="live-preview-footer-secondary"
              onClick={() => void check(draft)}
              disabled={busy[draft.id]}
              whileHover={
                reduceMotion || busy[draft.id]
                  ? undefined
                  : { y: -1 }
              }
              whileTap={
                reduceMotion || busy[draft.id] ? undefined : { scale: 0.98 }
              }
              transition={productMotion.press}
            >
              {busy[draft.id] ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="size-4" aria-hidden="true" />
              )}
              Check status
            </motion.button>
          ) : !previewOnly && !locked ? (
            <motion.button
              type="button"
              className="live-preview-footer-secondary"
              onClick={() => void save(draft)}
              disabled={!isDirty || busy[draft.id]}
              whileHover={
                reduceMotion || !isDirty || busy[draft.id]
                  ? undefined
                  : { y: -1 }
              }
              whileTap={
                reduceMotion || !isDirty || busy[draft.id]
                  ? undefined
                  : { scale: 0.98 }
              }
              transition={productMotion.press}
            >
              {busy[draft.id] ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="size-4" aria-hidden="true" />
              )}
              Save changes
            </motion.button>
          ) : null}
          <motion.button
            type="button"
            className="live-preview-approve"
            onClick={() => void publish()}
            disabled={
              groupBusy ||
              dirty ||
              blocking ||
              connectorError ||
              hasUnknown ||
              allPublished
            }
            whileHover={
              reduceMotion ||
              groupBusy ||
              dirty ||
              blocking ||
              connectorError ||
              hasUnknown ||
              allPublished
                ? undefined
                : { y: -1 }
            }
            whileTap={
              reduceMotion ||
              groupBusy ||
              dirty ||
              blocking ||
              connectorError ||
              hasUnknown ||
              allPublished
                ? undefined
                : { scale: 0.98 }
            }
            transition={productMotion.press}
          >
            {groupBusy ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
            {hasFailure ? "Try failed platforms again" : "Approve and publish"}
          </motion.button>
        </div>
      </footer>
    </motion.aside>
  );
}

export function pickActiveReviewGroup(
  groups: ReviewGroupValue[],
): ReviewGroupValue | null {
  if (!groups.length) return null;
  const actionable = [...groups]
    .reverse()
    .find((group) =>
      group.drafts.some((draft) => draft.status !== "published"),
    );
  if (actionable) return actionable;
  return [...groups].reverse()[0] ?? null;
}
