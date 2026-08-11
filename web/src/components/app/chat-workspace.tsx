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
  apiRequest,
  STREAM_STEP_LABELS,
  type IntentAnswer,
  type IntentQuestion,
  type StreamEvent,
  type StreamStep,
} from "@/lib/product-api";
import { userFacingError } from "@/lib/user-facing-error";
import {
  LivePreviewAside,
  pickActiveReviewGroup,
} from "@/components/preview";
import { AppShell } from "./app-shell";
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
        <ChevronRight className="action-label-chevron size-3.5" aria-hidden="true" />
        <span className="action-label-text">{label}</span>
        {live ? (
          <LoaderCircle className="action-label-spinner size-3.5 animate-spin" aria-hidden="true" />
        ) : null}
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
  const suppressEmptyNewRedirectRef = useRef(false);
  const [message, setMessage] = useState("");
  const [optimisticMessage, setOptimisticMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [liveStep, setLiveStep] = useState<StreamStep | null>(null);
  const [pendingIntent, setPendingIntent] = useState<PendingIntentClarify | null>(
    null,
  );
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia[]>([]);
  const [optimisticMedia, setOptimisticMedia] = useState<SelectedMedia[]>([]);
  const [previewDismissed, setPreviewDismissed] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const {
    details,
    pending,
    errors,
    retries,
    pendingLaunch,
    launchOptimistic,
    liveStep: workspaceLiveStep,
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
          ? STREAM_STEP_LABELS.scheduling
          : run?.explicitLiveIntent
            ? STREAM_STEP_LABELS.publishing
            : activity.toolSummaries.some((tool) => tool.toolName === "prepare_review")
              ? STREAM_STEP_LABELS.preparing_draft
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
    if (!launchMediaAssetIds && !intentAnswers) {
      setOptimisticMedia(selectedMedia);
    }
    setSubmitting(true);
    setLiveStep("understanding");
    if (!intentAnswers) {
      setPendingIntent(null);
    }
    const pendingMessage = clean;
    const mediaAssetIds =
      launchMediaAssetIds ??
      (intentAnswers
        ? (pendingIntent?.mediaAssetIds ?? [])
        : selectedMedia.flatMap((item) => (item.assetId ? [item.assetId] : [])));
    const onStreamEvent = (event: StreamEvent) => {
      if (event.type === "step_started" && event.step) {
        setLiveStep(event.step);
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
        selectedMedia.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        setSelectedMedia([]);
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
    if (item.assetId) {
      await apiRequest(`/media/uploads/${item.assetId}`, {
        method: "DELETE",
        headers: { "X-Sochestral-Request": "publishing-action" },
      }).catch(() => undefined);
    }
    URL.revokeObjectURL(item.previewUrl);
    setSelectedMedia((current) => current.filter((entry) => entry.key !== item.key));
  }

  const composerTools = (
    <>
      {selectedMedia.length ? (
        <ul className="composer-media" aria-label="Selected images">
          {selectedMedia.map((item) => (
            <li key={item.key}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.previewUrl} alt={`Selected upload ${item.file.name}`} />
              {item.status === "uploading" ? (
                <progress value={item.progress} max={100} aria-label={`Uploading ${item.file.name}`} />
              ) : item.status === "error" ? (
                <button type="button" onClick={() => {
                  void removeMedia(item).then(() => uploadFiles([item.file]));
                }}>Retry</button>
              ) : null}
              <button type="button" onClick={() => void removeMedia(item)} aria-label={`Remove ${item.file.name}`} disabled={isPending}>
                <Trash2 aria-hidden="true" />
              </button>
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

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(message);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit(message);
    }
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
      toast({ tone: "error", title: messageText });
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
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={onComposerKeyDown}
                  maxLength={8000}
                  rows={2}
                  placeholder={
                    isPending
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
                      label={
                        activeLiveStep
                          ? STREAM_STEP_LABELS[activeLiveStep]
                          : STREAM_STEP_LABELS.understanding
                      }
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
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={onComposerKeyDown}
                maxLength={8000}
                rows={1}
                placeholder={
                  isPending
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
