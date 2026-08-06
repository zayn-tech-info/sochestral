"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useReducedMotion } from "motion/react";
import { Sparkles, Bot, GripVertical } from "lucide-react";

import { AnalyticsCard } from "@/components/auth/analytics-card";
import { CalendarCard } from "@/components/auth/calendar-card";
import {
  DraggablePreviewCard,
  type BoardPoint,
} from "@/components/auth/draggable-preview-card";
import { NotificationCard } from "@/components/auth/notification-card";
import { PlatformIcons } from "@/components/auth/platform-icons";
import { cn } from "@/lib/utils";

const SNAP = 20;
const NUDGE_CARD: CardId = "followers";

type CardId =
  | "ai"
  | "followers"
  | "engagement"
  | "calendar"
  | "scheduled"
  | "notifications"
  | "accounts";

type LayoutSeed = {
  x: number;
  y: number;
  w: number;
  z: number;
};

/** Fractional layout relative to the stage (x/y/w are 0–1). */
const LAYOUT_SEEDS: Record<CardId, LayoutSeed> = {
  ai: { x: 0.04, y: 0.02, w: 0.56, z: 4 },
  followers: { x: 0.58, y: 0.04, w: 0.36, z: 5 },
  engagement: { x: 0.62, y: 0.28, w: 0.3, z: 3 },
  calendar: { x: 0.05, y: 0.4, w: 0.42, z: 4 },
  scheduled: { x: 0.52, y: 0.5, w: 0.4, z: 5 },
  notifications: { x: 0.06, y: 0.7, w: 0.44, z: 3 },
  accounts: { x: 0.52, y: 0.76, w: 0.42, z: 4 },
};

const CARD_ORDER: CardId[] = [
  "ai",
  "followers",
  "engagement",
  "calendar",
  "scheduled",
  "notifications",
  "accounts",
];

type DashboardPreviewProps = {
  className?: string;
};

type SnapPreview = BoardPoint & { width: number; height: number };

type CardLayout = BoardPoint & { width: number; z: number };

function seedsToPixels(
  stageWidth: number,
  stageHeight: number,
): Record<CardId, CardLayout> {
  const next = {} as Record<CardId, CardLayout>;
  for (const id of CARD_ORDER) {
    const seed = LAYOUT_SEEDS[id];
    next[id] = {
      x: Math.round(seed.x * stageWidth),
      y: Math.round(seed.y * stageHeight),
      width: Math.round(seed.w * stageWidth),
      z: seed.z,
    };
  }
  return next;
}

