"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowUp, ImagePlus, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  ApiError,
  composeCalendarCaptions,
  createCalendarSlots,
  getImageJob,
  listRecentImageGenerations,
  rewriteCaptionSelection,
  type CalendarAccount,
  type ConnectorPlatform,
  type ImageJob,
  type ScheduleRewriteAction,
} from "@/lib/product-api";
import { PLATFORM_LABELS, resolveTimeZone } from "@/lib/calendar-week";
import { platformImageLimits } from "@/lib/platform-media-limits";
import {
  cleanupScheduleUploads,
  collectUnusedScheduleUploadAssetIds,
  isPersistableMediaUrl,
  isUploadableImageFile,
  uploadImagesForSchedule,
} from "@/lib/media-upload";
import { userFacingError } from "@/lib/user-facing-error";
import { InstagramPreview } from "@/components/preview/instagram-preview";
import { LinkedInPreview } from "@/components/preview/linkedin-preview";
import { ThreadsPreview } from "@/components/preview/threads-preview";
import { PlatformAccountPicker } from "./platform-account-picker";
import { ScheduleTimeCollapse } from "./schedule-time-collapse";
import { productMotion } from "./product-motion-provider";
import { useToast } from "./toast-provider";
import { cn } from "@/lib/utils";

const MAX_INSTRUCTION_WORDS = 40;

type ModalMediaItem = {
  assetId: string | null;
  externalUrl: string;
};

type SelectionState = {
  accountId: string;
  start: number;
  end: number;
  text: string;
};

function countWords(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function toLocalInputValue(iso: string) {
  const local = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
}

function isFutureLocalInput(value: string): boolean {
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed) && parsed > Date.now();
}

function PreviewPane({
  platform,
  account,
  caption,
  mediaItems,
  mediaPreviews,
  avatarUrl,
  onBodyChange,
  onBodySelect,
}: {
  platform: ConnectorPlatform;
  account: CalendarAccount;
  caption: string;
  mediaItems: ModalMediaItem[];
  mediaPreviews: Record<string, string>;
  avatarUrl: string | null;
  onBodyChange: (value: string) => void;
  onBodySelect?: (el: HTMLTextAreaElement) => void;
}) {
  const props = {
    platform,
    body: caption || " ",
    mediaItems: mediaItems.map((item) => ({
      assetId: item.assetId,
      externalUrl: item.externalUrl,
    })),
    mediaPreviews,
    account: {
      id: account.id,
      username: account.username,
      displayName: account.label,
      state: "connected" as const,
    },
    locked: false,
    live: false,
    onBodyChange,
    onBodySelect,
    avatarUrl,
  };
  if (platform === "linkedin_personal") return <LinkedInPreview {...props} />;
  if (platform === "instagram") return <InstagramPreview {...props} />;
  return <ThreadsPreview {...props} />;
}

