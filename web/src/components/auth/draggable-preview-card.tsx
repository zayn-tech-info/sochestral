"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { motion, useMotionValue } from "motion/react";

import { cn } from "@/lib/utils";

export type BoardPoint = { x: number; y: number };

type DraggablePreviewCardProps = {
  id: string;
  className?: string;
  width: number;
  position: BoardPoint;
  zIndex: number;
  snap: number;
  constraintsRef: RefObject<HTMLElement | null>;
  reduceMotion: boolean;
  isDragging?: boolean;
  nudge?: boolean;
  onDragStart: (id: string) => void;
  onDragMove: (
    id: string,
    snapped: BoardPoint,
    size: { width: number; height: number },
  ) => void;
  onDragEnd: (id: string, snapped: BoardPoint) => void;
  children: ReactNode;
};

function snapTo(value: number, snap: number) {
  return Math.round(value / snap) * snap;
}

function lifeTiming(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash + id.charCodeAt(i) * (i + 3)) % 97;
  }
  const amplitude = 3 + (hash % 3);
  const duration = 4.6 + (hash % 5) * 0.35;
  const delay = (hash % 8) * 0.18;
  return { amplitude, duration, delay };
}

export function DraggablePreviewCard({
  id,
  className,
  width,
  position,
  zIndex,
  snap,
  constraintsRef,
  reduceMotion,
  isDragging = false,
  nudge = false,
  onDragStart,
  onDragMove,
  onDragEnd,
  children,
}: DraggablePreviewCardProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(position.x);
  const y = useMotionValue(position.y);
  const [hovered, setHovered] = useState(false);
  const timing = useMemo(() => lifeTiming(id), [id]);

  useEffect(() => {
    x.set(position.x);
    y.set(position.y);
  }, [position, x, y]);

  function measureSize() {
    const node = nodeRef.current;
    return {
      width: node?.offsetWidth ?? width,
      height: node?.offsetHeight ?? 120,
    };
  }

  function clampPoint(point: BoardPoint): BoardPoint {
    const stage = constraintsRef.current;
    const size = measureSize();
    if (!stage) return point;
    const maxX = Math.max(0, stage.clientWidth - size.width);
    const maxY = Math.max(0, stage.clientHeight - size.height);
    return {
      x: Math.min(Math.max(0, point.x), maxX),
      y: Math.min(Math.max(0, point.y), maxY),
    };
  }

  function snappedFromMotion(): BoardPoint {
    return clampPoint({
      x: snapTo(x.get(), snap),
      y: snapTo(y.get(), snap),
    });
  }

  const lifeAnimate = (() => {
    if (reduceMotion || isDragging) {
      return { y: 0, x: 0, scale: 1 };
    }
    if (nudge) {
      return { x: [0, 6, -5, 3, 0], y: 0, scale: 1 };
    }
    if (hovered) {
      return { y: -2, x: 0, scale: 1.015 };
    }
    return {
      y: [0, -timing.amplitude, 0],
      x: 0,
      scale: 1,
    };
  })();

  const lifeTransition = (() => {
    if (reduceMotion || isDragging) {
      return { duration: 0.18 };
    }
    if (nudge) {
      return { duration: 0.45, ease: "easeInOut" as const };
    }
    if (hovered) {
      return { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const };
    }
    return {
      y: {
        duration: timing.duration,
        delay: timing.delay,
        repeat: Infinity,
        ease: "easeInOut" as const,
      },
      x: { duration: 0.2 },
      scale: { duration: 0.2 },
    };
  })();

  return (
    <motion.div
      ref={nodeRef}
      className={cn("auth-draggable", className)}
      data-dragging={isDragging ? "true" : "false"}
      style={{ x, y, width, zIndex }}
      drag
      dragConstraints={constraintsRef}
      dragMomentum={false}
      dragElastic={0.04}
      dragTransition={{ power: 0.1, timeConstant: 120 }}
      whileDrag={
        reduceMotion
          ? undefined
          : {
              scale: 1.025,
              cursor: "grabbing",
            }
      }
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onDragStart={() => {
        setHovered(false);
        onDragStart(id);
        onDragMove(id, snappedFromMotion(), measureSize());
      }}
      onDrag={() => {
        onDragMove(id, snappedFromMotion(), measureSize());
      }}
      onDragEnd={() => {
        const next = snappedFromMotion();
        x.set(next.x);
        y.set(next.y);
        onDragEnd(id, next);
      }}
    >
      <motion.div
        className="auth-draggable-life"
        animate={lifeAnimate}
        transition={lifeTransition}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
