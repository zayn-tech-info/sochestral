"use client";

import { Heart, MessageCircle, Repeat2, Send, MoreHorizontal } from "lucide-react";

import { PreviewAvatar } from "./preview-avatar";
import { ThreadsMediaStrip } from "./preview-media";
import {
  accountHandle,
  accountLabel,
  mediaSrc,
  type PlatformPreviewProps,
} from "./preview-shared";

export function ThreadsPreview({
  platform,
  body,
  mediaItems,
  mediaPreviews,
  account,
  locked,
  live,
  onBodyChange,
  avatarUrl,
  bodyRef,
  onBodySelect,
}: PlatformPreviewProps) {
  const label = account ? accountLabel(account) : "Connect an account";
  const handle = account ? accountHandle(account) : "connect";
  const images = mediaItems
    .map((item) => mediaSrc(item, mediaPreviews))
    .filter((src): src is string => Boolean(src));

  return (
    <article
      className={`platform-preview platform-preview-threads${live ? " platform-preview-live" : ""}`}
      aria-label="Threads post preview"
    >
      <header className="pp-threads-header">
        <PreviewAvatar
          platform={platform}
          label={label}
          avatarUrl={avatarUrl}
        />
        <div className="pp-threads-meta">
          <div className="pp-threads-name-row">
            <strong>{handle}</strong>
            <span className="pp-time">now</span>
          </div>
        </div>
        <button type="button" className="pp-chrome-btn" tabIndex={-1} aria-hidden="true">
          <MoreHorizontal className="size-4" />
        </button>
      </header>

      {locked ? (
        <p className="pp-body">{body || " "}</p>
      ) : (
        <textarea
          ref={bodyRef}
          className="pp-body pp-body-edit"
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
          onSelect={(event) => onBodySelect?.(event.currentTarget)}
          onKeyUp={(event) => onBodySelect?.(event.currentTarget)}
          onMouseUp={(event) => onBodySelect?.(event.currentTarget)}
          maxLength={8000}
          rows={Math.min(12, Math.max(3, body.split("\n").length + 1))}
          aria-label="Edit caption"
        />
      )}

      <ThreadsMediaStrip images={images} />

      <footer className="pp-threads-actions" aria-hidden="true">
        <span><Heart className="size-4" /></span>
        <span><MessageCircle className="size-4" /></span>
        <span><Repeat2 className="size-4" /></span>
        <span><Send className="size-4" /></span>
      </footer>
    </article>
  );
}
