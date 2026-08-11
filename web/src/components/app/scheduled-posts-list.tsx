"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import {
  ApiError,
  getCalendarAccounts,
  getScheduledPosts,
  type CalendarAccount,
  type CalendarSlot,
  type CalendarStatusBucket,
  type ScheduledPostsSort,
} from "@/lib/product-api";
import {
  backwardListWindow,
  formatRangeLabel,
  formatSlotTime,
  forwardListWindow,
  PLATFORM_LABELS,
  resolveTimeZone,
  rollingListWindow,
  shiftListWindow,
} from "@/lib/calendar-week";
import { userFacingError } from "@/lib/user-facing-error";
import { AppShell } from "./app-shell";
import { PlatformAccountPicker } from "./platform-account-picker";
import { ScheduleDetailModal } from "./schedule-detail-modal";

const STATUS_OPTIONS: CalendarStatusBucket[] = [
  "Scheduled",
  "Done",
  "Failed",
  "Canceled",
];

function EmptyState({
  noAccounts,
}: {
  noAccounts: boolean;
}) {
  return (
    <div className="sched-empty" role="status">
      <p>Nothing to see here.</p>
      <div className="sched-empty-actions">
        <Link href="/app/workspace" className="cal-link-btn">
          Chat with Soc
        </Link>
        <Link href="/app/workspace" className="cal-link-btn">
          Create post
        </Link>
        {noAccounts ? (
          <Link href="/app/settings/connectors" className="cal-link-btn">
            Connect an account
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function ScheduledPostsList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedScheduleId = searchParams.get("schedule");
  const timeZone = useMemo(() => resolveTimeZone(), []);
  const [status, setStatus] = useState<CalendarStatusBucket>("Scheduled");
  const [sort, setSort] = useState<ScheduledPostsSort>("scheduledAt:asc");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [platform, setPlatform] = useState<string>("");
  const [windowRange, setWindowRange] = useState(() => forwardListWindow());
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [posts, setPosts] = useState<CalendarSlot[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [hasNewer, setHasNewer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "Scheduled") {
      setWindowRange(forwardListWindow());
    } else {
      setWindowRange(backwardListWindow());
    }
  }, [status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountResult, postResult] = await Promise.all([
        getCalendarAccounts(),
        getScheduledPosts({
          from: windowRange.from,
          to: windowRange.to,
          timeZone,
          accountIds:
            selectedAccountIds.length > 0 ? selectedAccountIds : undefined,
          platform: platform || undefined,
          status,
          sort,
        }),
      ]);
      setAccounts(accountResult.accounts);
      setPosts(postResult.posts);
      setHasOlder(postResult.hasOlder);
      setHasNewer(postResult.hasNewer);
    } catch (err) {
      setPosts([]);
      setHasOlder(false);
      setHasNewer(false);
      setError(err instanceof ApiError ? err.code : "REQUEST_FAILED");
    } finally {
      setLoading(false);
    }
  }, [selectedAccountIds, platform, sort, status, timeZone, windowRange.from, windowRange.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const rangeLabel = formatRangeLabel(
    windowRange.from,
    windowRange.to,
    timeZone,
  );
  const noAccounts = !loading && accounts.length === 0 && !error;
  const emptyFiltered =
    !loading && !error && accounts.length > 0 && posts.length === 0;

  return (
    <AppShell
      title="Scheduled Posts"
      description="Inventory of schedules you can sort and filter."
      actions={
        <button
          type="button"
          className="cal-icon-btn"
          onClick={() => void load()}
          aria-label="Refresh scheduled posts"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
        </button>
      }
    >
      <div className="sched-page">
        <header className="sched-header">
          <Link href="/app/calendar" className="cal-link-btn">
            Week view
          </Link>
          <p className="cal-timezone" title="Active display timezone">
            {timeZone}
          </p>
        </header>

        <div className="sched-toolbar" aria-label="List filters">
          <div className="cal-toolbar-nav">
            <button
              type="button"
              className="cal-icon-btn"
              aria-label="Older window"
              disabled={!hasOlder || loading}
              onClick={() =>
                setWindowRange((current) =>
                  shiftListWindow(current.from, current.to, "older"),
                )
              }
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="sched-range-label">{rangeLabel}</span>
            <button
              type="button"
              className="cal-icon-btn"
              aria-label="Newer window"
              disabled={!hasNewer || loading}
              onClick={() =>
                setWindowRange((current) =>
                  shiftListWindow(current.from, current.to, "newer"),
                )
              }
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>

          <label className="sched-field">
            <span>Status</span>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as CalendarStatusBucket)
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="sched-field">
            <span>Sort</span>
            <select
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as ScheduledPostsSort)
              }
            >
              <option value="scheduledAt:asc">Time ascending</option>
              <option value="scheduledAt:desc">Time descending</option>
            </select>
          </label>

          <div className="sched-field sched-field-accounts">
            <span>Accounts</span>
            <div className="cal-account-filter-row">
              <button
                type="button"
                className={`cal-account-btn cal-account-btn-all${
                  selectedAccountIds.length === 0 ? " cal-account-btn-active" : ""
                }`}
                aria-pressed={selectedAccountIds.length === 0}
                onClick={() => setSelectedAccountIds([])}
              >
                All accounts
              </button>
              <PlatformAccountPicker
                accounts={accounts}
                selectedAccountIds={selectedAccountIds}
                onChange={setSelectedAccountIds}
                mode="filter"
                aria-label="Filter scheduled posts by account"
              />
            </div>
          </div>

          <label className="sched-field">
            <span>Platform</span>
            <select
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
            >
              <option value="">All platforms</option>
              <option value="threads">Threads</option>
              <option value="linkedin_personal">LinkedIn</option>
              <option value="instagram">Instagram</option>
            </select>
          </label>
        </div>

        {error ? (
          <div className="cal-error" role="alert">
            <p>{userFacingError(error)}</p>
            <button type="button" className="cal-link-btn" onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : null}

        {loading ? <p className="cal-day-muted">Loading…</p> : null}

        {noAccounts || emptyFiltered ? (
          <EmptyState noAccounts={noAccounts} />
        ) : null}

        {!loading && !error && posts.length > 0 ? (
          <div className="sched-table-wrap">
            <table className="sched-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Status</th>
                  <th scope="col">Platform</th>
                  <th scope="col">Account</th>
                  <th scope="col">Caption</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr
                    key={post.scheduleId}
                    tabIndex={0}
                    className="sched-row"
                    onClick={() =>
                      router.push(
                        `${pathname || "/app/scheduled"}?schedule=${encodeURIComponent(post.scheduleId)}`,
                        { scroll: false },
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(
                          `${pathname || "/app/scheduled"}?schedule=${encodeURIComponent(post.scheduleId)}`,
                          { scroll: false },
                        );
                      }
                    }}
                  >
                    <td>{formatSlotTime(post.scheduledAt, timeZone)}</td>
                    <td>{post.statusBucket}</td>
                    <td>{PLATFORM_LABELS[post.platform] ?? post.platform}</td>
                    <td>{post.accountLabel}</td>
                    <td className="sched-caption">
                      {post.captionPreview || "No caption yet"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <ScheduleDetailModal
        scheduleId={selectedScheduleId}
        open={Boolean(selectedScheduleId)}
        accounts={accounts}
        onClose={() => {
          router.push(pathname || "/app/scheduled", { scroll: false });
        }}
        onChanged={() => {
          void load();
        }}
      />
    </AppShell>
  );
}
