"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type GradientButtonProps = {
  children: ReactNode;
  className?: string;
  busy?: boolean;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
};

export function GradientButton({
  children,
  className,
  busy = false,
  disabled,
  type = "button",
}: GradientButtonProps) {
  const isDisabled = disabled || busy;

  return (
    <button
      type={type}
      className={cn("auth-gradient-button", className)}
      disabled={isDisabled}
      aria-busy={busy || undefined}
    >
      <span className="auth-gradient-button-label">{children}</span>
    </button>
  );
}
