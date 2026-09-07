"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowUp,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  PanelRightOpen,
  Paperclip,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  ApiError,
  apiRequest,
  createImageJob,
  liveActionLabel,
  STREAM_STEP_LABELS,
  STREAM_TOOL_LABELS,
  type IntentAnswer,
  type IntentQuestion,
  type ProposeImageJobSummary,
  type StreamEvent,
  type StreamStep,
} from "@/lib/product-api";
import { userFacingError } from "@/lib/user-facing-error";
import {
  LivePreviewAside,
  pickActiveReviewGroup,
} from "@/components/preview";
import { AppShell } from "./app-shell";
import {
  BrandAssetPicker,
  SlashCommandMenu,
  applySlashCommand,
  detectBrandAssetSlash,
  detectSlashQuery,
  matchingSlashCommands,
  stripBrandAssetSlash,
} from "./brand-asset-picker";
import { ImageProposalStrip } from "./image-proposal-strip";
import { ThinkingOrb } from "./thinking-orb";
import { IntentQuestionsCarousel } from "./intent-questions-carousel";
import { MessageMarkdown } from "./message-markdown";
import { productMotion } from "./product-motion-provider";
import { PublishingModeControl } from "./publishing-mode-control";
import { useToast } from "./toast-provider";
import { useWorkspace } from "./workspace-provider";

const starterPrompts = [
  "Which social accounts are connected?",
  "Validate a Threads post about a product launch",
  "Create a safe Instagram caption preview",
];

type SelectedMedia = {
  key: string;
  file: File;
  previewUrl: string;
  assetId: string | null;
  status: "uploading" | "ready" | "error";
  progress: number;
  generated?: boolean;
};

type PendingIntentClarify = {
  message: string;
  mediaAssetIds: string[];
  questions: IntentQuestion[];
};

function ActionLabel({
  label,
  live = false,
}: {
  label: string;
  live?: boolean;
}) {
  return (
    <div className={`action-label${live ? " action-label-live" : ""}`}>
      <span className="action-label-row" aria-label={label}>
        {live ? (
          <ThinkingOrb />
        ) : (
          <ChevronRight className="action-label-chevron size-3.5" aria-hidden="true" />
        )}
        <span className="action-label-text">{label}</span>
      </span>
    </div>
  );
}

