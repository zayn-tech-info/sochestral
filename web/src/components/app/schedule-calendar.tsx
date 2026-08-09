"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

import {
  ApiError,
  getCalendarAccounts,
  getCalendarSlots,
  type CalendarAccount,
  type CalendarSlot,
} from "@/lib/product-api";
import {
  dayKeyForInstant,
  formatSlotTime,
  PLATFORM_LABELS,
  resolveTimeZone,
  weekRange,
} from "@/lib/calendar-week";
import { AppShell } from "./app-shell";
import { cn } from "@/lib/utils";

const VISIBLE_CARDS = 3;

function statusClass(bucket: CalendarSlot["statusBucket"]) {
  switch (bucket) {
    case "Done":
      return "cal-status-done";
    case "Failed":
      return "cal-status-failed";
    case "Canceled":
      return "cal-status-canceled";
    default:
      return "cal-status-scheduled";
  }
}

export function ScheduleCalendar() {
  const router = useRouter();
  const timeZone = useMemo(() => resolveTimeZone(), []);
  const [anchor, setAnchor] = useState(() => new Date());
  const [accountId, setAccountId] = useState<string | "all">("all");
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  const range = useMemo(() => weekRange(anchor, timeZone), [anchor, timeZone]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountResult, slotResult] = await Promise.all([
        getCalendarAccounts(),
        getCalendarSlots({
          from: range.from,
          to: range.to,
          timeZone,
          accountId: accountId === "all" ? undefined : accountId,
        }),
      ]);
      setAccounts(accountResult.accounts);
      setSlots(slotResult.slots);
    } catch (err) {
      setSlots([]);
      setError(err instanceof ApiError ? err.code : "REQUEST_FAILED");
    } finally {
      setLoading(false);
    }
  }, [accountId, range.from, range.to, timeZone]);

  useEffect(() => {
    void load();
  }, [load]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, CalendarSlot[]>();
    for (const day of range.days) map.set(day.key, []);
    for (const slot of slots) {
      const key = dayKeyForInstant(slot.scheduledAt, timeZone);
      const list = map.get(key);
      if (list) list.push(slot);
    }
    return map;
  }, [range.days, slots, timeZone]);

  const emptyAccounts = !loading && accounts.length === 0 && !error;

  return (
    <AppShell
      title="Calendar"
      description="Week view of scheduled posts across connected accounts."
      actions={
        <button
          type="button"
          className="cal-icon-btn"
          onClick={() => void load()}
          aria-label="Refresh calendar"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
        </button>
      }
    >
      <div className="cal-layout">
        <aside className="cal-sidebar" aria-label="Connected accounts">
          <p className="cal-sidebar-title">Accounts</p>
          {emptyAccounts ? (
            <div className="cal-empty-sidebar">
              <p>No connected accounts yet.</p>
              <Link href="/app/settings/connectors" className="cal-link-btn">
                Connected Accounts
              </Link>
            </div>
          ) : (
            <ul className="cal-account-list">
              <li>
                <button
                  type="button"
                  className={cn(
                    "cal-account-btn",
                    accountId === "all" && "cal-account-btn-active",
                  )}
                  aria-pressed={accountId === "all"}
                  aria-label="Show all accounts"
                  onClick={() => setAccountId("all")}
                >
                  All accounts
                </button>
              </li>
              {accounts.map((account) => (
                <li key={account.id}>
                  <button
                    type="button"
                    className={cn(
                      "cal-account-btn",
                      accountId === account.id && "cal-account-btn-active",
                    )}
                    aria-pressed={accountId === account.id}
                    aria-label={`Filter ${account.label}`}
                    onClick={() => setAccountId(account.id)}
                  >
                    <span className="cal-account-avatar" aria-hidden="true">
                      {(account.label || "?").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="cal-account-copy">
                      <span className="cal-account-label">{account.label}</span>
                      <span className="cal-account-meta">
                        {PLATFORM_LABELS[account.platform] ?? account.platform}
                        {account.username ? ` · @${account.username.replace(/^@/, "")}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="cal-main" aria-labelledby="cal-week-heading">
          <header className="cal-toolbar">
            <div className="cal-toolbar-nav">
              <button
                type="button"
                className="cal-icon-btn"
                aria-label="Previous week"
                onClick={() =>
                  setAnchor((current) => new Date(current.getTime() - 7 * 86400000))
                }
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="cal-today-btn"
                onClick={() => setAnchor(new Date())}
              >
                Today
              </button>
              <button
                type="button"
                className="cal-icon-btn"
                aria-label="Next week"
                onClick={() =>
                  setAnchor((current) => new Date(current.getTime() + 7 * 86400000))
                }
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
            <h2 id="cal-week-heading" className="cal-week-label">
              {range.weekLabel}
            </h2>
            <Link href="/app/scheduled" className="cal-link-btn">
              List view
            </Link>
            <p className="cal-timezone" title="Active display timezone">
              {timeZone}
            </p>
          </header>

          {error ? (
            <div className="cal-error" role="alert">
              <p>Could not load schedules ({error}).</p>
              <button type="button" className="cal-link-btn" onClick={() => void load()}>
                Retry
              </button>
            </div>
          ) : null}

          {emptyAccounts ? (
            <div className="cal-empty-week">
              <p>Connect an account to see scheduled posts on this calendar.</p>
              <Link href="/app/settings/connectors" className="cal-link-btn">
                Open Connected Accounts
              </Link>
            </div>
          ) : (
            <div className="cal-week-grid" role="grid" aria-label="Week schedule">
              {range.days.map((day) => {
                const daySlots = slotsByDay.get(day.key) ?? [];
                const expanded = expandedDays[day.key] === true;
                const visible = expanded
                  ? daySlots
                  : daySlots.slice(0, VISIBLE_CARDS);
                const overflow = daySlots.length - VISIBLE_CARDS;

                return (
                  <div
                    key={day.key}
                    className={cn("cal-day", day.isToday && "cal-day-today")}
                    role="gridcell"
                    aria-label={`${day.weekdayLabel} ${day.dayOfMonth}`}
                  >
                    <div className="cal-day-head">
                      <span className="cal-day-weekday">{day.weekdayLabel}</span>
                      <span className="cal-day-num">{day.dayOfMonth}</span>
                    </div>
                    <div className="cal-day-body">
                      {loading ? (
                        <p className="cal-day-muted">Loading…</p>
                      ) : daySlots.length === 0 ? (
                        <p className="cal-day-muted">—</p>
                      ) : (
                        <>
                          {visible.map((slot) => (
                            <button
                              key={slot.scheduleId}
                              type="button"
                              className="cal-slot"
                              aria-label={`Open ${PLATFORM_LABELS[slot.platform] ?? slot.platform} schedule at ${formatSlotTime(slot.scheduledAt, timeZone)}`}
                              onClick={() =>
                                router.push(`/app/calendar/${slot.scheduleId}`)
                              }
                            >
                              <span className="cal-slot-time">
                                {formatSlotTime(slot.scheduledAt, timeZone)}
                              </span>
                              <span
                                className={cn(
                                  "cal-slot-status",
                                  statusClass(slot.statusBucket),
                                )}
                              >
                                {slot.statusBucket}
                              </span>
                              <span className="cal-slot-platform">
                                {PLATFORM_LABELS[slot.platform] ?? slot.platform}
                              </span>
                              <span className="cal-slot-account">
                                {slot.accountLabel}
                              </span>
                              {slot.captionPreview ? (
                                <span className="cal-slot-caption">
                                  {slot.captionPreview}
                                </span>
                              ) : (
                                <span className="cal-slot-caption cal-slot-caption-empty">
                                  No caption yet
                                </span>
                              )}
                              {slot.thumbUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={slot.thumbUrl}
                                  alt=""
                                  className="cal-slot-thumb"
                                />
                              ) : null}
                            </button>
                          ))}
                          {!expanded && overflow > 0 ? (
                            <button
                              type="button"
                              className="cal-more"
                              onClick={() =>
                                setExpandedDays((current) => ({
                                  ...current,
                                  [day.key]: true,
                                }))
                              }
                            >
                              +{overflow} more
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && !error && !emptyAccounts && slots.length === 0 ? (
            <div className="cal-empty-week">
              <p>Nothing scheduled this week.</p>
              <Link href="/app/workspace" className="cal-link-btn">
                Open AI Workspace
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