export function CreateScheduleModal({
  open,
  accounts,
  initialScheduledAt,
  onClose,
  onCreated,
}: {
  open: boolean;
  accounts: CalendarAccount[];
  initialScheduledAt: string | null;
  onClose: () => void;
  onCreated: (scheduleId: string) => void;
}) {
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();
  const timeZone = useMemo(() => resolveTimeZone(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewRowRef = useRef<HTMLDivElement | null>(null);
  const paneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const captionRef = useRef<HTMLTextAreaElement | null>(null);
  const aiFloatRef = useRef<HTMLDivElement | null>(null);
  const dragScroll = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
  } | null>(null);

  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [focusAccountId, setFocusAccountId] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [scheduledLocals, setScheduledLocals] = useState<Record<string, string>>(
    {},
  );
  const [defaultLocal, setDefaultLocal] = useState("");
  const [mediaByAccount, setMediaByAccount] = useState<
    Record<string, ModalMediaItem[]>
  >({});
  const [mediaPreviews, setMediaPreviews] = useState<Record<string, string>>(
    {},
  );
  const mediaByAccountRef = useRef(mediaByAccount);
  const savedRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [socBusy, setSocBusy] = useState(false);
  const [uploadingAccountId, setUploadingAccountId] = useState<string | null>(
    null,
  );
  const [uploadTargetAccountId, setUploadTargetAccountId] = useState<
    string | null
  >(null);
  const [socDraft, setSocDraft] = useState("");
  const [socStatus, setSocStatus] = useState<"idle" | "writing" | "done">(
    "idle",
  );
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [aiAction, setAiAction] = useState<"tweak" | "comment" | null>(null);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [recentJobs, setRecentJobs] = useState<ImageJob[]>([]);
  const [recentOpenFor, setRecentOpenFor] = useState<string | null>(null);
  const selectionRef = useRef<SelectionState | null>(null);
  selectionRef.current = selection;

  const selectedAccounts = useMemo(
    () =>
      selectedAccountIds
        .map((id) => accounts.find((row) => row.id === id))
        .filter((row): row is CalendarAccount => Boolean(row)),
    [accounts, selectedAccountIds],
  );

  mediaByAccountRef.current = mediaByAccount;

  function flatMedia(
    source: Record<string, ModalMediaItem[]> = mediaByAccountRef.current,
  ) {
    return Object.values(source).flat();
  }

  function cleanupRemovedMedia(
    removed: ModalMediaItem[],
    current: ModalMediaItem[] = flatMedia(),
  ) {
    const assetIds = collectUnusedScheduleUploadAssetIds(removed, current);
    if (assetIds.length > 0) void cleanupScheduleUploads(assetIds);
  }

  useEffect(() => {
    if (!open) return;
    savedRef.current = false;
    const initial = initialScheduledAt
      ? toLocalInputValue(initialScheduledAt)
      : "";
    setSelectedAccountIds([]);
    setFocusAccountId(null);
    setCaptions({});
    setScheduledLocals({});
    setDefaultLocal(initial);
    setMediaByAccount({});
    setUploadingAccountId(null);
    setUploadTargetAccountId(null);
    setMediaPreviews((current) => {
      for (const url of Object.values(current)) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
      return {};
    });
    setSocDraft("");
    setSocStatus("idle");
    setSelection(null);
    setToolbarPos(null);
    setAiAction(null);
    setAiInstruction("");
    setAiSuggestion(null);
    setAiError(null);
    setAiBusy(false);
    setRecentOpenFor(null);
    void listRecentImageGenerations()
      .then((result) =>
        setRecentJobs(
          result.items.filter(
            (job) => job.status === "succeeded" && job.resultMediaAssetId,
          ),
        ),
      )
      .catch(() => setRecentJobs([]));
  }, [open, initialScheduledAt]);

  useEffect(() => {
    if (open || savedRef.current) return;
    const assetIds = collectUnusedScheduleUploadAssetIds(flatMedia(), []);
    if (assetIds.length > 0) void cleanupScheduleUploads(assetIds);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (aiAction || aiSuggestion || selection) {
        setAiAction(null);
        setAiInstruction("");
        setAiSuggestion(null);
        setAiError(null);
        setSelection(null);
        setToolbarPos(null);
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, aiAction, aiSuggestion, selection]);

  function clearRewriteUi() {
    setSelection(null);
    setToolbarPos(null);
    setAiAction(null);
    setAiInstruction("");
    setAiSuggestion(null);
    setAiError(null);
  }

  function syncSelection(accountId: string, el: HTMLTextAreaElement) {
    captionRef.current = el;
    setFocusAccountId(accountId);
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === end) {
      clearRewriteUi();
      return;
    }
    setSelection({
      accountId,
      start,
      end,
      text: el.value.slice(start, end),
    });
    setAiSuggestion(null);
    setAiError(null);
  }

  useLayoutEffect(() => {
    if (!selection || !captionRef.current) {
      setToolbarPos(null);
      return;
    }
    const el = captionRef.current;
    const rect = el.getBoundingClientRect();
    const ratio =
      selection.end > 0
        ? Math.min(1, selection.start / Math.max(el.value.length, 1))
        : 0;
    const top = Math.max(12, rect.top + ratio * Math.min(rect.height, 120) - 44);
    const left = Math.min(
      window.innerWidth - 280,
      Math.max(12, rect.left + rect.width / 2 - 140),
    );
    setToolbarPos({ top, left });
  }, [selection]);

  useLayoutEffect(() => {
    if (!toolbarPos || !aiFloatRef.current) return;
    const float = aiFloatRef.current;
    const rect = float.getBoundingClientRect();
    const pad = 12;
    let top = toolbarPos.top;
    let left = toolbarPos.left;
    if (rect.bottom > window.innerHeight - pad) {
      top = Math.max(pad, top - (rect.bottom - (window.innerHeight - pad)));
    }
    if (rect.right > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - pad - rect.width);
    }
    if (top !== toolbarPos.top || left !== toolbarPos.left) {
      setToolbarPos({ top, left });
    }
  }, [toolbarPos, aiSuggestion, aiAction, aiError]);

  function onSelectedAccountsChange(ids: string[]) {
    const unique = Array.from(new Set(ids));
    setSelectedAccountIds(unique);
    setCaptions((current) => {
      const next: Record<string, string> = {};
      for (const id of unique) next[id] = current[id] ?? "";
      return next;
    });
    setScheduledLocals((current) => {
      const next: Record<string, string> = {};
      for (const id of unique) {
        next[id] = current[id] ?? defaultLocal;
      }
      return next;
    });
    const nextMedia: Record<string, ModalMediaItem[]> = {};
    const keptAssetIds = new Set<string>();
    const removedMedia: ModalMediaItem[] = [];
    for (const id of unique) {
      const items = mediaByAccount[id] ?? [];
      nextMedia[id] = items;
      for (const item of items) {
        if (item.assetId) keptAssetIds.add(item.assetId);
      }
    }
    for (const [id, items] of Object.entries(mediaByAccount)) {
      if (!unique.includes(id)) removedMedia.push(...items);
    }
    setMediaByAccount(nextMedia);
    cleanupRemovedMedia(removedMedia, flatMedia(nextMedia));
    setMediaPreviews((previews) => {
      const previewNext: Record<string, string> = {};
      for (const [assetId, url] of Object.entries(previews)) {
        if (keptAssetIds.has(assetId)) {
          previewNext[assetId] = url;
        } else if (url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      }
      return previewNext;
    });
    setFocusAccountId((current) =>
      current && unique.includes(current) ? current : (unique[0] ?? null),
    );
    if (selection && !unique.includes(selection.accountId)) {
      clearRewriteUi();
    }
  }

  async function addImages(accountId: string, files: File[]) {
    if (files.length === 0) return;
    const account = accounts.find((row) => row.id === accountId);
    if (!account) return;
    const limits = platformImageLimits(account.platform);
    const existing = mediaByAccount[accountId] ?? [];
    const room = Math.max(0, limits.max - existing.length);
    if (room === 0) return;

    const images = files.filter(isUploadableImageFile).slice(0, room);
    if (images.length === 0) {
      toast({
        tone: "error",
        title: userFacingError("UNSUPPORTED_MEDIA"),
      });
      return;
    }

    setUploadingAccountId(accountId);
    try {
      const uploaded = await uploadImagesForSchedule(images);
      if (uploaded.length) {
        setMediaByAccount((current) => {
          const prior = current[accountId] ?? [];
          return {
            ...current,
            [accountId]: [
              ...prior,
              ...uploaded.map((item) => ({
                assetId: item.assetId,
                externalUrl: item.externalUrl,
              })),
            ].slice(0, limits.max),
          };
        });
        setMediaPreviews((current) => {
          const next = { ...current };
          for (const item of uploaded) {
            next[item.assetId] = item.previewUrl;
          }
          return next;
        });
      }
    } catch (err) {
      toast({
        tone: "error",
        title: userFacingError(
          err instanceof ApiError ? err : "MEDIA_UPLOAD_FAILED",
        ),
      });
    } finally {
      setUploadingAccountId(null);
      setUploadTargetAccountId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function attachRecentGeneration(accountId: string, job: ImageJob) {
    const assetId = job.resultMediaAssetId;
    if (!assetId) return;
    const account = accounts.find((row) => row.id === accountId);
    if (!account) return;
    const limits = platformImageLimits(account.platform);
    const existing = mediaByAccount[accountId] ?? [];
    if (existing.length >= limits.max) return;
    if (existing.some((item) => item.assetId === assetId)) {
      setRecentOpenFor(null);
      return;
    }
    try {
      const detail = await getImageJob(job.id);
      const previewUrl = detail.resultPreviewUrl ?? "";
      setMediaByAccount((current) => {
        const prior = current[accountId] ?? [];
        return {
          ...current,
          [accountId]: [
            ...prior,
            { assetId, externalUrl: previewUrl || assetId },
          ].slice(0, limits.max),
        };
      });
      if (previewUrl) {
        setMediaPreviews((current) => ({
          ...current,
          [assetId]: previewUrl,
        }));
      }
      setRecentOpenFor(null);
      toast({ tone: "success", title: "Generated image attached" });
    } catch (error) {
      toast({
        tone: "error",
        title: userFacingError(error, {
          fallback: "Could not attach that generation.",
        }),
      });
    }
  }

  function removeImage(accountId: string, index: number) {
    setMediaByAccount((current) => {
      const items = [...(current[accountId] ?? [])];
      const [removed] = items.splice(index, 1);
      if (removed?.assetId) {
        const stillUsed = Object.entries(current).some(
          ([id, list]) =>
            id !== accountId &&
            list.some((item) => item.assetId === removed.assetId),
        );
        if (!stillUsed) {
          cleanupRemovedMedia([removed], flatMedia({ ...current, [accountId]: items }));
          setMediaPreviews((previews) => {
            const next = { ...previews };
            const url = next[removed.assetId!];
            if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
            delete next[removed.assetId!];
            return next;
          });
        }
      }
      return { ...current, [accountId]: items };
    });
  }

  const mediaReady = selectedAccounts.every((row) => {
    const count = (mediaByAccount[row.id] ?? []).length;
    const limits = platformImageLimits(row.platform);
    return count >= limits.min && count <= limits.max;
  });

  const allCaptionsReady =
    selectedAccounts.length > 0 &&
    selectedAccounts.every((row) => (captions[row.id] ?? "").trim().length > 0);

  const allTimesReady =
    selectedAccounts.length > 0 &&
    selectedAccounts.every((row) =>
      isFutureLocalInput(scheduledLocals[row.id] ?? ""),
    );

  const canSave =
    allCaptionsReady &&
    allTimesReady &&
    mediaReady &&
    !busy &&
    !uploadingAccountId &&
    !socBusy;

  const canAskSoc = selectedAccounts.length > 0 && !busy && !socBusy;

  const instructionWords = countWords(aiInstruction);
  const instructionOk =
    aiInstruction.trim().length > 0 && instructionWords <= MAX_INSTRUCTION_WORDS;

  async function runRewrite(
    action: ScheduleRewriteAction,
    instruction?: string,
  ) {
    const active = selectionRef.current;
    if (!active) return;
    setAiBusy(true);
    setAiError(null);
    setAiSuggestion(null);
    try {
      const result = await rewriteCaptionSelection({
        selection: active.text,
        action,
        ...(instruction !== undefined ? { instruction } : {}),
      });
      setAiSuggestion(result.suggestion);
    } catch (err) {
      setAiError(err instanceof ApiError ? err.code : "REWRITE_UNAVAILABLE");
    } finally {
      setAiBusy(false);
    }
  }

  function acceptSuggestion() {
    const active = selectionRef.current;
    if (!active || aiSuggestion == null) return;
    const accountId = active.accountId;
    const current = captions[accountId] ?? "";
    const next =
      current.slice(0, active.start) +
      aiSuggestion +
      current.slice(active.end);
    setCaptions((prev) => ({ ...prev, [accountId]: next }));
    clearRewriteUi();
  }

  function scrollToAccount(accountId: string) {
    const pane = paneRefs.current[accountId];
    if (pane && typeof pane.scrollIntoView === "function") {
      pane.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        inline: "nearest",
        block: "nearest",
      });
    }
  }

  async function onSocSend() {
    if (!canAskSoc) return;
    const message = socDraft.trim();
    setSocDraft("");
    setSocBusy(true);
    setSocStatus("writing");
    try {
      const result = await composeCalendarCaptions({
        message: message || undefined,
        targets: selectedAccounts.map((row) => ({
          accountId: row.id,
          platform: row.platform,
          caption: captions[row.id] ?? "",
        })),
        focusAccountId,
      });
      setCaptions((current) => {
        const next = { ...current };
        for (const update of result.updates) {
          next[update.accountId] = update.caption;
        }
        return next;
      });
      const firstUpdated = result.updates[0]?.accountId;
      if (firstUpdated) {
        setFocusAccountId(firstUpdated);
        queueMicrotask(() => scrollToAccount(firstUpdated));
      }
      setSocStatus("done");
      window.setTimeout(() => setSocStatus("idle"), 1600);
    } catch (err) {
      setSocStatus("idle");
      const code =
        err instanceof ApiError ? err.code : "REWRITE_UNAVAILABLE";
      toast({
        tone: "error",
        title: userFacingError(code),
      });
    } finally {
      setSocBusy(false);
    }
  }

  async function onSave() {
    if (!canSave) return;
    setBusy(true);
    try {
      const result = await createCalendarSlots({
        targets: selectedAccounts.map((row) => {
          const media = (mediaByAccount[row.id] ?? [])
            .map((item) => item.externalUrl)
            .filter(isPersistableMediaUrl);
          return {
            platform: row.platform,
            accountId: row.id,
            scheduledAt: new Date(scheduledLocals[row.id]!).toISOString(),
            caption: captions[row.id]!.trim(),
            ...(media.length > 0 ? { media } : {}),
          };
        }),
      });
      const first = result.created[0];
      if (!first) {
        throw new ApiError(502, "INVALID_SCHEDULE_RESPONSE", {});
      }
      savedRef.current = true;
      toast({
        tone: "success",
        title:
          result.created.length > 1
            ? `Scheduled ${result.created.length} posts.`
            : "Scheduled.",
      });
      onCreated(first.scheduleId);
    } catch (err) {
      toast({
        tone: "error",
        title: userFacingError(
          err instanceof ApiError ? err : "REQUEST_FAILED",
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  function onPreviewRowPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const row = previewRowRef.current;
    if (!row) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("textarea, button, input, a, label")) return;
    dragScroll.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScroll: row.scrollLeft,
    };
    row.setPointerCapture(event.pointerId);
  }

  function onPreviewRowPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const row = previewRowRef.current;
    const session = dragScroll.current;
    if (!row || !session || session.pointerId !== event.pointerId) return;
    row.scrollLeft = session.startScroll - (event.clientX - session.startX);
  }

  function onPreviewRowPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const row = previewRowRef.current;
    const session = dragScroll.current;
    if (!row || !session || session.pointerId !== event.pointerId) return;
    dragScroll.current = null;
    if (row.hasPointerCapture(event.pointerId)) {
      row.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <div className="cal-modal-root" role="presentation">
          <motion.button
            type="button"
            className="cal-modal-backdrop"
            aria-label="Close"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={reduceMotion ? undefined : { opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={productMotion.enter}
            onClick={onClose}
          />
          <motion.div
            className="cal-modal-board"
            role="dialog"
            aria-modal="true"
            aria-label="Create schedule"
            initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
            transition={productMotion.enter}
          >
            <header className="cal-modal-header">
              <div className="cal-modal-title-block">
                <h2>New schedule</h2>
                <p className="cal-modal-meta-zone">
                  {timeZone}
                  {selectedAccounts.length > 0
                    ? ` · ${selectedAccounts.length} account${selectedAccounts.length === 1 ? "" : "s"}`
                    : " · Pick accounts"}
                </p>
              </div>
              <div className="cal-modal-header-actions">
                <button
                  type="button"
                  className="cal-icon-btn"
                  aria-label="Close"
                  onClick={onClose}
                >
                  <X className="size-4" />
                </button>
              </div>
            </header>

            <div className="cal-modal-body cal-modal-body-preview">
              <div className="cal-modal-preview-stack">
                <div
                  className="cal-modal-platform-rail"
                  role="group"
                  aria-label="Target accounts"
                >
                  <PlatformAccountPicker
                    accounts={accounts}
                    selectedAccountIds={selectedAccountIds}
                    onChange={onSelectedAccountsChange}
                    mode="target"
                    aria-label="Choose accounts for this schedule"
                  />
                </div>

                {selectedAccounts.length > 0 ? (
                  <div
                    className="cal-modal-preview-row"
                    ref={(node) => {
                      previewRowRef.current = node;
                    }}
                    onPointerDown={onPreviewRowPointerDown}
                    onPointerMove={onPreviewRowPointerMove}
                    onPointerUp={onPreviewRowPointerUp}
                    onPointerCancel={onPreviewRowPointerUp}
                  >
                    {selectedAccounts.map((accountRow) => {
                      const paneMedia = mediaByAccount[accountRow.id] ?? [];
                      const limits = platformImageLimits(accountRow.platform);
                      const atMax = paneMedia.length >= limits.max;
                      const needsMin =
                        paneMedia.length < limits.min && limits.min > 0;
                      const uploadingHere =
                        uploadingAccountId === accountRow.id;
                      return (
                      <div
                        key={accountRow.id}
                        ref={(node) => {
                          paneRefs.current[accountRow.id] = node;
                        }}
                        className={cn(
                          "cal-modal-preview-col",
                          focusAccountId === accountRow.id &&
                            "cal-modal-preview-col-focus",
                        )}
                        aria-label={`${accountRow.label} · ${PLATFORM_LABELS[accountRow.platform]} preview`}
                        onFocusCapture={() => setFocusAccountId(accountRow.id)}
                        onPointerDown={() => setFocusAccountId(accountRow.id)}
                      >
                        <PreviewPane
                          platform={accountRow.platform}
                          account={accountRow}
                          caption={captions[accountRow.id] ?? ""}
                          mediaItems={paneMedia}
                          mediaPreviews={mediaPreviews}
                          avatarUrl={accountRow.avatarHint}
                          onBodyChange={(value) => {
                            setCaptions((current) => ({
                              ...current,
                              [accountRow.id]: value,
                            }));
                            if (selection?.accountId === accountRow.id) {
                              clearRewriteUi();
                            }
                          }}
                          onBodySelect={(el) =>
                            syncSelection(accountRow.id, el)
                          }
                        />
                        <div className="cal-modal-pane-media">
                          <button
                            type="button"
                            className="cal-link-btn cal-modal-media-add"
                            disabled={
                              busy ||
                              Boolean(uploadingAccountId) ||
                              atMax
                            }
                            onClick={() => {
                              setUploadTargetAccountId(accountRow.id);
                              queueMicrotask(() =>
                                fileInputRef.current?.click(),
                              );
                            }}
                            aria-label={`Add images for ${accountRow.label}`}
                          >
                            <ImagePlus
                              className="size-3.5"
                              aria-hidden="true"
                            />
                            {uploadingHere
                              ? "Uploading…"
                              : atMax
                                ? `Max ${limits.max} images`
                                : "Add images"}
                          </button>
                          {recentJobs.length > 0 && !atMax ? (
                            <div className="cal-modal-recent-gen">
                              <button
                                type="button"
                                className="cal-link-btn"
                                disabled={busy || Boolean(uploadingAccountId)}
                                onClick={() =>
                                  setRecentOpenFor((current) =>
                                    current === accountRow.id
                                      ? null
                                      : accountRow.id,
                                  )
                                }
                              >
                                Use recent
                              </button>
                              {recentOpenFor === accountRow.id ? (
                                <ul className="cal-modal-recent-list">
                                  {recentJobs.map((job) => (
                                    <li key={job.id}>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          void attachRecentGeneration(
                                            accountRow.id,
                                            job,
                                          )
                                        }
                                      >
                                        {job.kind.replaceAll("_", " ")}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          ) : null}
                          {paneMedia.length > 0 ? (
                            <ul className="cal-modal-media-list">
                              {paneMedia.map((item, index) => (
                                <li key={item.assetId ?? item.externalUrl}>
                                  <span>
                                    Image {index + 1}
                                    {paneMedia.length > 1
                                      ? ` of ${paneMedia.length}`
                                      : ""}
                                  </span>
                                  <button
                                    type="button"
                                    className="cal-modal-media-remove"
                                    aria-label={`Remove image ${index + 1} from ${accountRow.label}`}
                                    disabled={busy || Boolean(uploadingAccountId)}
                                    onClick={() =>
                                      removeImage(accountRow.id, index)
                                    }
                                  >
                                    <X className="size-3" aria-hidden="true" />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {needsMin ? (
                            <p className="cal-modal-pending-hint" role="status">
                              {PLATFORM_LABELS[accountRow.platform]} needs at
                              least {limits.min} image
                              {limits.min === 1 ? "" : "s"} before you can save.
                            </p>
                          ) : null}
                          {!needsMin && paneMedia.length > 0 ? (
                            <p className="cal-modal-pane-media-meta">
                              {paneMedia.length}/{limits.max} images
                            </p>
                          ) : null}
                        </div>
                        <ScheduleTimeCollapse
                          accountLabel={accountRow.label}
                          value={scheduledLocals[accountRow.id] ?? ""}
                          onChange={(next) =>
                            setScheduledLocals((current) => ({
                              ...current,
                              [accountRow.id]: next,
                            }))
                          }
                          disabled={busy}
                        >
                          {scheduledLocals[accountRow.id] &&
                          !isFutureLocalInput(
                            scheduledLocals[accountRow.id]!,
                          ) ? (
                            <p className="cal-modal-pending-hint" role="status">
                              Pick a future time.
                            </p>
                          ) : null}
                        </ScheduleTimeCollapse>
                      </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="cal-create-empty">
                    <p>
                      Select one or more accounts to preview and write captions.
                    </p>
                    <textarea
                      className="cal-create-empty-textarea"
                      placeholder="Your caption will appear here after you pick an account…"
                      disabled
                      rows={8}
                      value=""
                      aria-label="Caption (select an account first)"
                    />
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  multiple
                  hidden
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const targetId = uploadTargetAccountId;
                    const files = Array.from(event.target.files ?? []);
                    if (targetId) void addImages(targetId, files);
                    else if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                />
              </div>

              <div
                className={cn(
                  "cal-soc-dock",
                  socBusy && "cal-soc-dock-busy",
                  socStatus === "done" && "cal-soc-dock-done",
                  !canAskSoc && "cal-soc-dock-idle",
                )}
                aria-label="Compose with Soc"
              >
                <form
                  className="cal-soc-dock-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void onSocSend();
                  }}
                >
                  <div className="cal-soc-dock-field">
                    <label className="sr-only" htmlFor="cal-soc-compose">
                      Ask Soc to draft captions
                    </label>
                    <textarea
                      id="cal-soc-compose"
                      rows={1}
                      value={socDraft}
                      onChange={(event) => setSocDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void onSocSend();
                        }
                      }}
                      placeholder={
                        selectedAccounts.length === 0
                          ? "Select accounts, then ask Soc to draft…"
                          : "Describe the post, or press send for a draft…"
                      }
                      aria-label="Ask Soc to draft captions"
                      disabled={!canAskSoc}
                    />
                    <button
                      type="submit"
                      className="cal-soc-dock-send"
                      disabled={!canAskSoc}
                      aria-label={socBusy ? "Drafting" : "Draft with Soc"}
                    >
                      {socBusy ? (
                        <span className="cal-soc-dock-spinner" aria-hidden="true" />
                      ) : (
                        <ArrowUp className="size-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </form>
                <p className="cal-soc-dock-hint" aria-live="polite">
                  {socBusy
                    ? "Writing into your previews…"
                    : socStatus === "done"
                      ? "Captions updated."
                      : selectedAccounts.length === 0
                        ? "Soc writes straight into the selected previews."
                        : "Name a platform to target it. Leave blank to draft all."}
                </p>
              </div>
            </div>

            <footer className="cal-modal-footer">
              <button
                type="button"
                className="cal-danger-btn"
                disabled={busy || socBusy}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cal-btn-primary"
                disabled={!canSave}
                onClick={() => void onSave()}
              >
                {busy ? "Saving…" : "Save schedule"}
              </button>
            </footer>
          </motion.div>

          {selection && toolbarPos ? (
            <div
              ref={aiFloatRef}
              className="cal-ai-float"
              style={{ top: toolbarPos.top, left: toolbarPos.left }}
              role="toolbar"
              aria-label="Rewrite selection"
              onMouseDown={(event) => {
                // Keep caption selection when clicking rewrite chips.
                event.preventDefault();
              }}
            >
              <div className="cal-ai-float-chips">
                <button
                  type="button"
                  className="cal-ai-chip"
                  disabled={aiBusy}
                  onClick={() => {
                    setAiAction(null);
                    setAiInstruction("");
                    void runRewrite("regenerate");
                  }}
                >
                  {aiBusy && !aiAction ? "…" : "Regenerate"}
                </button>
                <button
                  type="button"
                  className={
                    aiAction === "tweak"
                      ? "cal-ai-chip cal-ai-chip-active"
                      : "cal-ai-chip"
                  }
                  disabled={aiBusy}
                  onClick={() => {
                    setAiAction("tweak");
                    setAiSuggestion(null);
                    setAiError(null);
                  }}
                >
                  Tweak
                </button>
                <button
                  type="button"
                  className={
                    aiAction === "comment"
                      ? "cal-ai-chip cal-ai-chip-active"
                      : "cal-ai-chip"
                  }
                  disabled={aiBusy}
                  onClick={() => {
                    setAiAction("comment");
                    setAiSuggestion(null);
                    setAiError(null);
                  }}
                >
                  Add a comment
                </button>
              </div>

              {aiAction ? (
                <div className="cal-ai-float-input">
                  <input
                    type="text"
                    value={aiInstruction}
                    maxLength={280}
                    placeholder={
                      aiAction === "tweak"
                        ? "How should we tweak it?"
                        : "What should change?"
                    }
                    onChange={(event) => setAiInstruction(event.target.value)}
                    aria-label={
                      aiAction === "tweak"
                        ? "Tweak instruction"
                        : "Comment instruction"
                    }
                  />
                  <span className="cal-ai-float-count">
                    {instructionWords}/{MAX_INSTRUCTION_WORDS}
                  </span>
                  <button
                    type="button"
                    className="cal-btn-primary cal-btn-primary-sm"
                    disabled={aiBusy || !instructionOk}
                    onClick={() => void runRewrite(aiAction, aiInstruction.trim())}
                  >
                    {aiBusy ? "…" : "Go"}
                  </button>
                </div>
              ) : null}

              {aiError ? (
                <p className="cal-ai-float-status" role="status">
                  {userFacingError(aiError)}
                </p>
              ) : null}

              {aiSuggestion ? (
                <div className="cal-ai-float-suggestion">
                  <p className="cal-ai-float-suggestion-body">{aiSuggestion}</p>
                  <div className="cal-ai-float-suggest-actions">
                    <button
                      type="button"
                      className="cal-btn-primary cal-btn-primary-sm"
                      onClick={acceptSuggestion}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="cal-link-btn"
                      onClick={() => setAiSuggestion(null)}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </AnimatePresence>
  );
}
