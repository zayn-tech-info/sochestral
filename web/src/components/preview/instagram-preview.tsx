"use client";

import { Bookmark, Heart, MessageCircle, MoreHorizontal, Send } from "lucide-react";

import {
  accountHandle,
  accountLabel,
  mediaSrc,
  monogram,
  type PlatformPreviewProps,
} from "./preview-shared";

export function InstagramPreview({
  body,
  mediaItems,
  mediaPreviews,
  account,
  locked,
  live,
  onBodyChange,
}: PlatformPreviewProps) {
  const label = account ? accountLabel(account) : "Connect an account";
  const handle = account ? accountHandle(account) : "connect";
  const images = mediaItems
    .map((item) => mediaSrc(item, mediaPreviews))
    .filter((src): src is string => Boolean(src));
  const activeDot = 0;

  return (
    <article
      className={`platform-preview platform-preview-instagram${live ? " platform-preview-live" : ""}`}
      aria-label="Instagram post preview"
    >
      <header className="pp-instagram-header">
        <span className="pp-avatar" aria-hidden="true">
          {monogram(label)}
        </span>
        <div className="pp-instagram-meta">
          <strong>{handle}</strong>
          <span className="pp-time">now</span>
        </div>
        <button type="button" className="pp-chrome-btn" tabIndex={-1} aria-hidden="true">
          <MoreHorizontal className="size-4" />
        </button>
      </header>

      <div className="pp-instagram-stage">
        {images.length ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={images[activeDot]!} alt="" />
            {images.length > 1 ? (
              <div className="pp-carousel-dots" aria-hidden="true">
                {images.map((_, index) => (
                  <span
                    key={index}
                    className={index === activeDot ? "pp-dot pp-dot-active" : "pp-dot"}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="pp-instagram-empty">Add an image to preview the post</div>
        )}
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
            className="pp-body pp-body-edit"
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            maxLength={8000}
            rows={Math.min(8, Math.max(2, body.split("\n").length + 1))}
            aria-label="Instagram caption"
          />
        </label>
      )}
    </article>
  );
}