export function DashboardPreview({ className }: DashboardPreviewProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const stageRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Record<CardId, CardLayout> | null>(
    null,
  );
  const [draggingId, setDraggingId] = useState<CardId | null>(null);
  const [snapPreview, setSnapPreview] = useState<SnapPreview | null>(null);
  const [nudgeActive, setNudgeActive] = useState(false);
  const hasNudged = useRef(false);
  const stackRef = useRef(0);

  const syncLayoutFromStage = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const { clientWidth, clientHeight } = stage;
    if (clientWidth < 40 || clientHeight < 40) return;
    setLayout((current) => {
      if (current) return current;
      return seedsToPixels(clientWidth, clientHeight);
    });
  }, []);

  useEffect(() => {
    syncLayoutFromStage();
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setLayout((current) => {
        if (current) return current;
        const { clientWidth, clientHeight } = stage;
        if (clientWidth < 40 || clientHeight < 40) return current;
        return seedsToPixels(clientWidth, clientHeight);
      });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [syncLayoutFromStage]);

  useEffect(() => {
    if (!layout || reduceMotion || hasNudged.current) return;
    hasNudged.current = true;
    const start = window.setTimeout(() => setNudgeActive(true), 700);
    const stop = window.setTimeout(() => setNudgeActive(false), 1300);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(stop);
    };
  }, [layout, reduceMotion]);

  const gridStyle = useMemo(
    () =>
      ({
        "--auth-snap": `${SNAP}px`,
      }) as CSSProperties,
    [],
  );

  function handleDragStart(id: string) {
    setDraggingId(id as CardId);
    setNudgeActive(false);
    stackRef.current += 1;
    const nextZ = 40 + stackRef.current;
    setLayout((current) => {
      if (!current) return current;
      const cardId = id as CardId;
      return {
        ...current,
        [cardId]: {
          ...current[cardId],
          z: nextZ,
        },
      };
    });
  }

  function handleDragMove(
    id: string,
    snapped: BoardPoint,
    size: { width: number; height: number },
  ) {
    setSnapPreview({
      ...snapped,
      width: size.width,
      height: size.height,
    });
  }

  function handleDragEnd(id: string, snapped: BoardPoint) {
    setLayout((current) => {
      if (!current) return current;
      const card = current[id as CardId];
      return {
        ...current,
        [id as CardId]: {
          ...card,
          x: snapped.x,
          y: snapped.y,
        },
      };
    });
    setDraggingId(null);
    setSnapPreview(null);
  }

  function boardCard(
    id: CardId,
    cardClassName: string,
    children: ReactNode,
  ) {
    if (!layout) return null;
    const card = layout[id];
    return (
      <DraggablePreviewCard
        id={id}
        className={cardClassName}
        width={card.width}
        position={{ x: card.x, y: card.y }}
        zIndex={card.z}
        snap={SNAP}
        constraintsRef={stageRef}
        reduceMotion={reduceMotion}
        isDragging={draggingId === id}
        nudge={nudgeActive && id === NUDGE_CARD}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        {children}
      </DraggablePreviewCard>
    );
  }

  return (
    <div
      className={cn("auth-dashboard", className)}
      role="group"
      aria-label="Interactive workspace preview. Drag cards to rearrange."
    >
      <div className="auth-dashboard-atmosphere" />
      <div className="auth-dashboard-grid" />
      <div className="auth-dashboard-particles" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, index) => (
          <span key={index} style={{ "--i": index } as CSSProperties} />
        ))}
      </div>

      <p className="auth-drag-hint" data-dragging={draggingId ? "true" : "false"}>
        <GripVertical className="size-3.5" aria-hidden="true" />
        Drag a card to rearrange
      </p>

      <div
        ref={stageRef}
        className="auth-dashboard-stage"
        data-dragging={draggingId ? "true" : "false"}
        style={gridStyle}
      >
        <div className="auth-drop-grid" aria-hidden="true" />

        {snapPreview && draggingId ? (
          <div
            className="auth-drop-ghost"
            aria-hidden="true"
            style={{
              width: snapPreview.width,
              height: snapPreview.height,
              transform: `translate3d(${snapPreview.x}px, ${snapPreview.y}px, 0)`,
            }}
          />
        ) : null}

        {layout ? (
          <>
            {boardCard(
              "ai",
              "auth-ai-panel",
              <>
                <div className="auth-ai-panel-header">
                  <span className="auth-ai-badge">
                    <Bot className="size-3.5" />
                    AI assistant
                  </span>
                  <span className="auth-pill auth-pill-soft">Thinking</span>
                </div>
                <p className="auth-ai-copy">
                  Draft a Threads launch post for tomorrow and schedule LinkedIn
                  at peak engagement.
                </p>
                <div className="auth-ai-chips">
                  <span>
                    <Sparkles className="size-3" />
                    Auto caption
                  </span>
                  <span>Best time: 10:30</span>
                </div>
              </>,
            )}

            {boardCard(
              "followers",
              "auth-card-followers",
              <AnalyticsCard label="Followers" value="12.4k" delta="+18%">
                <div className="auth-sparkline" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </AnalyticsCard>,
            )}

            {boardCard(
              "engagement",
              "auth-card-engagement",
              <AnalyticsCard label="Engagement" value="6.4%" delta="↑ 13%" />,
            )}

            {boardCard("calendar", "auth-card-calendar", <CalendarCard />)}

            {boardCard(
              "scheduled",
              "auth-scheduled-card",
              <article className="auth-preview-card">
                <div className="auth-preview-header">
                  <p className="auth-preview-label">
                    <Sparkles className="size-3.5" />
                    AI Generated
                  </p>
                  <span className="auth-pill">Tomorrow</span>
                </div>
                <p className="auth-scheduled-title">Ready to publish</p>
                <p className="auth-scheduled-meta">
                  Carousel · Instagram + Threads
                </p>
              </article>,
            )}

            {boardCard(
              "notifications",
              "auth-card-notifications",
              <NotificationCard />,
            )}

            {boardCard(
              "accounts",
              "auth-accounts-card",
              <article className="auth-preview-card">
                <div className="auth-preview-header">
                  <p className="auth-preview-label">Connected accounts</p>
                  <span className="auth-pill auth-pill-soft">8 live</span>
                </div>
                <PlatformIcons />
              </article>,
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
