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
  RefreshCw,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { type ToolSummary } from "@/lib/product-api";
import { AppShell } from "./app-shell";
import { MessageMarkdown } from "./message-markdown";
import { productMotion } from "./product-motion-provider";
import { useWorkspace } from "./workspace-provider";

const starterPrompts = [
  "Which social accounts are connected?",
  "Validate a Threads post about a product launch",
  "Create a safe Instagram caption preview",
];

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
    <div className="activity-card activity-group">
      <button
        type="button"
        className="activity-summary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="activity-icon">
          {hasFailure ? (
            <CircleAlert className="size-4" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          )}
        </span>
        <span>
          <strong>Tool activity</strong>
          <small>
            {items.length} {items.length === 1 ? "action" : "actions"}
          </small>
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
  const [message, setMessage] = useState("");
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
  const isPending = Boolean(pending[key]);

  useEffect(() => {
    if (conversationId && !detail) {
      void loadConversation(conversationId);
    }
  }, [conversationId, detail, loadConversation]);

  async function submit(text: string, retry = retries[key] ?? undefined) {
    const clean = text.trim();
    if (!clean || isPending) return;
    setMessage("");
    const createdId = await sendMessage(conversationId, clean, retry ?? undefined);
    if (
      !conversationId &&
      createdId &&
      window.location.pathname === "/app"
    ) {
      router.push(`/app/chat/${createdId}`);
    }
  }

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
          {!conversationId ? (
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
                <button
                  type="submit"
                  disabled={isPending || !message.trim()}
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
          ) : !detail ? (
            <div className="chat-state" role="status">
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              Loading conversation
            </div>
          ) : (
            <>
              {detail.nextCursor ? (
                <button
                  type="button"
                  className="load-history"
                  onClick={() => void loadConversation(conversationId, true)}
                >
                  Load older messages
                </button>
              ) : null}
              <ol className="message-list">
                {detail.messages.map((item, index) => (
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
                      <MessageMarkdown content={item.content} />
                    ) : (
                      <p>{item.content}</p>
                    )}
                  </motion.li>
                ))}
              </ol>
              <AnimatePresence initial={false}>
                {detail.toolSummaries.length ? (
                  <motion.section
                    key="tool-activity"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={productMotion.enter}
                    className="activity-stack"
                    aria-labelledby="activity-title"
                  >
                    <h2 id="activity-title" className="sr-only">
                      Tool activity
                    </h2>
                    <ToolActivity items={detail.toolSummaries} />
                  </motion.section>
                ) : null}
              </AnimatePresence>
            </>
          )}
          <AnimatePresence initial={false}>
            {isPending ? (
              <motion.div
                key="working"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={productMotion.enter}
                className="working-state"
                role="status"
              >
                <span className="working-orb" />
                <span>
                  <strong>Sochestral is working</strong>
                  <small>Checking context and safe tools</small>
                </span>
              </motion.div>
            ) : null}
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
        </div>

        {conversationId ? (
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
              <button
                type="submit"
                disabled={isPending || !message.trim()}
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
