"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowUp,
  Paperclip,
  Share2,
  Sparkles,
  Trash2,
  WandSparkles,
  Zap,
} from "lucide-react";

import { PublishingModeControl } from "@/components/app/publishing-mode-control";
import { useWorkspace } from "@/components/app/workspace-provider";
import { SelectChip } from "@/components/workspace/select-chip";
import { apiRequest } from "@/lib/product-api";
import { cn } from "@/lib/utils";

type ComposerCommandProps = {
  id?: string;
  className?: string;
  initialValue?: string;
  autoFocus?: boolean;
  placeholder?: string;
};

type SelectedMedia = {
  key: string;
  file: File;
  previewUrl: string;
  assetId: string | null;
  status: "uploading" | "ready" | "error";
  progress: number;
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
  const { startNewChat, pending } = useWorkspace();
  const [message, setMessage] = useState(initialValue);
  const [platform, setPlatform] = useState<(typeof platforms)[number]["value"]>(
    "all",
  );
  const [voice, setVoice] = useState<(typeof voices)[number]["value"]>(
    "workspace",
  );
  const [model, setModel] = useState<(typeof models)[number]["value"]>("auto");
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isPending = submitting || Boolean(pending.new);
  const mediaBlocked = selectedMedia.some((item) => item.status !== "ready");
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
          setSelectedMedia((current) =>
            current.map((entry) =>
              entry.key === item.key
                ? { ...entry, assetId: ticket.assetId, progress: 45 }
                : entry,
            ),
          );
          const put = await fetch(ticket.uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": item.file.type },
            body: item.file,
          });
          if (!put.ok) throw new Error("Upload failed");
          await apiRequest(`/media/uploads/${ticket.assetId}/complete`, {
            method: "POST",
            headers: { "X-Sochestral-Request": "publishing-action" },
            body: "{}",
          });
          setSelectedMedia((current) =>
            current.map((entry) =>
              entry.key === item.key
                ? { ...entry, status: "ready", progress: 100 }
                : entry,
            ),
          );
        }),
      );
    } catch {
      setSelectedMedia((current) =>
        current.map((entry) =>
          pendingItems.some((item) => item.key === entry.key)
            ? { ...entry, status: "error", progress: 100 }
            : entry,
        ),
      );
    }
  }

  async function removeMedia(item: SelectedMedia) {
    if (item.assetId) {
      try {
        await apiRequest(`/media/uploads/${item.assetId}`, {
          method: "DELETE",
          headers: { "X-Sochestral-Request": "publishing-action" },
        });
      } catch {
        // Keep local removal so the composer stays usable.
      }
    }
    URL.revokeObjectURL(item.previewUrl);
    setSelectedMedia((current) =>
      current.filter((entry) => entry.key !== item.key),
    );
  }

  function submit(text: string) {
    const clean = text.trim();
    if (!clean || isPending || mediaBlocked) return;
    setSubmitting(true);
    const mediaAssetIds = selectedMedia.flatMap((item) =>
      item.assetId ? [item.assetId] : [],
    );
    const optimisticMedia = selectedMedia.map((item) => ({
      key: item.key,
      previewUrl: item.previewUrl,
      fileName: item.file.name,
    }));
    setMessage("");
    setSelectedMedia([]);
    startNewChat({
      message: clean,
      mediaAssetIds,
      optimisticMedia,
    });
    setSubmitting(false);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit(message);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit(message);
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

      {selectedMedia.length ? (
        <ul className="composer-media" aria-label="Selected images">
          {selectedMedia.map((item) => (
            <li key={item.key}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.previewUrl}
                alt={`Selected upload ${item.file.name}`}
              />
              {item.status === "uploading" ? (
                <progress
                  value={item.progress}
                  max={100}
                  aria-label={`Uploading ${item.file.name}`}
                />
              ) : item.status === "error" ? (
                <button
                  type="button"
                  onClick={() => {
                    void removeMedia(item).then(() =>
                      uploadFiles([item.file]),
                    );
                  }}
                >
                  Retry
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void removeMedia(item)}
                aria-label={`Remove ${item.file.name}`}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
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
            className="os-tool-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending || selectedMedia.length >= 5}
            aria-label={
              selectedMedia.length
                ? `Attach images, ${selectedMedia.length} of 5 selected`
                : "Attach images"
            }
            title="Attach images"
          >
            <Paperclip className="size-4" aria-hidden="true" />
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
            disabled={isPending || mediaBlocked || !message.trim()}
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