export function ChatWorkspace({
  conversationId,
}: {
  conversationId: string | null;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { toast } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const transcriptEndRef = useRef<HTMLSpanElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const suppressEmptyNewRedirectRef = useRef(false);
  const [message, setMessage] = useState("");
  const [optimisticMessage, setOptimisticMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [liveStep, setLiveStep] = useState<StreamStep | null>(null);
  const [liveToolName, setLiveToolName] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<PendingIntentClarify | null>(
    null,
  );
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia[]>([]);
  const [optimisticMedia, setOptimisticMedia] = useState<SelectedMedia[]>([]);
  const [previewDismissed, setPreviewDismissed] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [selectedBrandAssetIds, setSelectedBrandAssetIds] = useState<string[]>(
    [],
  );
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [localImageProposal, setLocalImageProposal] =
    useState<ProposeImageJobSummary | null>(null);
  const [promptEditAssetId, setPromptEditAssetId] = useState<string | null>(
    null,
  );
  const [imageEditBusy, setImageEditBusy] = useState<{
    assetId: string;
    kind: "reframe" | "vary" | "prompt_edit";
  } | null>(null);
  const proposalStripRef = useRef<HTMLDivElement>(null);
  const [previewAttachRequest, setPreviewAttachRequest] = useState<{
    assetId: string;
    previewUrl: string;
  } | null>(null);
  const {
    details,
    pending,
    errors,
    retries,
    pendingLaunch,
    launchOptimistic,
    liveStep: workspaceLiveStep,
    liveToolName: workspaceLiveToolName,
    takePendingLaunch,
    clearLaunchOptimistic,
    loadConversation,
    sendMessage,
    deleteConversation,
  } = useWorkspace();
  const isLaunchRoute = conversationId === "new";
  const activeConversationId = isLaunchRoute ? null : conversationId;
  const key = activeConversationId ?? "new";
  const detail = activeConversationId ? details[activeConversationId] : null;
  const isPending = Boolean(pending[key]) || submitting;
  const activeLiveStep = liveStep ?? workspaceLiveStep;
  const activeLiveTool = liveToolName ?? workspaceLiveToolName;
  const mediaBlocked = selectedMedia.some((item) => item.status !== "ready");
  const displayOptimisticMessage =
    optimisticMessage ?? (isLaunchRoute ? launchOptimistic?.message ?? null : null);
  const displayOptimisticMedia =
    optimisticMedia.length > 0
      ? optimisticMedia
      : isLaunchRoute
        ? (launchOptimistic?.optimisticMedia ?? []).map((item) => ({
            key: item.key,
            file: new File([], item.fileName),
            previewUrl: item.previewUrl,
            assetId: null,
            status: "ready" as const,
            progress: 100,
          }))
        : [];
  const activityByAssistantId = new Map(
    (detail?.turnActivities ?? []).map((activity) => [
      activity.assistantMessageId,
      activity,
    ]),
  );
  const stepByAssistantId = new Map(
    (detail?.turnActivities ?? []).map((activity) => {
      const run = detail?.runs.find((item) => item.id === activity.runId);
      const label =
        activity.toolSummaries.some((tool) => tool.toolName === "schedule_post")
          ? STREAM_TOOL_LABELS.schedule_post
          : run?.explicitLiveIntent
            ? STREAM_STEP_LABELS.publishing
            : activity.toolSummaries.some(
                  (tool) => tool.toolName === "propose_image_job",
                )
              ? STREAM_TOOL_LABELS.propose_image_job
              : activity.toolSummaries.some(
                    (tool) => tool.toolName === "prepare_review",
                  )
                ? STREAM_TOOL_LABELS.prepare_review
                : STREAM_STEP_LABELS.checking_intent;
      return [activity.assistantMessageId, label] as const;
    }),
  );
  const mediaPreviews = Object.fromEntries(
    (detail?.messages ?? []).flatMap((item) =>
      (item.attachments ?? []).map((attachment) => [attachment.id, attachment.previewUrl]),
    ),
  );
  const activeReviewGroup = detail
    ? pickActiveReviewGroup(
        (detail.turnActivities ?? []).flatMap(
          (activity) => activity.reviewGroups ?? [],
        ),
      ) ??
      pickActiveReviewGroup(detail.reviewGroups ?? [])
    : null;
  const previewVisible = Boolean(activeReviewGroup && !previewDismissed);

  useEffect(() => {
    if (activeConversationId && !detail) {
      void loadConversation(activeConversationId);
    }
  }, [activeConversationId, detail, loadConversation]);

  useEffect(() => {
    if (activeConversationId) {
      setOptimisticMessage(null);
      setOptimisticMedia([]);
    }
  }, [activeConversationId]);

  useEffect(() => {
    setPreviewDismissed(false);
  }, [activeReviewGroup?.id]);

  useEffect(() => {
    if (!isLaunchRoute) {
      suppressEmptyNewRedirectRef.current = false;
      return;
    }
    const launch = takePendingLaunch();
    if (launch) {
      suppressEmptyNewRedirectRef.current = true;
      setOptimisticMessage(launch.message);
      setOptimisticMedia(
        launch.optimisticMedia.map((item) => ({
          key: item.key,
          file: new File([], item.fileName),
          previewUrl: item.previewUrl,
          assetId: null,
          status: "ready" as const,
          progress: 100,
        })),
      );
      void submit(launch.message, undefined, launch.mediaAssetIds);
      return;
    }
    if (suppressEmptyNewRedirectRef.current) return;
    if (
      !pendingLaunch &&
      !launchOptimistic &&
      !pending.new &&
      !optimisticMessage &&
      !submitting
    ) {
      router.replace("/app/workspace");
    }
    // One shot launch from the welcome composer; submit closes over current media gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isLaunchRoute,
    pendingLaunch,
    launchOptimistic,
    takePendingLaunch,
    pending.new,
    optimisticMessage,
    submitting,
    router,
  ]);

  useEffect(() => {
    if (!displayOptimisticMessage) return;
    const frame = window.requestAnimationFrame(() => {
      transcriptEndRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "end",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [displayOptimisticMessage, reduceMotion]);

  useEffect(() => {
    if (!promptEditAssetId) return;
    composerInputRef.current?.focus();
  }, [promptEditAssetId]);

  useEffect(() => {
    if (!localImageProposal?.jobId) return;
    proposalStripRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }, [localImageProposal?.jobId, reduceMotion]);

  async function submit(
    text: string,
    retry = retries[key] ?? undefined,
    launchMediaAssetIds?: string[],
    intentAnswers?: IntentAnswer[],
  ) {
    const clean = text.trim();
    if (!clean || isPending || (!retry && !launchMediaAssetIds && !intentAnswers && mediaBlocked)) {
      return;
    }
    setMessage("");
    setOptimisticMessage(clean);
    const outgoingMedia =
      launchMediaAssetIds || intentAnswers ? [] : selectedMedia;
    if (!launchMediaAssetIds && !intentAnswers) {
      setOptimisticMedia(outgoingMedia);
      setSelectedMedia([]);
      setPromptEditAssetId(null);
    }
    setSubmitting(true);
    setLiveStep("understanding");
    setLiveToolName(null);
    if (!intentAnswers) {
      setPendingIntent(null);
    }
    const pendingMessage = clean;
    const mediaAssetIds =
      launchMediaAssetIds ??
      (intentAnswers
        ? (pendingIntent?.mediaAssetIds ?? [])
        : outgoingMedia.flatMap((item) => (item.assetId ? [item.assetId] : [])));
    const onStreamEvent = (event: StreamEvent) => {
      if (event.type === "step_started" && event.step) {
        setLiveStep(event.step);
      }
      if (
        event.type === "tool_started" &&
        event.toolName &&
        STREAM_TOOL_LABELS[event.toolName]
      ) {
        setLiveToolName(event.toolName);
      }
      if (event.type === "intent_questions" && event.questions?.length) {
        setPendingIntent({
          message: pendingMessage,
          mediaAssetIds,
          questions: event.questions,
        });
      }
      if (
        event.type === "turn_completed" &&
        event.result?.intentQuestions?.length
      ) {
        setPendingIntent({
          message: pendingMessage,
          mediaAssetIds,
          questions: event.result.intentQuestions,
        });
      }
    };
    try {
      if (!activeConversationId) {
        suppressEmptyNewRedirectRef.current = true;
      }
      const createdId = intentAnswers?.length
        ? await sendMessage(
            activeConversationId,
            clean,
            retry ?? undefined,
            mediaAssetIds,
            onStreamEvent,
            intentAnswers,
          )
        : await sendMessage(
            activeConversationId,
            clean,
            retry ?? undefined,
            mediaAssetIds,
            onStreamEvent,
          );
      if (createdId && !intentAnswers) {
        outgoingMedia.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      } else if (!launchMediaAssetIds && !intentAnswers) {
        setSelectedMedia(outgoingMedia);
      }
      if (activeConversationId && createdId) {
        setOptimisticMessage(null);
        setOptimisticMedia([]);
      }
      if (!activeConversationId && createdId) {
        setOptimisticMessage(null);
        setOptimisticMedia([]);
        clearLaunchOptimistic();
        router.replace(`/app/chat/${createdId}`);
      }
    } finally {
      setSubmitting(false);
      setLiveStep(null);
      setLiveToolName(null);
    }
  }

  async function completeIntentAnswers(answers: IntentAnswer[]) {
    if (!pendingIntent) return;
    const { message: pendingMessage, mediaAssetIds } = pendingIntent;
    setPendingIntent(null);
    await submit(pendingMessage, undefined, mediaAssetIds, answers);
  }

  async function uploadFiles(files: File[]) {
    if (isPending) return;
    const accepted = files.slice(0, Math.max(0, 5 - selectedMedia.length));
    if (accepted.length === 0) return;
    const pendingItems = accepted.map((file) => ({
      key: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      assetId: null,
      status: "uploading" as const,
      progress: 10,
    }));
    setSelectedMedia((current) => [...current, ...pendingItems]);
    try {
      const tickets = await apiRequest<{
        uploads: Array<{ assetId: string; uploadUrl: string }>;
      }>("/media/uploads", {
        method: "POST",
        headers: { "X-Sochestral-Request": "publishing-action" },
        body: JSON.stringify({
          files: accepted.map((file) => ({
            name: file.name,
            mimeType: file.type,
            byteSize: file.size,
          })),
        }),
      });
      await Promise.all(
        pendingItems.map(async (item, index) => {
          const ticket = tickets.uploads[index];
          if (!ticket) throw new Error("Missing upload ticket");
          setSelectedMedia((current) => current.map((entry) =>
            entry.key === item.key ? { ...entry, assetId: ticket.assetId, progress: 45 } : entry,
          ));
          const uploaded = await fetch(ticket.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": item.file.type },
            body: item.file,
          });
          if (!uploaded.ok) throw new Error("Upload failed");
          setSelectedMedia((current) => current.map((entry) =>
            entry.key === item.key ? { ...entry, progress: 80 } : entry,
          ));
          await apiRequest(`/media/uploads/${ticket.assetId}/complete`, {
            method: "POST",
            headers: { "X-Sochestral-Request": "publishing-action" },
            body: "{}",
          });
          setSelectedMedia((current) => current.map((entry) =>
            entry.key === item.key
              ? { ...entry, assetId: ticket.assetId, status: "ready", progress: 100 }
              : entry,
          ));
        }),
      );
    } catch {
      setSelectedMedia((current) => current.map((entry) =>
        pendingItems.some((item) => item.key === entry.key) && entry.status !== "ready"
          ? { ...entry, status: "error", progress: 0 }
          : entry,
      ));
    }
  }

  async function removeMedia(item: SelectedMedia) {
    if (item.assetId && !item.generated) {
      await apiRequest(`/media/uploads/${item.assetId}`, {
        method: "DELETE",
        headers: { "X-Sochestral-Request": "publishing-action" },
      }).catch(() => undefined);
    }
    URL.revokeObjectURL(item.previewUrl);
    if (item.assetId && item.assetId === promptEditAssetId) {
      setPromptEditAssetId(null);
    }
    setSelectedMedia((current) => current.filter((entry) => entry.key !== item.key));
  }

  function cancelPromptEdit() {
    setPromptEditAssetId(null);
  }

  const composerTools = (
    <>
      {selectedMedia.length ? (
        <ul className="composer-media" aria-label="Selected images">
          {selectedMedia.map((item) => (
            <li key={item.key}>
              <div
                className={
                  promptEditAssetId && promptEditAssetId === item.assetId
                    ? "composer-media-card is-editing"
                    : "composer-media-card"
                }
              >
                <div className="composer-media-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.previewUrl} alt={`Selected upload ${item.file.name}`} />
                  {item.status === "uploading" ? (
                    <progress value={item.progress} max={100} aria-label={`Uploading ${item.file.name}`} />
                  ) : null}
                  <button
                    type="button"
                    className="composer-media-remove"
                    onClick={() => void removeMedia(item)}
                    aria-label={`Remove ${item.file.name}`}
                    disabled={isPending}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
                {item.status === "error" ? (
                  <button
                    type="button"
                    className="composer-media-retry"
                    onClick={() => {
                      void removeMedia(item).then(() => uploadFiles([item.file]));
                    }}
                  >
                    Retry
                  </button>
                ) : null}
                {promptEditAssetId && promptEditAssetId === item.assetId ? (
                  <div className="composer-media-editing">
                    <div className="composer-media-status">
                      <strong>Adjust</strong>
                      <span>Type the change below, then send.</span>
                    </div>
                    <button type="button" onClick={cancelPromptEdit}>
                      Cancel
                    </button>
                  </div>
                ) : item.status === "ready" && item.assetId ? (
                  <div className="composer-media-actions">
                    <button
                      type="button"
                      disabled={isPending || Boolean(imageEditBusy)}
                      aria-busy={
                        imageEditBusy?.assetId === item.assetId &&
                        imageEditBusy.kind === "reframe"
                      }
                      onClick={() => startImageEdit("reframe", item.assetId!)}
                    >
                      {imageEditBusy?.assetId === item.assetId &&
                      imageEditBusy.kind === "reframe" ? (
                        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : null}
                      Reframe
                    </button>
                    <button
                      type="button"
                      disabled={isPending || Boolean(imageEditBusy)}
                      aria-busy={
                        imageEditBusy?.assetId === item.assetId &&
                        imageEditBusy.kind === "vary"
                      }
                      onClick={() => startImageEdit("vary", item.assetId!)}
                    >
                      {imageEditBusy?.assetId === item.assetId &&
                      imageEditBusy.kind === "vary" ? (
                        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : null}
                      Vary
                    </button>
                    <button
                      type="button"
                      disabled={isPending || Boolean(imageEditBusy)}
                      onClick={() => {
                        setPromptEditAssetId(item.assetId);
                        setMessage("");
                      }}
                    >
                      Adjust
                    </button>
                  </div>
                ) : null}
                {imageEditBusy?.assetId === item.assetId ? (
                  <p className="composer-media-hint" role="status">
                    {imageEditBusy.kind === "reframe"
                      ? "Setting up a reframe…"
                      : imageEditBusy.kind === "vary"
                        ? "Setting up a variation…"
                        : "Setting up your edit…"}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="composer-controls">
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(event) => {
            void uploadFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <motion.button
          type="button"
          className="composer-attach"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending || selectedMedia.length >= 5}
          aria-label="Attach images"
          whileHover={
            reduceMotion || isPending || selectedMedia.length >= 5
              ? undefined
              : { y: -1, scale: 1.02 }
          }
          whileTap={
            reduceMotion || isPending || selectedMedia.length >= 5
              ? undefined
              : { scale: 0.95 }
          }
          transition={productMotion.press}
        >
          <Paperclip aria-hidden="true" />
          <span>{selectedMedia.length ? `${selectedMedia.length}/5` : "Attach"}</span>
        </motion.button>
        <PublishingModeControl source="composer" compact disabled={isPending} />
      </div>
    </>
  );

  function onComposerMessageChange(value: string) {
    setMessage(value);
    setSlashDismissed(false);
    if (detectBrandAssetSlash(value)) {
      setBrandPickerOpen(true);
    }
  }

  function selectSlashCommand(token: string) {
    onComposerMessageChange(applySlashCommand(message, token));
  }

  const slashQuery = detectSlashQuery(message);
  const slashCommands = slashQuery
    ? matchingSlashCommands(slashQuery.query)
    : [];
  const showSlashMenu =
    !slashDismissed &&
    !brandPickerOpen &&
    !promptEditAssetId &&
    slashCommands.length > 0 &&
    !detectBrandAssetSlash(message);

  function submitPromptEdit() {
    if (!promptEditAssetId || !message.trim() || isPending) return;
    startImageEdit("prompt_edit", promptEditAssetId, message.trim());
    setMessage("");
  }

  function outgoingComposerMessage() {
    const text = stripBrandAssetSlash(message).trim();
    if (
      (brandPickerOpen || selectedBrandAssetIds.length > 0) &&
      text &&
      !/\buse my brand\b/i.test(text)
    ) {
      return `${text}\nUse my brand.`;
    }
    return text;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (promptEditAssetId) {
      submitPromptEdit();
      return;
    }
    if (showSlashMenu && slashCommands[0]) {
      selectSlashCommand(slashCommands[0].token);
      return;
    }
    void submit(outgoingComposerMessage());
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      if (promptEditAssetId) {
        event.preventDefault();
        cancelPromptEdit();
        return;
      }
      if (showSlashMenu || brandPickerOpen) {
        event.preventDefault();
        setSlashDismissed(true);
        setBrandPickerOpen(false);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (promptEditAssetId) {
        submitPromptEdit();
        return;
      }
      if (showSlashMenu && slashCommands[0]) {
        selectSlashCommand(slashCommands[0].token);
        return;
      }
      void submit(outgoingComposerMessage());
    }
  }

  function attachGeneratedImage(assetId: string, previewUrl: string) {
    setSelectedMedia((current) => {
      if (current.length >= 5) return current;
      if (current.some((entry) => entry.assetId === assetId)) {
        return current;
      }
      return [
        ...current,
        {
          key: `gen_${assetId}`,
          file: new File([], "generated.png"),
          previewUrl,
          assetId,
          status: "ready",
          progress: 100,
          generated: true,
        },
      ];
    });
    setPreviewAttachRequest({ assetId, previewUrl });
    toast({
      tone: "success",
      title: "Image attached",
    });
  }

  function startImageEdit(
    kind: "reframe" | "vary" | "prompt_edit",
    assetId: string,
    prompt?: string,
  ) {
    setImageEditBusy({ assetId, kind });
    void createImageJob({
      kind,
      prompt:
        kind === "vary"
          ? "Create a close variation of this image."
          : kind === "prompt_edit"
            ? prompt?.trim() || undefined
            : undefined,
      sourceMediaAssetId: assetId,
      sizePreset: "portrait_4_5",
      conversationId: activeConversationId ?? undefined,
      inputs:
        kind === "reframe"
          ? selectedBrandAssetIds.map((brandAssetId) => ({
              brandAssetId,
              role: "brand" as const,
            }))
          : undefined,
    })
      .then((result) => {
        setLocalImageProposal({
          ok: true,
          jobId: result.job.id,
          status: result.job.status,
          kind: result.job.kind,
          sizePreset: result.job.sizePreset,
          creditsCharged: result.job.creditsCharged,
          estimatedCostCents: result.job.estimatedCostCents,
          needsConfirm: true,
        });
        setPromptEditAssetId(null);
        setMessage("");
      })
      .catch((err) => {
        toast({
          tone: "error",
          title: `Could not start ${kind === "prompt_edit" ? "adjust" : kind}`,
          description: userFacingError(err, {
            fallback: "That image is no longer available. Generate it again.",
          }),
        });
      })
      .finally(() => {
        setImageEditBusy((current) =>
          current?.assetId === assetId && current.kind === kind ? null : current,
        );
      });
  }

  async function confirmDelete() {
    if (!activeConversationId) return;
    setDeleteError(null);
    try {
      await deleteConversation(activeConversationId);
      dialogRef.current?.close();
      router.push("/app/workspace");
    } catch (error) {
      dialogRef.current?.close();
      const messageText = userFacingError(error, {
        fallback: "This conversation could not be deleted right now.",
      });
      setDeleteError(messageText);
      const busy =
        error instanceof ApiError && error.code === "RUN_IN_PROGRESS";
      toast({ tone: busy ? "info" : "error", title: messageText });
    }
  }

  const showThread = Boolean(
    activeConversationId || displayOptimisticMessage || isLaunchRoute,
  );

  return (
    <AppShell
      title={
        activeConversationId
          ? detail?.conversation.title ?? "Conversation"
          : displayOptimisticMessage
            ? "New chat"
            : undefined
      }
      actions={
        activeConversationId ? (
          <button
            type="button"
            className="delete-chat"
            onClick={() => dialogRef.current?.showModal()}
            aria-label="Delete this conversation"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        ) : undefined
      }
    >
      <div
        className={`chat-with-preview${previewVisible ? " chat-with-preview-open" : ""}`}
      >
      <section
        className={`chat-surface os-chat-thread ${showThread ? "" : "chat-surface-empty"}`}
        aria-label="Conversation"
      >
        <div className="transcript" aria-live="polite">
          {!showThread ? (
            <div className="chat-empty os-chat-empty">
              <p className="chat-kicker">AI Workspace</p>
              <h1>Continue in a focused conversation</h1>
              <p>
                Ask for a content idea, a channel check, or feedback on a post.
              </p>
              <div className="composer-slash-stack">
                <SlashCommandMenu
                  open={showSlashMenu}
                  commands={slashCommands}
                  onSelect={(command) => selectSlashCommand(command.token)}
                />
              <form
                onSubmit={onSubmit}
                className="composer composer-empty os-composer-inline"
                aria-busy={isPending}
              >
                <label htmlFor="chat-message" className="sr-only">
                  Message Sochestral
                </label>
                <textarea
                  id="chat-message"
                  ref={composerInputRef}
                  value={message}
                  onChange={(event) => onComposerMessageChange(event.target.value)}
                  onKeyDown={onComposerKeyDown}
                  maxLength={8000}
                  rows={2}
                  placeholder={
                    promptEditAssetId
                      ? "Describe the edit"
                      : isPending
                        ? "Sochestral is working…"
                        : "Ask Sochestral about your social content"
                  }
                  disabled={isPending}
                />
                {composerTools}
                <button
                  type="submit"
                  disabled={isPending || mediaBlocked || !message.trim()}
                  aria-label="Send message"
                >
                  <ArrowUp className="size-5" aria-hidden="true" />
                </button>
              </form>
                <BrandAssetPicker
                  open={brandPickerOpen}
                  selectedIds={selectedBrandAssetIds}
                  onToggle={(id) => {
                    setSelectedBrandAssetIds((current) =>
                      current.includes(id)
                        ? current.filter((item) => item !== id)
                        : [...current, id],
                    );
                  }}
                  onClose={() => setBrandPickerOpen(false)}
                />
                {localImageProposal?.needsConfirm ? (
                  <div ref={proposalStripRef}>
                    <ImageProposalStrip
                      summary={localImageProposal}
                      disabled={isPending}
                      onAttachResult={({ assetId, previewUrl }) => {
                        attachGeneratedImage(assetId, previewUrl);
                        setLocalImageProposal(null);
                      }}
                    />
                  </div>
                ) : null}
              </div>
              <ul className="starter-grid">
                {starterPrompts.map((prompt) => (
                  <li key={prompt}>
                    <button
                      type="button"
                      onClick={() => void submit(prompt)}
                      disabled={isPending}
                    >
                      {prompt}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : activeConversationId && !detail && !displayOptimisticMessage ? (
            <div className="chat-state" role="status">
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              Loading conversation
            </div>
          ) : (
            <>
              {activeConversationId && detail?.nextCursor ? (
                <button
                  type="button"
                  className="load-history"
                  onClick={() => void loadConversation(activeConversationId, true)}
                >
                  Load older messages
                </button>
              ) : null}
              <ol className="message-list">
                {(detail?.messages ?? []).map((item, index) => {
                  const activity = activityByAssistantId.get(item.id);
                  return (
                    <motion.li
                      key={item.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        ...productMotion.enter,
                        delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.1),
                      }}
                      className={`message message-${item.role}`}
                    >
                      <span className="message-author">
                        {item.role === "user" ? "You" : "Sochestral"}
                      </span>
                      {item.role === "assistant" ? (
                        <>
                          <MessageMarkdown content={item.content} />
                          {activity?.toolSummaries.some(
                            (tool) =>
                              tool.toolName === "schedule_post" &&
                              (tool.summary as { ok?: boolean } | undefined)?.ok ===
                                true,
                          ) ? (
                            <p className="schedule-success-links">
                              Scheduled.{" "}
                              <Link href="/app/calendar">Open calendar</Link>
                              {" · "}
                              <Link href="/app/scheduled">Scheduled posts</Link>
                            </p>
                          ) : null}
                          {activity ? (
                            <motion.section
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={productMotion.enter}
                              className="activity-stack"
                              aria-label="Action"
                            >
                              <ActionLabel
                                label={stepByAssistantId.get(item.id) ?? STREAM_STEP_LABELS.checking_intent}
                              />
                              {!pendingIntent
                                ? activity.toolSummaries
                                    .filter(
                                      (tool) =>
                                        tool.toolName === "propose_image_job" &&
                                        (tool.summary as ProposeImageJobSummary | null)
                                          ?.needsConfirm,
                                    )
                                    .map((tool) => {
                                      const requestMessage = (
                                        detail?.messages ?? []
                                      ).find(
                                        (message) =>
                                          message.id === activity.requestMessageId,
                                      );
                                      return (
                                      <ImageProposalStrip
                                        key={tool.id}
                                        summary={
                                          (tool.summary ??
                                            {}) as ProposeImageJobSummary
                                        }
                                        fallbackSourceMediaAssetId={
                                          requestMessage?.attachments?.[0]?.id ??
                                          null
                                        }
                                        disabled={isPending}
                                        onAttachResult={({ assetId, previewUrl }) => {
                                          attachGeneratedImage(assetId, previewUrl);
                                        }}
                                      />
                                      );
                                    })
                                : null}
                            </motion.section>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {item.attachments?.length ? (
                            <ul className="message-attachments">
                              {item.attachments.map((attachment) => (
                                <li key={attachment.id}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={attachment.previewUrl} alt="Attached social post image" />
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          <p>{item.content}</p>
                        </>
                      )}
                    </motion.li>
                  );
                })}
                {displayOptimisticMessage ? (
                  <motion.li
                    key="optimistic-user-message"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={productMotion.enter}
                    className="message message-user message-optimistic"
                  >
                    <span className="message-author">You</span>
                    {displayOptimisticMedia.length ? (
                      <ul className="message-attachments">
                        {displayOptimisticMedia.map((item) => (
                          <li key={item.key}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.previewUrl} alt={`Attached ${item.file.name}`} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p>{displayOptimisticMessage}</p>
                  </motion.li>
                ) : null}
                {isPending ? (
                  <motion.li
                    key="assistant-working"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={productMotion.enter}
                    className="message message-assistant message-working"
                    role="status"
                    aria-label="Sochestral is working"
                  >
                    <span className="message-author">Sochestral</span>
                    <ActionLabel
                      label={liveActionLabel(activeLiveStep, activeLiveTool)}
                      live
                    />
                  </motion.li>
                ) : null}
              </ol>
            </>
          )}
          <AnimatePresence initial={false}>
            {(errors[key] || deleteError) && !isPending ? (
              <motion.div
                key={`error-${key}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={productMotion.enter}
                className="chat-error"
                role="alert"
              >
                <CircleAlert className="size-5" aria-hidden="true" />
                <span>{deleteError ?? errors[key]}</span>
                {retries[key] && !deleteError ? (
                  <button
                    type="button"
                    onClick={() =>
                      void submit(retries[key]!.message, retries[key]!)
                    }
                  >
                    <RefreshCw className="size-4" aria-hidden="true" />
                    Try again
                  </button>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
          <span
            ref={transcriptEndRef}
            className="transcript-end"
            aria-hidden="true"
          />
        </div>

        {showThread ? (
          <div className="composer-zone">
            {activeReviewGroup && previewDismissed ? (
              <button
                type="button"
                className="live-preview-reopen"
                onClick={() => setPreviewDismissed(false)}
              >
                <PanelRightOpen className="size-4" aria-hidden="true" />
                Show preview
              </button>
            ) : null}
            {pendingIntent ? (
              <IntentQuestionsCarousel
                questions={pendingIntent.questions}
                disabled={isPending}
                onComplete={(answers) => {
                  void completeIntentAnswers(answers);
                }}
              />
            ) : null}
            <SlashCommandMenu
              open={showSlashMenu}
              commands={slashCommands}
              onSelect={(command) => selectSlashCommand(command.token)}
            />
            <BrandAssetPicker
              open={brandPickerOpen}
              selectedIds={selectedBrandAssetIds}
              onToggle={(id) => {
                setSelectedBrandAssetIds((current) =>
                  current.includes(id)
                    ? current.filter((item) => item !== id)
                    : [...current, id],
                );
              }}
              onClose={() => setBrandPickerOpen(false)}
            />
            {localImageProposal?.needsConfirm && !pendingIntent ? (
              <div ref={proposalStripRef}>
                <ImageProposalStrip
                  summary={localImageProposal}
                  disabled={isPending}
                  onAttachResult={({ assetId, previewUrl }) => {
                    attachGeneratedImage(assetId, previewUrl);
                    setLocalImageProposal(null);
                  }}
                />
              </div>
            ) : null}
            <form
              onSubmit={onSubmit}
              className="composer"
              aria-busy={isPending}
            >
              <label htmlFor="chat-message" className="sr-only">
                Message Sochestral
              </label>
              <textarea
                id="chat-message"
                ref={composerInputRef}
                value={message}
                onChange={(event) => onComposerMessageChange(event.target.value)}
                onKeyDown={onComposerKeyDown}
                maxLength={8000}
                rows={1}
                placeholder={
                  promptEditAssetId
                    ? "Describe the edit"
                    : isPending
                      ? "Sochestral is working…"
                      : "Ask Sochestral about your social content"
                }
                disabled={isPending}
              />
              {composerTools}
              <button
                type="submit"
                disabled={isPending || mediaBlocked || !message.trim()}
                aria-label="Send message"
              >
                <ArrowUp className="size-5" aria-hidden="true" />
              </button>
            </form>
            <p>
              {isPending
                ? "Wait for Sochestral to finish this turn"
                : "Enter to send, Shift Enter for a new line"}
            </p>
          </div>
        ) : null}
      </section>

      {previewVisible && activeReviewGroup && activeConversationId ? (
        <LivePreviewAside
          group={activeReviewGroup}
          mediaPreviews={mediaPreviews}
          attachRequest={previewAttachRequest}
          onAttachRequestConsumed={() => setPreviewAttachRequest(null)}
          onRefresh={async () => {
            await loadConversation(activeConversationId);
          }}
          onClose={() => setPreviewDismissed(true)}
        />
      ) : null}
      </div>

      <dialog
        ref={dialogRef}
        className="confirm-dialog"
        aria-labelledby="delete-title"
        aria-describedby="delete-description"
      >
        <h2 id="delete-title">Delete this conversation?</h2>
        <p id="delete-description">
          This removes the chat and its safe activity history.
        </p>
        <div>
          <button type="button" onClick={() => dialogRef.current?.close()}>
            Keep it
          </button>
          <button type="button" onClick={() => void confirmDelete()}>
            Delete
          </button>
        </div>
      </dialog>
    </AppShell>
  );
}
