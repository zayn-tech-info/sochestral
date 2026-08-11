"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";

import {
  ApiError,
  cancelCalendarSlot,
  getCalendarSlot,
  rescheduleCalendarSlot,
  type ScheduleDetail,
} from "@/lib/product-api";
import {
  formatSlotTime,
  PLATFORM_LABELS,
  resolveTimeZone,
} from "@/lib/calendar-week";
import { userFacingError } from "@/lib/user-facing-error";
import {
  InstagramPreview,
  LinkedInPreview,
  ThreadsPreview,
} from "@/components/preview";
import { AppShell } from "./app-shell";
import { useToast } from "./toast-provider";

function PreviewForDetail({ detail }: { detail: ScheduleDetail }) {
  const account = {
    id: detail.accountId,
    username: detail.accountLabel,
    displayName: detail.accountLabel,
    state: "connected" as const,
  };
  const mediaItems = detail.media.map((url) => ({
    assetId: null,
    externalUrl: url,
  }));
  const props = {
    platform: detail.platform,
    body: detail.caption || " ",
    mediaItems,
    mediaPreviews: {} as Record<string, string>,
    account,
    locked: true,
    live: false,
    onBodyChange: () => undefined,
  };

  if (detail.platform === "linkedin_personal") {
    return <LinkedInPreview {...props} />;
  }
  if (detail.platform === "instagram") {
    return <InstagramPreview {...props} />;
  }
  return <ThreadsPreview {...props} />;
}

export function ScheduleDetailView({ scheduleId }: { scheduleId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const timeZone = useMemo(() => resolveTimeZone(), []);
  const [detail, setDetail] = useState<ScheduleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getCalendarSlot(scheduleId);
      setDetail(next);
      const local = new Date(next.scheduledAt);
      const pad = (n: number) => String(n).padStart(2, "0");
      setRescheduleValue(
        `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`,
      );
    } catch (err) {
      setDetail(null);
      setError(err instanceof ApiError ? err.code : "REQUEST_FAILED");
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCancel() {
    if (!detail?.canCancel) return;
    setBusy(true);
    try {
      await cancelCalendarSlot(scheduleId);
      toast({ tone: "success", title: "Schedule canceled." });
      await load();
    } catch (err) {
      toast({
        tone: "error",
        title: userFacingError(
          err instanceof ApiError ? err.code : "REQUEST_FAILED",
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  async function onReschedule() {
    if (!detail?.canReschedule || !rescheduleValue) return;
    setBusy(true);
    try {
      const scheduledAt = new Date(rescheduleValue).toISOString();
      const next = await rescheduleCalendarSlot(scheduleId, scheduledAt);
      setDetail(next);
      toast({ tone: "success", title: "Schedule updated." });
    } catch (err) {
      toast({
        tone: "error",
        title: userFacingError(
          err instanceof ApiError ? err.code : "REQUEST_FAILED",
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Scheduled post"
      description="Review timing and platform preview for this schedule."
      actions={
        <button
          type="button"
          className="cal-icon-btn"
          onClick={() => void load()}
          aria-label="Refresh schedule"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
        </button>
      }
    >
      <div className="cal-detail">
        <div className="cal-detail-main">
          <Link href="/app/calendar" className="cal-back">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to calendar
          </Link>

          {loading ? <p className="cal-day-muted">Loading…</p> : null}
          {error ? (
            <div className="cal-error" role="alert">
              <p>{userFacingError(error)}</p>
              <button type="button" className="cal-link-btn" onClick={() => void load()}>
                Retry
              </button>
            </div>
          ) : null}

          {detail ? (
            <>
              <dl className="cal-detail-meta">
                <div>
                  <dt>Platform</dt>
                  <dd>{PLATFORM_LABELS[detail.platform] ?? detail.platform}</dd>
                </div>
                <div>
                  <dt>Account</dt>
                  <dd>{detail.accountLabel}</dd>
                </div>
                <div>
                  <dt>When</dt>
                  <dd>
                    {formatSlotTime(detail.scheduledAt, timeZone)} · {timeZone}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{detail.statusBucket}</dd>
                </div>
                <div>
                  <dt>Schedule id</dt>
                  <dd>
                    <code>{detail.scheduleId}</code>
                  </dd>
                </div>
              </dl>

              <section className="cal-detail-section" aria-labelledby="cal-caption-title">
                <h2 id="cal-caption-title">Caption</h2>
                <p className="cal-detail-caption">
                  {detail.caption.trim()
                    ? detail.caption
                    : "Caption is not available from SocialMCP for this schedule yet."}
                </p>
              </section>

              {detail.media.length > 0 ? (
                <section className="cal-detail-section" aria-labelledby="cal-media-title">
                  <h2 id="cal-media-title">Media</h2>
                  <ul className="cal-detail-media">
                    {detail.media.map((url) => (
                      <li key={url}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="cal-detail-section" aria-labelledby="cal-actions-title">
                <h2 id="cal-actions-title">Actions</h2>
                <div className="cal-detail-actions">
                  <label className="cal-field">
                    <span>Reschedule</span>
                    <input
                      type="datetime-local"
                      value={rescheduleValue}
                      onChange={(event) => setRescheduleValue(event.target.value)}
                      disabled={!detail.canReschedule || busy}
                    />
                  </label>
                  <button
                    type="button"
                    className="cal-link-btn"
                    disabled={!detail.canReschedule || busy}
                    onClick={() => void onReschedule()}
                    title={
                      detail.canReschedule
                        ? "Save new time"
                        : "Reschedule is not available from SocialMCP yet"
                    }
                  >
                    Save new time
                  </button>
                  {!detail.canReschedule ? (
                    <p className="cal-hint">
                      Reschedule is disabled until SocialMCP exposes a reschedule tool.
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="cal-danger-btn"
                    disabled={!detail.canCancel || busy}
                    onClick={() => void onCancel()}
                    title={
                      detail.canCancel
                        ? "Cancel this schedule"
                        : "Cancel is not available for this schedule"
                    }
                  >
                    Cancel schedule
                  </button>
                  {!detail.canCancel ? (
                    <p className="cal-hint">
                      Cancel is unavailable for this status or missing on SocialMCP.
                    </p>
                  ) : null}
                </div>
              </section>

              {detail.conversationId || detail.draftId ? (
                <section className="cal-detail-section">
                  <h2>Related</h2>
                  <div className="cal-detail-actions">
                    {detail.conversationId ? (
                      <Link
                        href={`/app/chat/${detail.conversationId}`}
                        className="cal-link-btn"
                      >
                        Open chat
                      </Link>
                    ) : null}
                    {detail.draftId ? (
                      <button
                        type="button"
                        className="cal-link-btn"
                        onClick={() =>
                          router.push(
                            `/app/chat/${detail.conversationId ?? ""}?draft=${detail.draftId}`,
                          )
                        }
                      >
                        Open review draft
                      </button>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </>
          ) : null}
        </div>

        <aside className="cal-detail-preview" aria-label="Live platform preview">
          {detail ? <PreviewForDetail detail={detail} /> : null}
        </aside>
      </div>
    </AppShell>
  );
}
