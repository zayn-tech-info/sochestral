"use client";

import { MessageSquare, Repeat2, Send, ThumbsUp, MoreHorizontal } from "lucide-react";

import {
  accountLabel,
  accountSubtitle,
  mediaSrc,
  monogram,
  type PlatformPreviewProps,
} from "./preview-shared";

export function LinkedInPreview({
  body,
  mediaItems,
  mediaPreviews,
  account,
  locked,
  live,
  onBodyChange,
  platform,
}: PlatformPreviewProps) {
  const label = account ? accountLabel(account) : "Connect an account";
  const headline = accountSubtitle(platform, account);
  const images = mediaItems
    .map((item) => mediaSrc(item, mediaPreviews))
    .filter((src): src is string => Boolean(src));

  return (
    <article
      className={`platform-preview platform-preview-linkedin${live ? " platform-preview-live" : ""}`}
      aria-label="LinkedIn post preview"
    >
      <header className="pp-linkedin-header">
        <span className="pp-avatar pp-avatar-lg" aria-hidden="true">
          {monogram(label)}
        </span>
        <div className="pp-linkedin-meta">
          <strong>{label}</strong>
          <small>{headline}</small>
          <small className="pp-time">Just now · Visible to anyone</small>
        </div>
        <button type="button" className="pp-chrome-btn" tabIndex={-1} aria-hidden="true">
          <MoreHorizontal className="size-4" />
        </button>
      </header>

      {locked ? (
        <p className="pp-body">{body || " "}</p>
      ) : (
        <textarea
          className="pp-body pp-body-edit"
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
          maxLength={8000}
          rows={Math.min(12, Math.max(3, body.split("\n").length + 1))}
          aria-label="LinkedIn post text"
        />
      )}

      {images.length ? (
        <div className="pp-media pp-media-linkedin">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={images[0]!} alt="" />
        </div>
      ) : null}

      <footer className="pp-linkedin-actions" aria-hidden="true">
        <span><ThumbsUp className="size-4" /> Like</span>
        <span><MessageSquare className="size-4" /> Comment</span>
        <span><Repeat2 className="size-4" /> Repost</span>
        <span><Send className="size-4" /> Send</span>
      </footer>
    </article>
  );
}
