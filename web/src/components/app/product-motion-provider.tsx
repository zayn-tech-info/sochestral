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
  label: {
    duration: 0.18,
    ease: [0.16, 1, 0.3, 1],
  },
  press: {
    type: "spring",
    stiffness: 520,
    damping: 28,
    mass: 0.55,
  },
  menu: {
    type: "spring",
    stiffness: 420,
    damping: 30,
    mass: 0.72,
  },
  menuExit: {
    duration: 0.14,
    ease: [0.4, 0, 1, 1],
  },
  sheet: {
    type: "spring",
    stiffness: 380,
    damping: 38,
    mass: 0.85,
  },
  rail: {
    type: "spring",
    stiffness: 420,
    damping: 34,
    mass: 0.78,
  },
} as const;

export function ProductMotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={productMotion.enter}>
      {children}
    </MotionConfig>
  );
}
