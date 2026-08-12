"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

function MediaNav({
  onPrev,
  onNext,
  canPrev,
  canNext,
  label,
}: {
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  label: string;
}) {
  if (!canPrev && !canNext) return null;
  return (
    <div className="pp-media-nav" role="group" aria-label={label}>
      <button
        type="button"
        className="pp-media-nav-btn pp-media-nav-prev"
        aria-label="Previous image"
        disabled={!canPrev}
        onClick={(event) => {
          event.stopPropagation();
          onPrev();
        }}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="pp-media-nav-btn pp-media-nav-next"
        aria-label="Next image"
        disabled={!canNext}
        onClick={(event) => {
          event.stopPropagation();
          onNext();
        }}
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Threads: show two images at once; step when more than two. */
export function ThreadsMediaStrip({ images }: { images: string[] }) {
  const [start, setStart] = useState(0);
  const windowSize = Math.min(2, images.length);
  const maxStart = Math.max(0, images.length - windowSize);

  useEffect(() => {
    setStart((current) => Math.min(current, maxStart));
  }, [images.length, maxStart]);

  if (!images.length) return null;

  const visible = images.slice(start, start + windowSize);

  return (
    <div
      className={cn(
        "pp-media pp-media-threads-strip",
        visible.length > 1 && "pp-media-grid",
      )}
      data-count={visible.length}
    >
      {visible.map((src, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`${src}-${start + index}`} src={src} alt="" />
      ))}
      <MediaNav
        label="Threads media"
        canPrev={start > 0}
        canNext={start < maxStart}
        onPrev={() => setStart((value) => Math.max(0, value - 1))}
        onNext={() => setStart((value) => Math.min(maxStart, value + 1))}
      />
    </div>
  );
}

/** Instagram: one frame at a time with side chevrons + dots. */
export function InstagramMediaCarousel({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex((current) =>
      images.length ? Math.min(current, images.length - 1) : 0,
    );
  }, [images.length]);

  if (!images.length) {
    return <div className="pp-instagram-empty">Add an image to preview the post</div>;
  }

  const active = images[index]!;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={active} alt="" />
      <MediaNav
        label="Instagram media"
        canPrev={index > 0}
        canNext={index < images.length - 1}
        onPrev={() => setIndex((value) => Math.max(0, value - 1))}
        onNext={() =>
          setIndex((value) => Math.min(images.length - 1, value + 1))
        }
      />
      {images.length > 1 ? (
        <div className="pp-carousel-dots" aria-hidden="true">
          {images.map((_, dotIndex) => (
            <span
              key={dotIndex}
              className={
                dotIndex === index ? "pp-dot pp-dot-active" : "pp-dot"
              }
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

const LINKEDIN_MAX = 4;

/**
 * LinkedIn: collated grid (up to 4). Click a tile to focus one-at-a-time
 * with next/prev; Escape / back returns to the collage.
 */
export function LinkedInMediaCollage({ images }: { images: string[] }) {
  const clipped = images.slice(0, LINKEDIN_MAX);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    setFocusIndex((current) => {
      if (current == null) return null;
      if (!clipped.length) return null;
      return Math.min(current, clipped.length - 1);
    });
  }, [clipped.length]);

  if (!clipped.length) return null;

  // Single image: natural height (no collage tile crop). Parent can scroll.
  if (clipped.length === 1) {
    return (
      <div className="pp-media pp-media-linkedin pp-media-linkedin-single">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={clipped[0]} alt="" />
      </div>
    );
  }

  if (focusIndex != null) {
    const src = clipped[focusIndex]!;
    return (
      <div className="pp-media pp-media-linkedin pp-media-linkedin-focus">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" />
        <MediaNav
          label="LinkedIn media"
          canPrev={focusIndex > 0}
          canNext={focusIndex < clipped.length - 1}
          onPrev={() => setFocusIndex((value) => Math.max(0, (value ?? 0) - 1))}
          onNext={() =>
            setFocusIndex((value) =>
              Math.min(clipped.length - 1, (value ?? 0) + 1),
            )
          }
        />
        <button
          type="button"
          className="pp-media-linkedin-back"
          onClick={() => setFocusIndex(null)}
        >
          Show all
        </button>
      </div>
    );
  }

  const count = clipped.length;
  return (
    <div
      className={cn(
        "pp-media pp-media-linkedin pp-media-linkedin-collage",
        `pp-media-linkedin-collage-${count}`,
      )}
      role="group"
      aria-label="LinkedIn media collage"
    >
      {clipped.map((src, index) => (
        <button
          key={`${src}-${index}`}
          type="button"
          className="pp-media-linkedin-tile"
          aria-label={`View image ${index + 1} of ${count}`}
          onClick={() => setFocusIndex(index)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" />
        </button>
      ))}
    </div>
  );
}
