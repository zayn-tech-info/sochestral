"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  Mic,
  Paperclip,
  Share2,
  Slash,
  Sparkles,
  WandSparkles,
  Zap,
} from "lucide-react";

import { PublishingModeControl } from "@/components/app/publishing-mode-control";
import { useWorkspace } from "@/components/app/workspace-provider";
import { SelectChip } from "@/components/workspace/select-chip";
import { cn } from "@/lib/utils";

type ComposerCommandProps = {
  id?: string;
  className?: string;
  initialValue?: string;
  autoFocus?: boolean;
  placeholder?: string;
};

const platforms = [
  { value: "all", label: "All platforms" },
  { value: "threads", label: "Threads" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
] as const;

const voices = [
  { value: "workspace", label: "Workspace voice" },
  { value: "bold", label: "Bold" },
  { value: "warm", label: "Warm" },
  { value: "precise", label: "Precise" },
] as const;

const models = [
  {
    value: "auto",
    label: "Auto model",
    description: "Best default for most requests",
  },
  {
    value: "fast",
    label: "Fast",
    description: "Quicker drafts when you are iterating",
  },
  {
    value: "deep",
    label: "Deep",
    description: "Richer planning and longer answers",
  },
] as const;

export function ComposerCommand({
  id = "composer",
  className,
  initialValue = "",
  autoFocus = false,
  placeholder = "Ask Sochestral to plan, draft, or publish…",
}: ComposerCommandProps) {
  const router = useRouter();
  const { sendMessage, pending } = useWorkspace();
  const [message, setMessage] = useState(initialValue);
  const [platform, setPlatform] = useState<(typeof platforms)[number]["value"]>(
    "all",
  );
  const [voice, setVoice] = useState<(typeof voices)[number]["value"]>(
    "workspace",
  );
  const [model, setModel] = useState<(typeof models)[number]["value"]>("auto");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isPending = submitting || Boolean(pending.new);
  const isLanding = Boolean(className?.includes("os-composer-landing"));

  useEffect(() => {
    if (initialValue) setMessage(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (!autoFocus) return;
    textareaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, isLanding ? 160 : 220)}px`;
  }, [message, isLanding]);

  async function submit(text: string) {
    const clean = text.trim();
    if (!clean || isPending) return;
    setMessage("");
    setSubmitting(true);
    try {
      const createdId = await sendMessage(null, clean);
      if (createdId) {
        router.push(`/app/chat/${createdId}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(message);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit(message);
    }
  }

  return (
    <form
      id={id}
      className={cn("os-composer", className)}
      onSubmit={onSubmit}
      aria-label="AI composer"
    >
      {!isLanding ? (
        <div className="os-composer-controls" aria-label="Creation controls">
          <SelectChip
            label="Platform"
            icon={<Share2 className="size-3.5" />}
            value={platform}
            onChange={(value) => setPlatform(value as typeof platform)}
            disabled={isPending}
            options={platforms}
          />
          <SelectChip
            label="Brand voice"
            icon={<WandSparkles className="size-3.5" />}
            value={voice}
            onChange={(value) => setVoice(value as typeof voice)}
            disabled={isPending}
            title="Brand voice preference (local for now)"
            options={voices}
          />
          <SelectChip
            label="Model"
            icon={<Sparkles className="size-3.5" />}
            value={model}
            onChange={(value) => setModel(value as typeof model)}
            disabled={isPending}
            title="Model preference (local for now)"
            options={models}
          />
        </div>
      ) : null}

      <label htmlFor={`${id}-input`} className="sr-only">
        Message Sochestral
      </label>
      <textarea
        ref={textareaRef}
        id={`${id}-input`}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={onKeyDown}
        maxLength={8000}
        rows={isLanding ? 2 : 3}
        placeholder={placeholder}
        disabled={isPending}
      />
      <div className="os-composer-toolbar">
        <div className="os-composer-tools">
          <button
            type="button"
            className="os-tool-btn"
            disabled
            aria-disabled="true"
            title="Coming soon"
            aria-label="Attach (coming soon)"
          >
            <Paperclip className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="os-tool-btn"
            disabled
            aria-disabled="true"
            title="Coming soon"
            aria-label="Voice input (coming soon)"
          >
            <Mic className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="os-tool-btn"
            disabled
            aria-disabled="true"
            title="Coming soon"
            aria-label="Slash commands (coming soon)"
          >
            <Slash className="size-4" aria-hidden="true" />
          </button>
          {!isLanding ? (
            <PublishingModeControl source="composer" compact />
          ) : (
            <SelectChip
              className="os-select-chip-compact"
              label="Model"
              icon={<Zap className="size-3.5" />}
              value={model}
              onChange={(value) => setModel(value as typeof model)}
              disabled={isPending}
              title="Model preference (local for now)"
              options={models}
            />
          )}
        </div>
        <div className="os-composer-send-row">
          {!isLanding ? (
            <span className="os-char-count">{message.length}/8000</span>
          ) : null}
          <button
            type="submit"
            className={cn("os-generate-btn", isLanding && "os-generate-btn-icon")}
            disabled={isPending || !message.trim()}
            aria-label="Generate"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
            {isLanding ? null : "Generate"}
          </button>
        </div>
      </div>
    </form>
  );
}
