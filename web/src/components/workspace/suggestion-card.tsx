"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import { productMotion } from "@/components/app/product-motion-provider";

type SuggestionCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
  onSelect: () => void;
  disabled?: boolean;
};

export function SuggestionCard({
  icon,
  title,
  description,
  onSelect,
  disabled,
}: SuggestionCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      className={cn("os-suggestion-card", disabled && "opacity-60")}
      onClick={onSelect}
      disabled={disabled}
      whileHover={reduceMotion || disabled ? undefined : { y: -2 }}
      transition={productMotion.quick}
    >
      <span className="os-suggestion-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="os-suggestion-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </motion.button>
  );
}
