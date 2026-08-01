"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

export const productMotion = {
  quick: {
    duration: 0.16,
    ease: [0.16, 1, 0.3, 1],
  },
  enter: {
    duration: 0.22,
    ease: [0.16, 1, 0.3, 1],
  },
  sheet: {
    type: "spring",
    stiffness: 380,
    damping: 38,
    mass: 0.85,
  },
} as const;

export function ProductMotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={productMotion.enter}>
      {children}
    </MotionConfig>
  );
}
