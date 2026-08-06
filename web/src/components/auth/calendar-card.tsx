"use client";

import { cn } from "@/lib/utils";

const days = [
  { day: "Mon", platform: "Instagram", tone: "ig" },
  { day: "Tue", platform: "LinkedIn", tone: "li" },
  { day: "Wed", platform: "Threads", tone: "th" },
  { day: "Thu", platform: "TikTok", tone: "tt" },
] as const;

type CalendarCardProps = {
  className?: string;
};

export function CalendarCard({ className }: CalendarCardProps) {
  return (
    <article
      className={cn("auth-preview-card auth-calendar-card", className)}
      aria-label="Content calendar preview"
    >
      <div className="auth-preview-header">
        <p className="auth-preview-label">Content calendar</p>
        <span className="auth-pill">This week</span>
      </div>
      <ul className="auth-calendar-list">
        {days.map((item) => (
          <li key={item.day} className="auth-calendar-row">
            <span className="auth-calendar-day">{item.day}</span>
            <span className={cn("auth-calendar-platform", `tone-${item.tone}`)}>
              {item.platform}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
