"use client";

import { TrendingUp } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AnalyticsCardProps = {
  label: string;
  value: string;
  delta: string;
  positive?: boolean;
  className?: string;
  children?: ReactNode;
};

export function AnalyticsCard({
  label,
  value,
  delta,
  positive = true,
  className,
  children,
}: AnalyticsCardProps) {
  return (
    <article className={cn("auth-preview-card auth-analytics-card", className)}>
      <div className="auth-analytics-top">
        <p className="auth-preview-label">{label}</p>
        <span
          className={cn(
            "auth-delta",
            positive ? "auth-delta-positive" : "auth-delta-negative",
          )}
        >
          <TrendingUp className="size-3" aria-hidden="true" />
          {delta}
        </span>
      </div>
      <p className="auth-analytics-value">{value}</p>
      {children}
    </article>
  );
}
