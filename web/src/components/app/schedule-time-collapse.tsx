"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

function formatLocalSummary(value: string): string {
  if (!value) return "Set time";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function ScheduleTimeCollapse({
  accountLabel,
  value,
  onChange,
  disabled = false,
  defaultOpen = false,
  children,
}: {
  accountLabel: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const title = `Schedule on ${accountLabel}`;

  return (
    <div
      className={cn(
        "cal-modal-pending-time",
        open && "cal-modal-pending-time-open",
      )}
    >
      <button
        type="button"
        className="cal-modal-pending-time-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="cal-modal-pending-time-toggle-copy">
          <span className="cal-modal-pending-time-label">{title}</span>
          {!open ? (
            <span className="cal-modal-pending-time-summary">
              {formatLocalSummary(value)}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 cal-modal-pending-time-chevron",
            open && "cal-modal-pending-time-chevron-open",
          )}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div id={panelId} className="cal-modal-pending-time-panel">
          <input
            type="datetime-local"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            aria-label={title}
          />
          {children}
        </div>
      ) : null}
    </div>
  );
}
