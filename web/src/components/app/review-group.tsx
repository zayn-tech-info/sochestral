"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ApiError,
  apiRequest,
  type ConnectorSummary,
  type ReviewDraft,
  type ReviewGroup as ReviewGroupValue,
} from "@/lib/product-api";
import { productMotion } from "./product-motion-provider";

const platformNames = {
  threads: "Threads",
  linkedin_personal: "LinkedIn Personal",
  instagram: "Instagram",
} as const;

type ReviewMediaItem = { assetId: string | null; externalUrl: string | null };
type EditableDraft = Pick<ReviewDraft, "body" | "selectedAccountId"> & {
  mediaItems: ReviewMediaItem[];
};

function sameDraft(a: EditableDraft, b: ReviewDraft) {
  return (
    a.body === b.body &&
    a.selectedAccountId === b.selectedAccountId &&
    JSON.stringify(a.mediaItems) === JSON.stringify(b.mediaItems ?? b.mediaUrls.map((externalUrl) => ({ assetId: null, externalUrl })))
  );
}

function reviewHeaders() {
  return { "X-Sochestral-Request": "review-action" };
}

export function ReviewGroup({
  group,
  onRefresh,
  autoOpen = false,
  mediaPreviews = {},
}: {
  group: ReviewGroupValue;
  onRefresh: () => Promise<void>;
  autoOpen?: boolean;
  mediaPreviews?: Record<string, string>;
}) {
  const reduceMotion = useReducedMotion();
  const [connectors, setConnectors] = useState<ConnectorSummary[] | null>(null);
  const [connectorError, setConnectorError] = useState(false);
  const [edits, setEdits] = useState<Record<string, EditableDraft>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [groupBusy, setGroupBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const autoOpened = useRef(false);
  const hasUnknown = group.drafts.some((draft) => draft.status === "unknown");
  const allPublished = group.drafts.every((draft) => draft.status === "published");
  const hasFailure = group.drafts.some((draft) => draft.status === "failed");
  const hasPartialResult = group.drafts.some((draft) => draft.status === "published") && !allPublished;
  const automaticSuccess = allPublished && group.drafts.every(
    (draft) => draft.latestAttempt?.authorizationKind && draft.latestAttempt.authorizationKind !== "manual",
  );

  useEffect(() => {
    setEdits(
      Object.fromEntries(
        group.drafts.map((draft) => [
          draft.id,
          {
            body: draft.body,
            mediaItems: draft.mediaItems ?? draft.mediaUrls.map((externalUrl) => ({ assetId: null, externalUrl })),
            selectedAccountId: draft.selectedAccountId,
          },
        ]),
      ),
    );
  }, [group]);

  useEffect(() => {
    if (automaticSuccess) return;
    let active = true;
    apiRequest<{ connectors: ConnectorSummary[] }>("/connectors")
      .then((result) => {
        if (!active) return;
        setConnectors(result.connectors);
        setConnectorError(false);
        setEdits((current) => {
          const next = { ...current };
          for (const draft of group.drafts) {
            const accounts = result.connectors
              .find((connector) => connector.platform === draft.platform)
              ?.accounts.filter((account) => account.state === "connected") ?? [];
            if (accounts.length === 1 && next[draft.id] && !next[draft.id]!.selectedAccountId) {
              next[draft.id] = { ...next[draft.id]!, selectedAccountId: accounts[0]!.id };
            }
          }
          return next;
        });
      })
      .catch(() => active && setConnectorError(true));
    return () => {
      active = false;
    };
  }, [automaticSuccess, group.drafts]);

  const dirty = useMemo(
    () =>
      group.drafts.some((draft) => {
        const edit = edits[draft.id];
        return edit ? !sameDraft(edit, draft) : false;
      }),
    [edits, group.drafts],
  );

  function setDraft(draftId: string, change: Partial<EditableDraft>) {
    setEdits((current) => ({
      ...current,
      [draftId]: { ...current[draftId]!, ...change },
    }));
  }

  async function save(draft: ReviewDraft) {
    const edit = edits[draft.id];
    if (!edit) return;
    setBusy((current) => ({ ...current, [draft.id]: true }));
    setNotice(null);
    try {
      await apiRequest(`/review/drafts/${draft.id}`, {
        method: "PATCH",
        headers: reviewHeaders(),
        body: JSON.stringify({
          expectedRevision: draft.revision,
          ...edit,
          mediaUrls: edit.mediaItems.flatMap((item) => item.externalUrl ? [item.externalUrl] : []),
        }),
      });
      setNotice(`${platformNames[draft.platform]} draft saved.`);
      await onRefresh();
    } catch (error) {
      setNotice(
        error instanceof ApiError && error.code === "STALE_REVISION"
          ? "This draft changed elsewhere. The latest version has been restored."
          : "The draft could not be saved safely.",
      );
      if (error instanceof ApiError && error.code === "STALE_REVISION") await onRefresh();
    } finally {
      setBusy((current) => ({ ...current, [draft.id]: false }));
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
          drafts: group.drafts.map((draft) => ({
            draftId: draft.id,
            expectedRevision: draft.revision,
          })),
        }),
      });
      requestId.current = null;
      setNotice("The review set finished. Platform results are shown below.");
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

  async function check(draft: ReviewDraft) {
    if (!draft.latestAttempt) return;
    setBusy((current) => ({ ...current, [draft.id]: true }));
    setNotice("Checking the reserved platform execution.");
    try {
      await apiRequest(`/review/attempts/${draft.latestAttempt.id}/check`, {
        method: "POST",
        headers: reviewHeaders(),
        body: "{}",
      });
      await onRefresh();
      setNotice("The platform status has been refreshed.");
    } catch {
      setNotice("The status is still unavailable. No new post was created.");
    } finally {
      setBusy((current) => ({ ...current, [draft.id]: false }));
    }
  }

  const launcherTitle = automaticSuccess
    ? "Published social set"
    : hasUnknown || hasFailure || hasPartialResult
      ? "Social set needs attention"
      : "Review social set";
  const groupState = allPublished
    ? "Published"
    : hasUnknown
      ? "Check status"
      : hasFailure
        ? "Needs attention"
        : "Ready to review";
  const blocking = group.drafts.some((draft) => {
    const edit = edits[draft.id];
    const accounts = connectors
      ?.find((connector) => connector.platform === draft.platform)
      ?.accounts.filter((account) => account.state === "connected") ?? [];
    return (
      draft.validation.errors.length > 0 ||
      !edit?.selectedAccountId ||
      accounts.length === 0
    );
  });

  useEffect(() => {
    if (!autoOpen || allPublished || autoOpened.current) return;
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    autoOpened.current = true;
    dialog.showModal();
  }, [allPublished, autoOpen, group.id]);

  if (automaticSuccess) {
    return (
      <motion.div
        className="review-published-status"
        role="status"
        aria-label="Published social set"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : productMotion.enter}
      >
        <Check aria-hidden="true" />
        <span>
          <strong>Published</strong>
          <small>{group.drafts.length} {group.drafts.length === 1 ? "platform" : "platforms"}</small>
        </span>
      </motion.div>
    );
  }

  function openDialog() {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <motion.button
        ref={launcherRef}
        type="button"
        className="review-launcher"
        onClick={openDialog}
        aria-haspopup="dialog"
        initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : productMotion.enter}
      >
        <span>
          <strong>{launcherTitle}</strong>
          <small>{group.drafts.length} {group.drafts.length === 1 ? "platform" : "platforms"} · {groupState}</small>
        </span>
        <span>View review <ChevronRight aria-hidden="true" /></span>
      </motion.button>
      <dialog
        ref={dialogRef}
        className="review-dialog"
        aria-labelledby={`review-${group.id}`}
        onClose={() => launcherRef.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        <motion.section
          initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : productMotion.enter}
          className="review-group"
        >
      <header className="review-heading">
        <div>
          <p className="review-kicker">Review before publishing</p>
          <h2 id={`review-${group.id}`}>Approve this social set</h2>
        </div>
        <div className="review-heading-actions">
          <span>{group.drafts.length} {group.drafts.length === 1 ? "platform" : "platforms"}</span>
          <button type="button" onClick={closeDialog} aria-label="Close review">
            <X aria-hidden="true" />
          </button>
        </div>
      </header>

      {connectorError ? (
        <p className="review-service-error" role="alert">
          Account choices are unavailable. Nothing can be published until they return.
        </p>
      ) : null}

      <ol className="review-drafts">
        {group.drafts.map((draft) => {
          const edit = edits[draft.id] ?? {
            body: draft.body,
            selectedAccountId: draft.selectedAccountId,
            mediaItems: draft.mediaItems ?? draft.mediaUrls.map((externalUrl) => ({
              assetId: null,
              externalUrl,
            })),
          };
          const accounts = connectors
            ?.find((connector) => connector.platform === draft.platform)
            ?.accounts.filter((account) => account.state === "connected") ?? [];
          const locked = draft.status === "published" || draft.status === "unknown";
          const isDirty = !sameDraft(edit, draft);
          return (
            <li key={draft.id} className={`review-draft review-draft-${draft.status}`}>
              <header>
                <div>
                  <h3>{platformNames[draft.platform]}</h3>
                  <p>Revision {draft.revision}</p>
                </div>
                <span className="review-state">{draft.latestAttempt?.state ?? draft.status}</span>
              </header>

              <label>
                Post copy
                <textarea
                  value={edit.body}
                  onChange={(event) => setDraft(draft.id, { body: event.target.value })}
                  maxLength={8000}
                  rows={4}
                  disabled={locked || busy[draft.id]}
                />
                <small>{edit.body.length.toLocaleString()} / 8,000 characters</small>
              </label>

              <fieldset disabled={locked || busy[draft.id]}>
                <legend>Post images and public media URLs</legend>
                {edit.mediaItems.map((item, index) => (
                  <div className="review-media-row" key={`${draft.id}-${index}`}>
                    {item.assetId ? (
                      <span className="review-owned-media">
                        {mediaPreviews[item.assetId] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaPreviews[item.assetId]} alt="Uploaded post image" />
                        ) : null}
                        Uploaded image {index + 1}
                      </span>
                    ) : (
                      <>
                        <label className="sr-only" htmlFor={`${draft.id}-media-${index}`}>
                          Media URL {index + 1}
                        </label>
                        <input
                          id={`${draft.id}-media-${index}`}
                          type="url"
                          inputMode="url"
                          value={item.externalUrl ?? ""}
                          onChange={(event) => {
                            const next = [...edit.mediaItems];
                            next[index] = { assetId: null, externalUrl: event.target.value };
                            setDraft(draft.id, { mediaItems: next });
                          }}
                          placeholder="https://example.com/image.jpg"
                        />
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...edit.mediaItems];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        setDraft(draft.id, { mediaItems: next });
                      }}
                      disabled={index === 0}
                      aria-label={`Move media URL ${index + 1} up`}
                    ><ArrowUp aria-hidden="true" /></button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...edit.mediaItems];
                        [next[index], next[index + 1]] = [next[index + 1], next[index]];
                        setDraft(draft.id, { mediaItems: next });
                      }}
                      disabled={index === edit.mediaItems.length - 1}
                      aria-label={`Move media URL ${index + 1} down`}
                    ><ArrowDown aria-hidden="true" /></button>
                    <button
                      type="button"
                      onClick={() => setDraft(draft.id, { mediaItems: edit.mediaItems.filter((_, itemIndex) => itemIndex !== index) })}
                      aria-label={`Remove media item ${index + 1}`}
                    ><Trash2 aria-hidden="true" /></button>
                  </div>
                ))}
                {edit.mediaItems.length < 5 ? (
                  <button
                    type="button"
                    className="review-add-media"
                    onClick={() => setDraft(draft.id, { mediaItems: [...edit.mediaItems, { assetId: null, externalUrl: "" }] })}
                  ><Plus aria-hidden="true" /> Add media URL</button>
                ) : null}
              </fieldset>

              <label>
                Destination account
                <select
                  value={edit.selectedAccountId ?? ""}
                  onChange={(event) => setDraft(draft.id, { selectedAccountId: event.target.value || null })}
                  disabled={locked || busy[draft.id] || connectors === null}
                  required
                >
                  <option value="">Choose an account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.displayName ?? account.username ?? "Connected account"}
                    </option>
                  ))}
                </select>
              </label>

              {draft.validation.errors.length ? (
                <ul className="review-errors" aria-label="Blocking errors">
                  {draft.validation.errors.map((error) => <li key={error}><CircleAlert aria-hidden="true" />{error}</li>)}
                </ul>
              ) : null}
              {draft.validation.warnings.length ? (
                <ul className="review-warnings" aria-label="Warnings">
                  {draft.validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              ) : null}
              {draft.latestAttempt?.error ? (
                <p className="review-result-error" role="alert">{draft.latestAttempt.error.message}</p>
              ) : null}
              {draft.status === "published" ? (
                <p className="review-success"><Check aria-hidden="true" /> Published successfully</p>
              ) : null}

              <div className="review-draft-actions">
                {draft.status === "unknown" ? (
                  <button type="button" onClick={() => void check(draft)} disabled={busy[draft.id]}>
                    {busy[draft.id] ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                    Check status
                  </button>
                ) : !locked ? (
                  <button type="button" onClick={() => void save(draft)} disabled={!isDirty || busy[draft.id]}>
                    {busy[draft.id] ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
                    Save changes
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <AnimatePresence initial={false}>
        {notice ? <motion.p className="review-notice" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{notice}</motion.p> : null}
      </AnimatePresence>
      <footer className="review-approval">
        <p>{dirty ? "Save every change before approval." : "This publishes the entire validated set."}</p>
        <button
          type="button"
          onClick={() => void publish()}
          disabled={groupBusy || dirty || blocking || connectorError || hasUnknown || allPublished}
        >
          {groupBusy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
          {group.drafts.some((draft) => draft.status === "failed") ? "Try failed platforms again" : "Approve and publish"}
        </button>
      </footer>
        </motion.section>
      </dialog>
    </>
  );
}
