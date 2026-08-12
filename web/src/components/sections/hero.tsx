"use client";

import Link from "next/link";
import {
  ArrowRight,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  useState,
} from "react";

import {
  InstagramIcon,
  LinkedInIcon,
  ThreadsIcon,
} from "@/components/auth/platform-icons";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

type Platform = "instagram" | "linkedin" | "threads";

type DemoCard = {
  id: string;
  title: string;
  detail: string;
  platform: Platform;
  day: number;
  slot: number;
  time: string;
};

const initialCards: DemoCard[] = [
  {
    id: "launch",
    title: "Launch progress",
    detail: "What shipped this week",
    platform: "linkedin",
    day: 1,
    slot: 0,
    time: "9:30",
  },
  {
    id: "build",
    title: "Behind the build",
    detail: "A quick founder note",
    platform: "threads",
    day: 2,
    slot: 1,
    time: "12:00",
  },
  {
    id: "spotlight",
    title: "Product spotlight",
    detail: "Review before publish",
    platform: "instagram",
    day: 4,
    slot: 2,
    time: "16:15",
  },
];

const platformMeta = {
  instagram: { label: "Instagram", Icon: InstagramIcon },
  linkedin: { label: "LinkedIn", Icon: LinkedInIcon },
  threads: { label: "Threads", Icon: ThreadsIcon },
} as const;

export function Hero() {
  const [cards, setCards] = useState(initialCards);
  const [announcement, setAnnouncement] = useState(
    "Schedule preview ready. Use arrow keys or drag a post to move it.",
  );

  function moveCard(id: string, day: number, slot?: number) {
    const nextDay = Math.max(0, Math.min(days.length - 1, day));
    setCards((current) =>
      current.map((card) =>
        card.id === id
          ? {
              ...card,
              day: nextDay,
              slot:
                slot === undefined
                  ? card.slot
                  : Math.max(0, Math.min(2, slot)),
            }
          : card,
      ),
    );

    const card = cards.find((item) => item.id === id);
    if (card) {
      setAnnouncement(`${card.title} moved to ${days[nextDay]}.`);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, day: number) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    if (id) moveCard(id, day);
  }

  function handleCardKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    card: DemoCard,
  ) {
    const dayDelta =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const slotDelta =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;

    if (dayDelta === 0 && slotDelta === 0) return;
    event.preventDefault();
    moveCard(card.id, card.day + dayDelta, card.slot + slotDelta);
  }

  function resetSchedule() {
    setCards(initialCards);
    setAnnouncement("Schedule preview reset.");
  }

  return (
    <section id="hero" aria-labelledby="hero-title" className="marketing-hero">
      <div className="marketing-hero-grid" aria-hidden="true" />
      <div className="marketing-hero-glow" aria-hidden="true" />

      <div className="content-container marketing-hero-content">
        <header className="marketing-hero-copy">
          <p className="marketing-hero-eyebrow">
            <Sparkles aria-hidden="true" />
            AI social operator for people who ship
          </p>
          <h1 id="hero-title">
            Your business moves fast.
            <span>Your social presence can keep up.</span>
          </h1>
          <p className="marketing-hero-lede">
            Tell Sochestral what you sell or ship. It turns your knowledge into
            drafts, schedules, and approved posts for Threads, LinkedIn, and
            Instagram.
          </p>

          <div className="marketing-hero-actions">
            <Link className="marketing-hero-primary" href="/login">
              Start free beta
              <ArrowRight aria-hidden="true" />
            </Link>
            <a className="marketing-hero-secondary" href="#how-it-works-title">
              See how it works
            </a>
          </div>

          <ul className="marketing-proof-list" aria-label="Product safeguards">
            <li>Plain language in</li>
            <li>Review before publish</li>
            <li>Official APIs out</li>
          </ul>
        </header>

        <div className="marketing-product-stage">
          <div className="marketing-stage-aura" aria-hidden="true" />
          <div className="marketing-calendar-shell">
            <div className="marketing-calendar-topbar">
              <div>
                <p className="marketing-calendar-kicker">Sochestral workspace</p>
                <h2>Content schedule</h2>
              </div>
              <div className="marketing-calendar-controls">
                <span>
                  <ShieldCheck aria-hidden="true" />
                  Review mode on
                </span>
                <button type="button" onClick={resetSchedule}>
                  <RotateCcw aria-hidden="true" />
                  Reset
                </button>
              </div>
            </div>

            <p id="schedule-instructions" className="sr-only">
              Drag posts between weekdays. With a post focused, use left and
              right arrow keys to change day, or up and down arrow keys to
              change time.
            </p>
            <p className="sr-only" aria-live="polite">
              {announcement}
            </p>

            <div
              className="marketing-calendar-grid"
              aria-label="Interactive weekly content schedule"
            >
              {days.map((day, dayIndex) => (
                <div
                  key={day}
                  className="marketing-calendar-day"
                  data-day-index={dayIndex}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDrop(event, dayIndex)}
                >
                  <div className="marketing-calendar-day-head">
                    <span>{day.slice(0, 3)}</span>
                    <span>{12 + dayIndex}</span>
                  </div>
                  <div className="marketing-calendar-lanes" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>

                  {cards
                    .filter((card) => card.day === dayIndex)
                    .map((card) => {
                      const { Icon, label } = platformMeta[card.platform];
                      return (
                        <button
                          key={card.id}
                          type="button"
                          draggable
                          className={`marketing-schedule-card marketing-schedule-card-${card.platform}`}
                          style={{ "--slot": card.slot } as CSSProperties}
                          aria-describedby="schedule-instructions"
                          aria-label={`${card.title}, ${label}, ${day} at ${card.time}`}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/plain", card.id);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onKeyDown={(event) =>
                            handleCardKeyDown(event, card)
                          }
                        >
                          <span className="marketing-card-platform">
                            <Icon aria-hidden="true" />
                            {label}
                          </span>
                          <strong>{card.title}</strong>
                          <span>{card.detail}</span>
                          <time>{card.time}</time>
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>

            <div className="marketing-calendar-footer">
              <span>
                <span className="marketing-live-dot" aria-hidden="true" />
                3 connected accounts
              </span>
              <p>Drag a post to try the schedule</p>
            </div>
          </div>

          <div className="marketing-float-card marketing-float-card-left">
            <span>Next up</span>
            <strong>Launch progress</strong>
            <small>Ready for review</small>
          </div>
          <div className="marketing-float-card marketing-float-card-right">
            <ShieldCheck aria-hidden="true" />
            <span>
              <strong>You stay in control</strong>
              <small>Nothing publishes without approval</small>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
