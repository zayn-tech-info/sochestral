"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ImagePlus, RefreshCw, X } from "lucide-react";

import { productMotion } from "@/components/app/product-motion-provider";
import { PlatformAccountPicker } from "@/components/app/platform-account-picker";
import { useToast } from "@/components/app/toast-provider";
import {
  InstagramIcon,
  LinkedInIcon,
  ThreadsIcon,
} from "@/components/auth/platform-icons";
import {
  InstagramPreview,
  LinkedInPreview,
  ThreadsPreview,
} from "@/components/preview";
import { isImageFile } from "@/components/preview/preview-shared";
import {
  ApiError,
  apiRequest,
  cancelCalendarSlot,
  getCalendarAccounts,
  getCalendarSlot,
  mirrorCalendarSlot,
  rescheduleCalendarSlot,
  rewriteCalendarSelection,
  updateCalendarSlotContent,
  type CalendarAccount,
  type ConnectorPlatform,
  type ScheduleDetail,
  type ScheduleRewriteAction,
} from "@/lib/product-api";
import {
  formatSlotTime,
  PLATFORM_LABELS,
  resolveTimeZone,
} from "@/lib/calendar-week";
import { userFacingError } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";

const MAX_INSTRUCTION_WORDS = 40;

function PlatformGlyph({
  platform,
  className,
}: {
  platform: ConnectorPlatform;
  className?: string;
}) {
  const Icon =
    platform === "linkedin_personal"
      ? LinkedInIcon
      : platform === "instagram"
        ? InstagramIcon
        : ThreadsIcon;
  return <Icon className={cn("size-3.5", className)} aria-hidden="true" />;
}

function statusClass(bucket: ScheduleDetail["statusBucket"]) {
  switch (bucket) {
    case "Done":
      return "cal-status-done";
    case "Failed":
      return "cal-status-failed";
    case "Canceled":
      return "cal-status-canceled";
    default:
      return "cal-status-scheduled";
  }
}

function toLocalInputValue(iso: string) {
  const local = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
}

