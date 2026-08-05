"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Paperclip,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { apiRequest, type ToolSummary } from "@/lib/product-api";
import { AppShell } from "./app-shell";
import { MessageMarkdown } from "./message-markdown";
import { productMotion } from "./product-motion-provider";
import { ReviewGroup } from "./review-group";
import { PublishingModeControl } from "./publishing-mode-control";
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

function safeSummary(summary: Record<string, unknown> | null): string {
  if (!summary) return "No additional detail";
  return Object.entries(summary)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

function ToolActivity({ items }: { items: ToolSummary[] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const reduceMotion = useReducedMotion();
  const hasFailure = items.some((item) => item.status !== "succeeded");

  return (
    <div
      className={`activity-card activity-group${open ? " activity-card-open" : ""}`}
    >
      <button
        type="button"
        className="activity-summary"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Tool activity, ${items.length} ${items.length === 1 ? "action" : "actions"}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="activity-icon">
          {hasFailure ? (
            <CircleAlert className="size-4" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          )}
        </span>
        <span className="activity-label">
          {items.length} tool {items.length === 1 ? "action" : "actions"}
        </span>
        <ChevronRight className="activity-chevron size-4" aria-hidden="true" />
      </button>
      <motion.div
        id={panelId}
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        transition={reduceMotion ? { duration: 0 } : productMotion.quick}
        className="activity-disclosure"
        aria-hidden={!open}
      >
        <ul className="activity-items">
          {items.map((item) => (
            <li key={item.id}>
              <span>
                <strong>{item.toolName.replaceAll("_", " ")}</strong>
                <small>{item.status}</small>
              </span>
              <p>{safeSummary(item.summary)}</p>
            </li>
          ))}
        </ul>
      </motion.div>
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const transcriptEndRef = useRef<HTMLSpanElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [optimisticMessage, setOptimisticMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia[]>([]);
  const [optimisticMedia, setOptimisticMedia] = useState<SelectedMedia[]>([]);
  const {
    details,
    pending,
    errors,
    retries,
    loadConversation,
    sendMessage,
    deleteConversation,
  } = useWorkspace();
  const key = conversationId ?? "new";
  const detail = conversationId ? details[conversationId] : null;
  const isPending = Boolean(pending[key]) || submitting;
  const mediaBlocked = selectedMedia.some((item) => item.status !== "ready");
  const activityByAssistantId = new Map(
    (detail?.turnActivities ?? []).map((activity) => [
      activity.assistantMessageId,
      activity,
    ]),
  );
  const mediaPreviews = Object.fromEntries(
    (detail?.messages ?? []).flatMap((item) =>
      (item.attachments ?? []).map((attachment) => [attachment.id, attachment.previewUrl]),
    ),
  );
  const automaticReviewId = detail
    ? (detail.turnActivities ?? [])
        .flatMap((activity) => activity.reviewGroups ?? [])
        .reverse()
        .find((group) =>
          group.drafts.some((draft) => draft.status !== "published"),
        )?.id
    : undefined;

  useEffect(() => {
    if (conversationId && !detail) {
      void loadConversation(conversationId);
    }
  }, [conversationId, detail, loadConversation]);

  useEffect(() => {
    if (conversationId) setOptimisticMessage(null);
  }, [conversationId]);

  useEffect(() => {
    if (!optimisticMessage) return;
    const frame = window.requestAnimationFrame(() => {
      transcriptEndRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "end",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [optimisticMessage, reduceMotion]);

  async function submit(text: string, retry = retries[key] ?? undefined) {
    const clean = text.trim();
    if (!clean || isPending || (!retry && mediaBlocked)) return;
    setMessage("");
    setOptimisticMessage(clean);
    setOptimisticMedia(selectedMedia);
    setSubmitting(true);
    try {
      const mediaAssetIds = selectedMedia.flatMap((item) => item.assetId ? [item.assetId] : []);
      const createdId = mediaAssetIds.length > 0
        ? await sendMessage(conversationId, clean, retry ?? undefined, mediaAssetIds)
        : await sendMessage(conversationId, clean, retry ?? undefined);
      if (createdId) {
        selectedMedia.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        setSelectedMedia([]);
      }
      if (conversationId && createdId) {
        setOptimisticMessage(null);
        setOptimisticMedia([]);
      }
      if (
        !conversationId &&
        createdId &&
        window.location.pathname === "/app"
      ) {
        router.push(`/app/chat/${createdId}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadFiles(files: File[]) {
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
              <button type="button" onClick={() => void removeMedia(item)} aria-label={`Remove ${item.file.name}`}>
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
        <button
          type="button"
          className="composer-attach"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending || selectedMedia.length >= 5}
          aria-label="Attach images"
        >
          <Paperclip aria-hidden="true" />
          <span>{selectedMedia.length ? `${selectedMedia.length}/5` : "Attach"}</span>
        </button>
        <PublishingModeControl source="composer" compact />
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
    if (!conversationId || isPending) return;
    await deleteConversation(conversationId);
    dialogRef.current?.close();
    router.push("/app");
  }

  return (
    <AppShell
      title={
        conversationId ? detail?.conversation.title ?? "Conversation" : undefined
      }
      actions={
        conversationId ? (
          <button
            type="button"
            className="delete-chat"
            onClick={() => dialogRef.current?.showModal()}
            disabled={isPending}
            aria-label="Delete this conversation"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        ) : undefined
      }
    >
      <section
        className={`chat-surface ${conversationId ? "" : "chat-surface-empty"}`}
        aria-label="Conversation"
      >
        <div className="transcript" aria-live="polite">
          {!conversationId && !optimisticMessage ? (
            <div className="chat-empty">
              <p className="chat-kicker">New conversation</p>
              <h1>What are we creating today?</h1>
              <p>
                Ask for a content idea, a channel check, or feedback on a post.
              </p>
              <form onSubmit={onSubmit} className="composer composer-empty">
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
                  placeholder="Ask Sochestral about your social content"
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
                    <button type="button" onClick={() => void submit(prompt)}>
                      {prompt}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : conversationId && !detail ? (
            <div className="chat-state" role="status">
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              Loading conversation
            </div>
          ) : (
            <>
              {conversationId && detail?.nextCursor ? (
                <button
                  type="button"
                  className="load-history"
                  onClick={() => void loadConversation(conversationId, true)}
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
                          {activity?.toolSummaries.length ? (
                            <motion.section
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={productMotion.enter}
                              className="activity-stack"
                              aria-label="Tool activity"
                            >
                              <ToolActivity items={activity.toolSummaries} />
                            </motion.section>
                          ) : null}
                          {conversationId
                            ? activity?.reviewGroups.map((group) => (
                                <ReviewGroup
                                  key={group.id}
                                  group={group}
                                  autoOpen={group.id === automaticReviewId}
                                  mediaPreviews={mediaPreviews}
                                  onRefresh={() => loadConversation(conversationId)}
                                />
                              ))
                            : null}
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
                {optimisticMessage ? (
                  <motion.li
                    key="optimistic-user-message"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={productMotion.enter}
                    className="message message-user message-optimistic"
                  >
                    <span className="message-author">You</span>
                    {optimisticMedia.length ? (
                      <ul className="message-attachments">
                        {optimisticMedia.map((item) => (
                          <li key={item.key}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.previewUrl} alt={`Attached ${item.file.name}`} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p>{optimisticMessage}</p>
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
                    <span className="assistant-progress" aria-hidden="true">
                      <LoaderCircle className="animate-spin" />
                    </span>
                  </motion.li>
                ) : null}
              </ol>
            </>
          )}
          <AnimatePresence initial={false}>
            {errors[key] ? (
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
                <span>{errors[key]}</span>
                {retries[key] ? (
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

        {conversationId || optimisticMessage ? (
          <div className="composer-zone">
            <form onSubmit={onSubmit} className="composer">
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
                placeholder="Ask Sochestral about your social content"
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
            <p>Enter to send, Shift Enter for a new line</p>
          </div>
        ) : null}
      </section>

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
