"use client";

import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { productMotion } from "@/components/app/product-motion-provider";
import { cn } from "@/lib/utils";

type HoverDetailsProps = {
  label: string;
  children: ReactNode;
  /** When true, labels are already visible — skip the floating tip. */
  detailsVisible?: boolean;
  side?: "right" | "bottom";
  className?: string;
  disabled?: boolean;
};

/**
 * Progressive disclosure for compact chrome: floating tip while collapsed,
 * and a fade/slide label when the parent expands.
 */
export function HoverDetails({
  label,
  children,
  detailsVisible = false,
  side = "right",
  className,
  disabled = false,
}: HoverDetailsProps) {
  const tipId = useId();
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const showTip = !disabled && !detailsVisible && hovered;

  return (
    <span
      className={cn("os-hover-details", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {children}
      <AnimatePresence>
        {showTip ? (
          <motion.span
            id={tipId}
            role="tooltip"
            className={cn(
              "os-hover-tip",
              side === "bottom" ? "os-hover-tip-bottom" : "os-hover-tip-right",
            )}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : productMotion.quick}
          >
            {label}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

export function RevealLabel({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.span
          className={cn("os-reveal-label", className)}
          initial={reduceMotion ? false : { opacity: 0, x: -8, width: 0 }}
          animate={{ opacity: 1, x: 0, width: "auto" }}
          exit={
            reduceMotion
              ? undefined
              : { opacity: 0, x: -6, width: 0 }
          }
          transition={reduceMotion ? { duration: 0 } : productMotion.label}
        >
          {children}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