function countWords(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

type SelectionState = {
  start: number;
  end: number;
  text: string;
};

  function PreviewForDetail({
  platform,
  account,
  caption,
  mediaItems,
  mediaPreviews,
  avatarUrl,
  editable,
  onBodyChange,
  onBodySelect,
}: {
  platform: ConnectorPlatform;
  account: {
    id: string;
    username: string | null;
    displayName: string | null;
    state: "connected";
  };
  caption: string;
  mediaItems: Array<{ assetId: string | null; externalUrl: string | null }>;
  mediaPreviews: Record<string, string>;
  avatarUrl: string | null;
  editable: boolean;
  onBodyChange: (value: string) => void;
  onBodySelect?: (el: HTMLTextAreaElement) => void;
}) {
  const props = {
    platform,
    body: caption || " ",
    mediaItems,
    mediaPreviews,
    account,
    locked: !editable,
    live: false,
    onBodyChange,
    avatarUrl,
    onBodySelect,
  };

  if (platform === "linkedin_personal") {
    return <LinkedInPreview {...props} />;
  }
  if (platform === "instagram") {
    return <InstagramPreview {...props} />;
  }
  return <ThreadsPreview {...props} />;
}

type ModalMediaItem = {
  assetId: string | null;
  /** Durable or external HTTPS URL persisted to SocialMCP. */
  externalUrl: string;
};

/** Matches orchestration `isSafeMediaUrl` (incl. local product media view proxy). */
function isPersistableMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    if (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      /\/media\/assets\/[^/]+\/view$/.test(url.pathname)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function ScheduleDetailModal({
  scheduleId,
  open,
  onClose,
  accounts: accountsProp,
  onChanged,
}: {
  scheduleId: string | null;
  open: boolean;
  onClose: () => void;
  accounts?: CalendarAccount[];
  onChanged?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();
  const timeZone = useMemo(() => resolveTimeZone(), []);
  const captionRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toolbarAnchorRef = useRef<HTMLDivElement | null>(null);
  const previewRowRef = useRef<HTMLDivElement | null>(null);
  const aiFloatRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{
    active: boolean;
    startX: number;
    scrollLeft: number;
  } | null>(null);
  const [detail, setDetail] = useState<ScheduleDetail | null>(null);
  const [accounts, setAccounts] = useState<CalendarAccount[]>(accountsProp ?? []);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [caption, setCaption] = useState("");
  const [mediaItems, setMediaItems] = useState<ModalMediaItem[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<Record<string, string>>({});
  const mediaPreviewsRef = useRef(mediaPreviews);
  mediaPreviewsRef.current = mediaPreviews;
  /** Selected account ids for preview / mirror (always includes source). */
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  /** Pending mirror times keyed by account id. */
  const [pendingTimes, setPendingTimes] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [aiAction, setAiAction] = useState<"tweak" | "comment" | null>(null);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const avatarUrl = useMemo(() => {
    if (!detail) return null;
    const match = accounts.find((account) => account.id === detail.accountId);
    return match?.avatarHint ?? null;
  }, [accounts, detail]);

  const selectedAccounts = useMemo(() => {
    const byId = new Map(accounts.map((account) => [account.id, account]));
    return selectedAccountIds
      .map((id) => byId.get(id))
      .filter((account): account is CalendarAccount => Boolean(account));
  }, [accounts, selectedAccountIds]);

  const load = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const [next, accountResult] = await Promise.all([
          getCalendarSlot(id),
          accountsProp
            ? Promise.resolve({ accounts: accountsProp })
            : getCalendarAccounts().catch(() => ({
                accounts: [] as CalendarAccount[],
              })),
        ]);
        setDetail(next);
        setAccounts(accountResult.accounts);
        setCaption(next.caption);
        setMediaPreviews((current) => {
          for (const url of Object.values(current)) {
            if (url.startsWith("blob:")) URL.revokeObjectURL(url);
          }
          return {};
        });
        setMediaItems(
          next.media.map((url) => ({ assetId: null, externalUrl: url })),
        );
        setSelectedAccountIds([next.accountId]);
        setPendingTimes({});
        setRescheduleValue(toLocalInputValue(next.scheduledAt));
        setSelection(null);
        setToolbarPos(null);
        setAiAction(null);
        setAiInstruction("");
        setAiSuggestion(null);
        setAiError(null);
      } catch (err) {
        setDetail(null);
        setError(err instanceof ApiError ? err.code : "REQUEST_FAILED");
      } finally {
        setLoading(false);
      }
    },
    [accountsProp],
  );

  useEffect(() => {
    if (!open || !scheduleId) return;
    void load(scheduleId);
  }, [open, scheduleId, load]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(mediaPreviewsRef.current)) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
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
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, aiAction, aiSuggestion, selection]);

  useEffect(() => {
    if (accountsProp) setAccounts(accountsProp);
  }, [accountsProp]);

  function syncSelection(el: HTMLTextAreaElement) {
    captionRef.current = el;
    if (!detail?.canEditContent) {
      setSelection(null);
      setToolbarPos(null);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === end) {
      setSelection(null);
      setToolbarPos(null);
      setAiAction(null);
      setAiSuggestion(null);
      return;
    }
    setSelection({
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
    // Approximate caret band: place toolbar above the textarea mid-selection area.
    const ratio =
      selection.end > 0 ? Math.min(1, selection.start / Math.max(el.value.length, 1)) : 0;
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

  async function onCancel() {
    if (!detail?.canCancel || !scheduleId) return;
    setBusy(true);
    try {
      await cancelCalendarSlot(scheduleId);
      toast({ tone: "success", title: "Schedule canceled." });
      await load(scheduleId);
      onChanged?.();
    } catch (err) {
      toast({
        tone: "error",
        title: userFacingError(
          err instanceof ApiError ? err.code : "REQUEST_FAILED",
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  async function onReschedule() {
    if (!detail?.canReschedule || !rescheduleValue || !scheduleId) return;
    setBusy(true);
    try {
      const scheduledAt = new Date(rescheduleValue).toISOString();
      const next = await rescheduleCalendarSlot(scheduleId, scheduledAt);
      setDetail(next);
      setRescheduleValue(toLocalInputValue(next.scheduledAt));
      toast({ tone: "success", title: "Schedule time updated." });
      onChanged?.();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "REQUEST_FAILED";
      toast({
        tone: "error",
        title: userFacingError(
          code === "MUTATION_UNSUPPORTED" && detail.statusBucket === "Canceled"
            ? "SCHEDULE_REACTIVATE_FAILED"
            : code,
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  async function onSaveContent() {
    if (!detail?.canEditContent || !scheduleId) return;
    const captionChanged = caption !== detail.caption;
    const nextMediaUrls = mediaItems
      .map((item) => item.externalUrl)
      .filter(isPersistableMediaUrl);
    const mediaChanged =
      JSON.stringify(nextMediaUrls) !== JSON.stringify(detail.media);
    const pendingAccountIds = Object.keys(pendingTimes).filter((accountId) =>
      selectedAccountIds.includes(accountId),
    );

    if (!captionChanged && !mediaChanged && pendingAccountIds.length === 0) {
      return;
    }

    for (const accountId of pendingAccountIds) {
      const account = accounts.find((row) => row.id === accountId);
      if (account?.platform === "instagram" && nextMediaUrls.length === 0) {
        toast({
          tone: "error",
          title: userFacingError("INVALID_CONTENT_UPDATE"),
        });
        return;
      }
      const local = pendingTimes[accountId];
      if (!local || Number.isNaN(new Date(local).getTime())) {
        toast({
          tone: "error",
          title: userFacingError("INVALID_CONTENT_UPDATE"),
        });
        return;
      }
      if (new Date(local).getTime() <= Date.now()) {
        toast({
          tone: "error",
          title: userFacingError("SCHEDULE_TIME_MUST_BE_FUTURE"),
        });
        return;
      }
    }

    setBusy(true);
    try {
      let nextDetail = detail;
      if (captionChanged || mediaChanged) {
        nextDetail = await updateCalendarSlotContent(scheduleId, {
          ...(captionChanged ? { caption } : {}),
          ...(mediaChanged ? { media: nextMediaUrls } : {}),
        });
        setDetail(nextDetail);
        setCaption(nextDetail.caption);
        setMediaItems(
          nextDetail.media.map((url) => ({ assetId: null, externalUrl: url })),
        );
        setMediaPreviews((current) => {
          for (const url of Object.values(current)) {
            if (url.startsWith("blob:")) URL.revokeObjectURL(url);
          }
          return {};
        });
      }

      const parts: string[] = [];
      if (captionChanged || mediaChanged) {
        parts.push("Caption and media saved");
      }

      if (pendingAccountIds.length > 0) {
        const targets = pendingAccountIds.map((accountId) => {
          const account = accounts.find((row) => row.id === accountId);
          if (!account) {
            throw new ApiError(422, "ACCOUNT_REQUIRED", {});
          }
          return {
            platform: account.platform,
            accountId: account.id,
            scheduledAt: new Date(pendingTimes[accountId]!).toISOString(),
          };
        });
        const mirrored = await mirrorCalendarSlot(scheduleId, {
          targets,
          caption: nextDetail.caption,
          media: nextDetail.media,
        });
        if (mirrored.created.length === 0) {
          toast({
            tone: "error",
            title:
              "No additional schedules were created. Check the account times and try again.",
          });
        } else {
          const labels = mirrored.created.map(
            (slot) => PLATFORM_LABELS[slot.platform] ?? slot.platform,
          );
          parts.push(`Also scheduled on ${labels.join(", ")}`);
        }
        setPendingTimes({});
        setSelectedAccountIds([nextDetail.accountId]);
      }

      if (parts.length) {
        toast({ tone: "success", title: `${parts.join(". ")}.` });
      }
      onChanged?.();
    } catch (err) {
      toast({
        tone: "error",
        title: userFacingError(
          err instanceof ApiError ? err.code : "REQUEST_FAILED",
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  async function addImages(files: File[]) {
    if (!detail?.canEditContent) return;
    const images = files
      .filter(isImageFile)
      .slice(0, Math.max(0, 5 - mediaItems.length));
    if (!images.length) return;
    setUploading(true);
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
      const added: ModalMediaItem[] = [];
      const previewAdds: Record<string, string> = {};
      for (const [index, file] of images.entries()) {
        const ticket = tickets.uploads[index];
        if (!ticket) continue;
        const uploaded = await fetch(ticket.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });
        if (!uploaded.ok) throw new Error("Upload failed");
        const completed = await apiRequest<{
          previewUrl: string;
          viewUrl?: string;
          id?: string;
        }>(`/media/uploads/${ticket.assetId}/complete`, {
          method: "POST",
          headers: { "X-Sochestral-Request": "publishing-action" },
          body: "{}",
        });
        // Prefer durable product view URLs (re-sign on each GET). Never persist
        // short-lived R2 preview URLs into SocialMCP.
        const durable = completed.viewUrl?.trim() || null;
        if (!durable || !isPersistableMediaUrl(durable)) continue;
        const blobUrl = URL.createObjectURL(file);
        previewAdds[ticket.assetId] = blobUrl;
        added.push({ assetId: ticket.assetId, externalUrl: durable });
      }
      if (added.length) {
        setMediaItems((current) => [...current, ...added].slice(0, 5));
        setMediaPreviews((current) => ({ ...current, ...previewAdds }));
      }
    } catch {
      toast({
        tone: "error",
        title: userFacingError("MEDIA_UPLOAD_FAILED"),
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function runRewrite(
    action: ScheduleRewriteAction,
    instruction?: string,
  ) {
    if (!scheduleId || !selection) return;
    setAiBusy(true);
    setAiError(null);
    setAiSuggestion(null);
    try {
      const result = await rewriteCalendarSelection(scheduleId, {
        selection: selection.text,
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
    if (!selection || aiSuggestion == null) return;
    const next =
      caption.slice(0, selection.start) +
      aiSuggestion +
      caption.slice(selection.end);
    setCaption(next);
    setSelection(null);
    setToolbarPos(null);
    setAiAction(null);
    setAiInstruction("");
    setAiSuggestion(null);
  }

  function onSelectedAccountsChange(nextIds: string[]) {
    if (!detail) return;
    const locked = detail.accountId;
    const withSource = nextIds.includes(locked)
      ? nextIds
      : [locked, ...nextIds];
    const unique = Array.from(new Set(withSource));
    setSelectedAccountIds(unique);
    setPendingTimes((current) => {
      const next: Record<string, string> = {};
      for (const accountId of unique) {
        if (accountId === locked) continue;
        next[accountId] =
          current[accountId] ?? toLocalInputValue(detail.scheduledAt);
      }
      return next;
    });
  }

  function onPreviewRowPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const row = previewRowRef.current;
    if (!row || event.button !== 0) return;
    // Don't start drag from interactive controls inside a preview.
    const target = event.target as HTMLElement;
    if (target.closest("textarea, button, input, a, label")) return;
    dragState.current = {
      active: true,
      startX: event.clientX,
      scrollLeft: row.scrollLeft,
    };
    row.setPointerCapture(event.pointerId);
  }

  function onPreviewRowPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const row = previewRowRef.current;
    const state = dragState.current;
    if (!row || !state?.active) return;
    const delta = event.clientX - state.startX;
    row.scrollLeft = state.scrollLeft - delta;
  }

  function onPreviewRowPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const row = previewRowRef.current;
    if (row?.hasPointerCapture(event.pointerId)) {
      row.releasePointerCapture(event.pointerId);
    }
    dragState.current = null;
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    void addImages(files);
  }

  const pendingAccountIds = Object.keys(pendingTimes).filter((accountId) =>
    selectedAccountIds.includes(accountId),
  );
  const contentDirty =
    !!detail?.canEditContent &&
    (caption !== detail.caption ||
      JSON.stringify(mediaItems.map((item) => item.externalUrl)) !==
        JSON.stringify(detail.media));
  const pendingBlocked = pendingAccountIds.some((accountId) => {
    const account = accounts.find((row) => row.id === accountId);
    if (account?.platform === "instagram" && mediaItems.length === 0) return true;
    const local = pendingTimes[accountId];
    if (!local) return true;
    const at = new Date(local).getTime();
    return Number.isNaN(at) || at <= Date.now();
  });
  const dirty = contentDirty || pendingAccountIds.length > 0;
  const canSave =
    !!detail?.canEditContent && dirty && !pendingBlocked && !busy && !uploading;

  const instructionWords = countWords(aiInstruction);
  const instructionOk =
    aiInstruction.trim().length > 0 && instructionWords <= MAX_INSTRUCTION_WORDS;

  return (
    <AnimatePresence>
      {open && scheduleId ? (
        <div className="cal-modal-root" role="presentation">
          <motion.button
            type="button"
            className="cal-modal-backdrop"
            aria-label="Close schedule detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : productMotion.quick}
            onClick={onClose}
          />
          <motion.div
            className="cal-modal-board"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cal-modal-title"
            initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
            transition={reduceMotion ? { duration: 0 } : productMotion.sheet}
          >
            <header className="cal-modal-header">
              <div className="cal-modal-title-block">
                <h2 id="cal-modal-title">
                  {detail ? "Scheduled post" : "Schedule detail"}
                </h2>
                {detail ? (
                  <div
                    className="cal-modal-meta-strip"
                    aria-label="Schedule summary"
                  >
                    <span
                      className={cn(
                        "cal-modal-platform-mark",
                        `cal-modal-platform-mark-${detail.platform}`,
                      )}
                      title={
                        PLATFORM_LABELS[detail.platform] ?? detail.platform
                      }
                    >
                      <PlatformGlyph platform={detail.platform} />
                      <span className="sr-only">
                        {PLATFORM_LABELS[detail.platform] ?? detail.platform}
                      </span>
                    </span>
                    <span
                      className="cal-modal-meta-account"
                      title={detail.accountLabel}
                    >
                      {detail.accountLabel}
                    </span>
                    <span className="cal-modal-meta-sep" aria-hidden="true">
                      ·
                    </span>
                    <time dateTime={detail.scheduledAt}>
                      {formatSlotTime(detail.scheduledAt, timeZone)}
                    </time>
                    <span className="cal-modal-meta-sep" aria-hidden="true">
                      ·
                    </span>
                    <span className="cal-modal-meta-zone" title={timeZone}>
                      {timeZone}
                    </span>
                    <span
                      className={cn(
                        "cal-modal-meta-status",
                        statusClass(detail.statusBucket),
                      )}
                    >
                      {detail.statusBucket}
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="cal-modal-header-actions">
                {detail ? (
                  <div className="cal-modal-header-timing">
                    <label className="cal-modal-header-timing-field">
                      <span className="sr-only">Reschedule</span>
                      <input
                        type="datetime-local"
                        value={rescheduleValue}
                        onChange={(event) =>
                          setRescheduleValue(event.target.value)
                        }
                        disabled={!detail.canReschedule || busy}
                      />
                    </label>
                    <button
                      type="button"
                      className="cal-link-btn"
                      disabled={
                        !detail.canReschedule || busy || !rescheduleValue
                      }
                      onClick={() => void onReschedule()}
                    >
                      Save new time
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="cal-icon-btn"
                  onClick={() => scheduleId && void load(scheduleId)}
                  aria-label="Refresh schedule"
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="cal-icon-btn"
                  onClick={onClose}
                  aria-label="Close"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="cal-modal-body cal-modal-body-preview">
              {loading ? <p className="cal-day-muted">Loading…</p> : null}
              {error ? (
                <div className="cal-error" role="alert">
                  <p>{userFacingError(error)}</p>
                  <button
                    type="button"
                    className="cal-link-btn"
                    onClick={() => scheduleId && void load(scheduleId)}
                  >
                    Retry
                  </button>
                </div>
              ) : null}

              {detail ? (
                <div className="cal-modal-preview-stack">
                  {accounts.length > 0 && detail.canEditContent ? (
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
                        lockedAccountIds={[detail.accountId]}
                        aria-label="Choose accounts to preview and schedule"
                      />
                    </div>
                  ) : null}

                  <div
                    className="cal-modal-preview-row"
                    ref={(node) => {
                      previewRowRef.current = node;
                      toolbarAnchorRef.current = node;
                    }}
                    onPointerDown={onPreviewRowPointerDown}
                    onPointerMove={onPreviewRowPointerMove}
                    onPointerUp={onPreviewRowPointerUp}
                    onPointerCancel={onPreviewRowPointerUp}
                  >
                    {selectedAccounts.map((accountRow) => {
                      const platform = accountRow.platform;
                      const isSource = accountRow.id === detail.accountId;
                      const isEditable = detail.canEditContent;
                      const isPending = accountRow.id in pendingTimes;
                      const paneAccount = {
                        id: accountRow.id,
                        username: accountRow.username ?? detail.accountLabel,
                        displayName: accountRow.label ?? detail.accountLabel,
                        state: "connected" as const,
                      };
                      const paneAvatar =
                        accountRow.avatarHint &&
                        accountRow.avatarHint.startsWith("https:")
                          ? accountRow.avatarHint
                          : isSource
                            ? avatarUrl
                            : null;
                      return (
                        <div
                          key={accountRow.id}
                          className="cal-modal-preview-col"
                          aria-label={`${accountRow.label} · ${PLATFORM_LABELS[platform]} preview`}
                        >
                          <PreviewForDetail
                            platform={platform}
                            account={paneAccount}
                            caption={caption}
                            mediaItems={mediaItems.map((item) => ({
                              assetId: item.assetId,
                              externalUrl: item.externalUrl,
                            }))}
                            mediaPreviews={mediaPreviews}
                            avatarUrl={paneAvatar}
                            editable={isEditable}
                            onBodyChange={setCaption}
                            onBodySelect={isEditable ? syncSelection : undefined}
                          />
                          {isPending && detail.canEditContent ? (
                            <div className="cal-modal-pending-time">
                              <label>
                                <span className="cal-modal-pending-time-label">
                                  Schedule on {accountRow.label}
                                </span>
                                <input
                                  type="datetime-local"
                                  value={pendingTimes[accountRow.id] ?? ""}
                                  onChange={(event) =>
                                    setPendingTimes((current) => ({
                                      ...current,
                                      [accountRow.id]: event.target.value,
                                    }))
                                  }
                                  disabled={busy}
                                />
                              </label>
                              {platform === "instagram" &&
                              mediaItems.length === 0 ? (
                                <p className="cal-modal-pending-hint" role="status">
                                  Add an image before scheduling Instagram.
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {detail.canEditContent ? (
                    <div className="cal-modal-media-bar">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        onChange={onFileChange}
                      />
                      <button
                        type="button"
                        className="cal-link-btn cal-modal-media-add"
                        disabled={uploading || mediaItems.length >= 5 || busy}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <ImagePlus className="size-3.5" aria-hidden="true" />
                        {uploading ? "Uploading…" : "Add images"}
                      </button>
                      {mediaItems.length > 0 ? (
                        <ul className="cal-modal-media-list">
                          {mediaItems.map((item, index) => (
                            <li key={`${item.assetId ?? item.externalUrl}-${index}`}>
                              <span>Image {index + 1}</span>
                              <button
                                type="button"
                                className="cal-modal-media-remove"
                                aria-label={`Remove image ${index + 1}`}
                                onClick={() => {
                                  const assetId = item.assetId;
                                  setMediaItems((current) =>
                                    current.filter((_, i) => i !== index),
                                  );
                                  if (assetId) {
                                    setMediaPreviews((current) => {
                                      const next = { ...current };
                                      const url = next[assetId];
                                      if (url?.startsWith("blob:")) {
                                        URL.revokeObjectURL(url);
                                      }
                                      delete next[assetId];
                                      return next;
                                    });
                                  }
                                }}
                              >
                                <X className="size-3" aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  {detail.conversationId || detail.draftId ? (
                    <div className="cal-detail-actions">
                      {detail.conversationId ? (
                        <Link
                          href={`/app/chat/${detail.conversationId}`}
                          className="cal-link-btn"
                        >
                          Open chat
                        </Link>
                      ) : null}
                      {detail.draftId ? (
                        <button
                          type="button"
                          className="cal-link-btn"
                          onClick={() =>
                            router.push(
                              `/app/chat/${detail.conversationId ?? ""}?draft=${detail.draftId}`,
                            )
                          }
                        >
                          Open review draft
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {detail ? (
              <footer className="cal-modal-footer">
                <button
                  type="button"
                  className="cal-danger-btn"
                  disabled={!detail.canCancel || busy}
                  onClick={() => void onCancel()}
                >
                  Cancel schedule
                </button>
                {detail.canEditContent ? (
                  <button
                    type="button"
                    className="cal-btn-primary"
                    disabled={!canSave}
                    onClick={() => void onSaveContent()}
                  >
                    Save changes
                  </button>
                ) : null}
              </footer>
            ) : null}
          </motion.div>

          {selection && toolbarPos && detail?.canEditContent ? (
            <div
              ref={aiFloatRef}
              className="cal-ai-float"
              style={{ top: toolbarPos.top, left: toolbarPos.left }}
              role="toolbar"
              aria-label="Rewrite selection"
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
                      aiAction === "tweak" ? "Tweak instruction" : "Comment instruction"
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
