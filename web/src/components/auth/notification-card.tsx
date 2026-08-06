"use client";

import { Bell, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

const notifications = [
  "Instagram connected",
  "LinkedIn synced",
  "Post scheduled",
  "Analytics updated",
] as const;

type NotificationCardProps = {
  className?: string;
};

export function NotificationCard({ className }: NotificationCardProps) {
  return (
    <article
      className={cn("auth-preview-card auth-notification-card", className)}
      aria-label="Recent notifications preview"
    >
      <div className="auth-preview-header">
        <p className="auth-preview-label">
          <Bell className="size-3.5" aria-hidden="true" />
          Notifications
        </p>
        <span className="auth-pill auth-pill-soft">Live</span>
      </div>
      <ul className="auth-notification-list">
        {notifications.map((item) => (
          <li key={item} className="auth-notification-row">
            <CheckCircle2
              className="size-3.5 shrink-0 text-[var(--auth-success)]"
              aria-hidden="true"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
