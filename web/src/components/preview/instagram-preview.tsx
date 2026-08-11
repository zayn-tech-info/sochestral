"use client";

import { Bookmark, Heart, MessageCircle, MoreHorizontal, Send } from "lucide-react";

import { PreviewAvatar } from "./preview-avatar";
import { InstagramMediaCarousel } from "./preview-media";
import {
  accountHandle,
  accountLabel,
  mediaSrc,
  type PlatformPreviewProps,
} from "./preview-shared";

export function InstagramPreview({
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
      className={`platform-preview platform-preview-instagram${live ? " platform-preview-live" : ""}`}
      aria-label="Instagram post preview"
    >
      <header className="pp-instagram-header">
        <PreviewAvatar
          platform={platform}
          label={label}
          avatarUrl={avatarUrl}
        />
        <div className="pp-instagram-meta">
          <strong>{handle}</strong>
          <span className="pp-time">now</span>
        </div>
        <button type="button" className="pp-chrome-btn" tabIndex={-1} aria-hidden="true">
          <MoreHorizontal className="size-4" />
        </button>
      </header>

      <div className="pp-instagram-stage">
        <InstagramMediaCarousel images={images} />
      </div>

      <div className="pp-instagram-actions" aria-hidden="true">
        <span className="pp-instagram-actions-left">
          <Heart className="size-5" />
          <MessageCircle className="size-5" />
          <Send className="size-5" />
        </span>
        <Bookmark className="size-5" />
      </div>

      {locked ? (
        <p className="pp-body pp-instagram-caption">
          <strong>{handle}</strong> {body || " "}
        </p>
      ) : (
        <label className="pp-instagram-caption-edit">
          <strong>{handle}</strong>
          <textarea
            ref={bodyRef}
            className="pp-body pp-body-edit"
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            onSelect={(event) => onBodySelect?.(event.currentTarget)}
            onKeyUp={(event) => onBodySelect?.(event.currentTarget)}
            onMouseUp={(event) => onBodySelect?.(event.currentTarget)}
            maxLength={8000}
            rows={Math.min(8, Math.max(2, body.split("\n").length + 1))}
            aria-label="Edit caption"
          />
        </label>
      )}
    </article>
  );
}
