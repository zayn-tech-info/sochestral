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
import { ScheduleTimeCollapse } from "@/components/app/schedule-time-collapse";
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
import {
  ApiError,
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
  cleanupScheduleUploads,
  collectUnusedScheduleUploadAssetIds,
  isPersistableMediaUrl,
  isUploadableImageFile,
  uploadImagesForSchedule,
} from "@/lib/media-upload";
import { platformImageLimits } from "@/lib/platform-media-limits";
import {
  formatSlotTime,
  PLATFORM_LABELS,
  resolveTimeZone,
} from "@/lib/calendar-week";
import { userFacingError } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";

const MAX_INSTRUCTION_WORDS = 40;
const EMPTY_RELATED_SCHEDULE_IDS: string[] = [];

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

const PENDING_TIME_BUFFER_MS = 60 * 60 * 1000;

function isFutureLocalInput(local: string, nowMs = Date.now()): boolean {
  const at = new Date(local).getTime();
  return !Number.isNaN(at) && at > nowMs;
}

/** Prefer an existing future local datetime; otherwise one hour from now. */
function defaultPendingLocalTime(
  ...candidates: Array<string | null | undefined>
): string {
  const nowMs = Date.now();
  for (const candidate of candidates) {
    if (candidate && isFutureLocalInput(candidate, nowMs)) return candidate;
  }
  return toLocalInputValue(new Date(nowMs + PENDING_TIME_BUFFER_MS).toISOString());
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

export function ScheduleDetailModal({
  scheduleId,
  relatedScheduleIds = EMPTY_RELATED_SCHEDULE_IDS,
  open,
  onClose,
  accounts: accountsProp,
  onChanged,
}: {
  scheduleId: string | null;
  relatedScheduleIds?: string[];
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
  const [uploadingAccountId, setUploadingAccountId] = useState<string | null>(
    null,
  );
  const [uploadTargetAccountId, setUploadTargetAccountId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [caption, setCaption] = useState("");
  const [detailsByAccount, setDetailsByAccount] = useState<
    Record<string, ScheduleDetail>
  >({});
  const [mediaByAccount, setMediaByAccount] = useState<
    Record<string, ModalMediaItem[]>
  >({});
  const [mediaPreviews, setMediaPreviews] = useState<Record<string, string>>({});
  const mediaByAccountRef = useRef(mediaByAccount);
  const detailRef = useRef(detail);
  const savedRef = useRef(false);
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

  mediaByAccountRef.current = mediaByAccount;
  detailRef.current = detail;

  function sourceMediaItems(source: Record<string, ModalMediaItem[]> = mediaByAccount) {
    if (!detail) return [];
    return (
      source[detail.accountId] ??
      detail.media.map((url) => ({ assetId: null, externalUrl: url }))
    );
  }

  function paneMediaFor(
    accountId: string,
    source: Record<string, ModalMediaItem[]> = mediaByAccount,
  ) {
    if (!detail) return [];
    if (accountId === detail.accountId) return sourceMediaItems(source);
    return accountId in source ? source[accountId] ?? [] : sourceMediaItems(source);
  }

  function flatMedia(
    source: Record<string, ModalMediaItem[]> = mediaByAccountRef.current,
  ) {
    return Object.values(source).flat();
  }

  function cleanupRemovedMedia(
    removed: ModalMediaItem[],
    current: ModalMediaItem[] = flatMedia(),
  ) {
    const assetIds = collectUnusedScheduleUploadAssetIds(
      removed,
      current,
      detail?.media ?? [],
    );
    if (assetIds.length > 0) void cleanupScheduleUploads(assetIds);
  }

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
        const siblingIds = Array.from(
          new Set(relatedScheduleIds.filter((relatedId) => relatedId !== id)),
        );
        const siblingResults = await Promise.all(
          siblingIds.map((relatedId) =>
            getCalendarSlot(relatedId).catch(() => null),
          ),
        );
        const seenAccountIds = new Set<string>();
        const relatedDetails = [next, ...siblingResults]
          .filter((row): row is ScheduleDetail => Boolean(row))
          .filter((row) => {
            if (seenAccountIds.has(row.accountId)) return false;
            seenAccountIds.add(row.accountId);
            return true;
          });
        const nextDetailsByAccount = Object.fromEntries(
          relatedDetails.map((row) => [row.accountId, row]),
        );
        setDetail(next);
        setDetailsByAccount(nextDetailsByAccount);
        setAccounts(accountResult.accounts);
        setCaption(next.caption);
        setMediaPreviews((current) => {
          for (const url of Object.values(current)) {
            if (url.startsWith("blob:")) URL.revokeObjectURL(url);
          }
          return {};
        });
        setMediaByAccount(
          Object.fromEntries(
            relatedDetails.map((row) => [
              row.accountId,
              row.media.map((url) => ({
                assetId: null,
                externalUrl: url,
              })),
            ]),
          ),
        );
        setUploadingAccountId(null);
        setUploadTargetAccountId(null);
        setSelectedAccountIds(relatedDetails.map((row) => row.accountId));
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
    [accountsProp, relatedScheduleIds],
  );

  useEffect(() => {
    if (!open || !scheduleId) return;
    savedRef.current = false;
    void load(scheduleId);
  }, [open, scheduleId, load]);

  useEffect(() => {
    if (open || savedRef.current) return;
    const assetIds = collectUnusedScheduleUploadAssetIds(
      flatMedia(),
      [],
      detailRef.current?.media ?? [],
    );
    if (assetIds.length > 0) void cleanupScheduleUploads(assetIds);
  }, [open]);

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
        title: userFacingError(err),
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
            : err,
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  async function onSaveContent() {
    if (!detail?.canEditContent || !scheduleId) return;
    const captionChanged = caption !== detail.caption;
    const sourceMediaUrls = paneMediaFor(detail.accountId)
      .map((item) => item.externalUrl)
      .filter(isPersistableMediaUrl);
    const mediaChanged =
      JSON.stringify(sourceMediaUrls) !== JSON.stringify(detail.media);
    const pendingAccountIds = Object.keys(pendingTimes).filter((accountId) =>
      selectedAccountIds.includes(accountId),
    );
    const sourceDropped = !selectedAccountIds.includes(detail.accountId);

    if (
      !captionChanged &&
      !mediaChanged &&
      pendingAccountIds.length === 0 &&
      !sourceDropped
    ) {
      return;
    }

    if (sourceDropped && pendingAccountIds.length === 0) {
      toast({
        tone: "error",
        title:
          "Choose another account before removing this schedule's original platform.",
      });
      return;
    }

    if (selectedAccountIds.includes(detail.accountId)) {
      const sourceLimits = platformImageLimits(detail.platform);
      if (
        sourceMediaUrls.length < sourceLimits.min ||
        sourceMediaUrls.length > sourceLimits.max
      ) {
        toast({
          tone: "error",
          title: userFacingError("INVALID_CONTENT_UPDATE"),
        });
        return;
      }
    }

    for (const accountId of pendingAccountIds) {
      const account = accounts.find((row) => row.id === accountId);
      if (!account) {
        toast({
          tone: "error",
          title: userFacingError("ACCOUNT_REQUIRED"),
        });
        return;
      }
      const paneMedia = paneMediaFor(accountId)
        .map((item) => item.externalUrl)
        .filter(isPersistableMediaUrl);
      const limits = platformImageLimits(account.platform);
      if (paneMedia.length < limits.min || paneMedia.length > limits.max) {
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
          ...(mediaChanged ? { media: sourceMediaUrls } : {}),
        });
        setDetail(nextDetail);
        setCaption(nextDetail.caption);
        savedRef.current = true;
        setMediaByAccount((current) => ({
          ...current,
          [nextDetail.accountId]: nextDetail.media.map((url) => ({
            assetId: null,
            externalUrl: url,
          })),
        }));
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

      let mirroredCreated: ScheduleDetail[] = [];
      if (pendingAccountIds.length > 0) {
        const targets = pendingAccountIds.map((accountId) => {
          const account = accounts.find((row) => row.id === accountId);
          if (!account) {
            throw new ApiError(422, "ACCOUNT_REQUIRED", {});
          }
          const media = paneMediaFor(accountId)
            .map((item) => item.externalUrl)
            .filter(isPersistableMediaUrl);
          const hasExplicitMedia = accountId in mediaByAccount;
          return {
            platform: account.platform,
            accountId: account.id,
            scheduledAt: new Date(pendingTimes[accountId]!).toISOString(),
            ...(hasExplicitMedia ? { media } : {}),
          };
        });
        const mirrored = await mirrorCalendarSlot(scheduleId, {
          targets,
          caption: nextDetail.caption,
        });
        mirroredCreated = mirrored.created;
        if (mirroredCreated.length === 0) {
          toast({
            tone: "error",
            title:
              "No additional schedules were created. Check the account times and try again.",
          });
        } else {
          const labels = mirroredCreated.map(
            (slot) => PLATFORM_LABELS[slot.platform] ?? slot.platform,
          );
          parts.push(`Also scheduled on ${labels.join(", ")}`);
          setDetailsByAccount((current) => {
            const next = { ...current };
            for (const slot of mirroredCreated) next[slot.accountId] = slot;
            return next;
          });
          setMediaByAccount((current) => {
            const next = { ...current };
            for (const slot of mirroredCreated) {
              if (slot.accountId in next) continue;
              next[slot.accountId] = slot.media.map((url) => ({
                assetId: null,
                externalUrl: url,
              }));
            }
            return next;
          });
        }
        setPendingTimes({});
      }

      if (captionChanged || mediaChanged || mirroredCreated.length > 0) {
        savedRef.current = true;
      }
      if (sourceDropped && mirroredCreated.length > 0) {
        await cancelCalendarSlot(scheduleId);
        parts.push("Original platform schedule canceled");
        const first = mirroredCreated[0]!;
        setDetail(first);
        setSelectedAccountIds([first.accountId]);
        setMediaByAccount({
          [first.accountId]: first.media.map((url) => ({
            assetId: null,
            externalUrl: url,
          })),
        });
        setRescheduleValue(toLocalInputValue(first.scheduledAt));
        router.replace(`/app/calendar?schedule=${encodeURIComponent(first.scheduleId)}`);
      }

      if (parts.length) {
        toast({ tone: "success", title: `${parts.join(". ")}.` });
      }
      onChanged?.();
    } catch (err) {
      toast({
        tone: "error",
        title: userFacingError(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function addImages(accountId: string, files: File[]) {
    if (!detail?.canEditContent) return;
    const account = accounts.find((row) => row.id === accountId);
    if (!account) return;
    const limits = platformImageLimits(account.platform);
    const existing = paneMediaFor(accountId);
    const room = Math.max(0, limits.max - existing.length);
    if (room === 0) return;

    const images = files.filter(isUploadableImageFile).slice(0, room);
    if (images.length === 0) {
      if (files.length > 0) {
        toast({
          tone: "error",
          title: userFacingError("UNSUPPORTED_MEDIA"),
        });
      }
      return;
    }
    setUploadingAccountId(accountId);
    try {
      const uploaded = await uploadImagesForSchedule(images);
      if (uploaded.length) {
        setMediaByAccount((current) => {
          const prior = paneMediaFor(accountId, current);
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

  function removeImage(accountId: string, index: number) {
    setMediaByAccount((current) => {
      const items = [...paneMediaFor(accountId, current)];
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
    // Keep at least one account selected so Save never targets an empty set.
    const unique = Array.from(new Set(nextIds));
    if (unique.length === 0) return;
    setSelectedAccountIds(unique);
    setPendingTimes((current) => {
      const next: Record<string, string> = {};
      for (const accountId of unique) {
        if (accountId in detailsByAccount) continue;
        next[accountId] =
          current[accountId] ??
          defaultPendingLocalTime(
            rescheduleValue,
            toLocalInputValue(detail.scheduledAt),
          );
      }
      return next;
    });
    const nextMedia: Record<string, ModalMediaItem[]> = {};
    const keptAssetIds = new Set<string>();
    const removedMedia: ModalMediaItem[] = [];
    for (const accountId of unique) {
      const hasExplicitMedia = accountId in mediaByAccount;
      if (!hasExplicitMedia && accountId !== detail.accountId) continue;
      const items = paneMediaFor(accountId);
      nextMedia[accountId] = items;
      for (const item of items) {
        if (item.assetId) keptAssetIds.add(item.assetId);
      }
    }
    for (const [accountId, items] of Object.entries(mediaByAccount)) {
      if (!unique.includes(accountId)) removedMedia.push(...items);
    }
    setMediaByAccount(nextMedia);
    cleanupRemovedMedia(removedMedia, flatMedia(nextMedia));
    setMediaPreviews((previews) => {
      const previewNext: Record<string, string> = {};
      for (const [assetId, url] of Object.entries(previews)) {
        if (keptAssetIds.has(assetId)) previewNext[assetId] = url;
        else if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
      return previewNext;
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
    const targetId = uploadTargetAccountId;
    if (targetId) void addImages(targetId, files);
    else if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const pendingAccountIds = Object.keys(pendingTimes).filter((accountId) =>
    selectedAccountIds.includes(accountId),
  );
  const sourceDropped = Boolean(
    detail && !selectedAccountIds.includes(detail.accountId),
  );
  const sourceMediaUrls = detail
    ? paneMediaFor(detail.accountId).map((item) => item.externalUrl)
    : [];
  const contentDirty =
    !!detail?.canEditContent &&
    (caption !== detail.caption ||
      JSON.stringify(sourceMediaUrls) !== JSON.stringify(detail.media));
  const mediaBlocked = selectedAccounts.some((accountRow) => {
    const count = paneMediaFor(accountRow.id).length;
    const limits = platformImageLimits(accountRow.platform);
    return count < limits.min || count > limits.max;
  });
  const pendingBlocked = pendingAccountIds.some((accountId) => {
    const local = pendingTimes[accountId];
    if (!local) return true;
    return !isFutureLocalInput(local);
  });
  const dirty =
    contentDirty || pendingAccountIds.length > 0 || sourceDropped;
  const canSave =
    !!detail?.canEditContent &&
    dirty &&
    !mediaBlocked &&
    !pendingBlocked &&
    !(sourceDropped && pendingAccountIds.length === 0) &&
    !busy &&
    !uploadingAccountId;
  const saveBlockedReason = !detail?.canEditContent
    ? null
    : !dirty
      ? null
      : sourceDropped && pendingAccountIds.length === 0
        ? "Choose another account before removing this schedule's original platform."
        : mediaBlocked
          ? selectedAccounts.some((accountRow) => {
              const count = paneMediaFor(accountRow.id).length;
              const limits = platformImageLimits(accountRow.platform);
              return count < limits.min;
            })
            ? "Add required images for each platform before saving."
            : "Too many images for one of the selected platforms."
          : pendingBlocked
            ? "Set a future time for each new account before saving."
            : null;

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
                      const paneMedia = paneMediaFor(accountRow.id);
                      const limits = platformImageLimits(platform);
                      const atMax = paneMedia.length >= limits.max;
                      const needsMin =
                        paneMedia.length < limits.min && limits.min > 0;
                      const uploadingHere =
                        uploadingAccountId === accountRow.id;
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
                            mediaItems={paneMedia.map((item) => ({
                              assetId: item.assetId,
                              externalUrl: item.externalUrl,
                            }))}
                            mediaPreviews={mediaPreviews}
                            avatarUrl={paneAvatar}
                            editable={isEditable}
                            onBodyChange={setCaption}
                            onBodySelect={isEditable ? syncSelection : undefined}
                          />
                          {isEditable ? (
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
                              {paneMedia.length > 0 ? (
                                <ul className="cal-modal-media-list">
                                  {paneMedia.map((item, index) => (
                                    <li
                                      key={`${item.assetId ?? item.externalUrl}-${index}`}
                                    >
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
                                        disabled={
                                          busy || Boolean(uploadingAccountId)
                                        }
                                        onClick={() =>
                                          removeImage(accountRow.id, index)
                                        }
                                      >
                                        <X
                                          className="size-3"
                                          aria-hidden="true"
                                        />
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                              {needsMin ? (
                                <p
                                  className="cal-modal-pending-hint"
                                  role="status"
                                >
                                  {PLATFORM_LABELS[platform]} needs at least{" "}
                                  {limits.min} image
                                  {limits.min === 1 ? "" : "s"} before you can
                                  save.
                                </p>
                              ) : null}
                              {!needsMin && paneMedia.length > 0 ? (
                                <p className="cal-modal-pane-media-meta">
                                  {paneMedia.length}/{limits.max} images
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          {isPending && detail.canEditContent ? (
                            <ScheduleTimeCollapse
                              accountLabel={accountRow.label}
                              value={pendingTimes[accountRow.id] ?? ""}
                              onChange={(next) =>
                                setPendingTimes((current) => ({
                                  ...current,
                                  [accountRow.id]: next,
                                }))
                              }
                              disabled={busy}
                              defaultOpen
                            >
                              {pendingTimes[accountRow.id] &&
                              !isFutureLocalInput(pendingTimes[accountRow.id]!) ? (
                                <p className="cal-modal-pending-hint" role="status">
                                  Pick a future time to save this account.
                                </p>
                              ) : null}
                            </ScheduleTimeCollapse>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {detail.canEditContent ? (
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      multiple
                      hidden
                      onChange={onFileChange}
                    />
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
                  <div className="cal-modal-footer-save">
                    {saveBlockedReason ? (
                      <p className="cal-modal-pending-hint" role="status">
                        {saveBlockedReason}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="cal-btn-primary"
                      disabled={!canSave}
                      onClick={() => void onSaveContent()}
                    >
                      Save changes
                    </button>
                  </div>
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
