"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";

import {
  InstagramIcon,
  LinkedInIcon,
  ThreadsIcon,
} from "@/components/auth/platform-icons";
import {
  ApiError,
  getCalendarAccounts,
  getCalendarSlots,
  rescheduleCalendarSlot,
  type CalendarAccount,
  type CalendarSlot,
  type ConnectorPlatform,
} from "@/lib/product-api";
import { userFacingError } from "@/lib/user-facing-error";
import {
  DAY_PX_PER_HOUR,
  DAY_TIMELINE_HEIGHT,
  clampDropMinutes,
  dayKeyForInstant,
  formatGuideTime,
  formatSlotTime,
  instantAtDayMinutes,
  minutesFromMidnight,
  minutesToPx,
  PLATFORM_LABELS,
  pxToMinutes,
  resolveTimeZone,
  snapMinutes,
  weekRange,
} from "@/lib/calendar-week";
import { AppShell } from "./app-shell";
import { PlatformAccountPicker } from "./platform-account-picker";
import { ScheduleDetailModal } from "./schedule-detail-modal";
import { CreateScheduleModal } from "./create-schedule-modal";
import { useToast } from "./toast-provider";
import { cn } from "@/lib/utils";

const DEFAULT_COL_WIDTH = 196;
const MIN_COL_WIDTH = 148;
const MAX_COL_WIDTH = 420;
const DEFAULT_SLOT_HEIGHT = 72;
const MIN_SLOT_HEIGHT = 52;
const MAX_SLOT_HEIGHT = 220;
const COL_WIDTHS_KEY = "sochestral.cal.colWidths";
const SLOT_HEIGHTS_KEY = "sochestral.cal.slotHeights";
const HOUR_MARKS = Array.from({ length: 24 }, (_, hour) => hour);

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

function SlotPlatformMark({ platform }: { platform: ConnectorPlatform }) {
  const Icon =
    platform === "linkedin_personal"
      ? LinkedInIcon
      : platform === "instagram"
        ? InstagramIcon
        : ThreadsIcon;
  return (
    <span
      className={cn(
        "cal-slot-platform-mark",
        `cal-slot-platform-mark-${platform}`,
      )}
      title={PLATFORM_LABELS[platform] ?? platform}
      aria-hidden="true"
    >
      <Icon className="size-3" />
    </span>
  );
}

function readNumberMap(key: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [entryKey, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        out[entryKey] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeNumberMap(key: string, value: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Same local minute → one visual card with multi-platform icons. */
function groupSlotsByMinute(
  slots: CalendarSlot[],
  timeZone: string,
): Array<{ key: string; minutes: number; members: CalendarSlot[] }> {
  const groups = new Map<
    number,
    { key: string; minutes: number; members: CalendarSlot[] }
  >();
  for (const slot of slots) {
    const minutes = minutesFromMidnight(slot.scheduledAt, timeZone);
    const existing = groups.get(minutes);
    if (existing) {
      existing.members.push(slot);
      continue;
    }
    groups.set(minutes, {
      key: `m-${minutes}`,
      minutes,
      members: [slot],
    });
  }
  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      members: [...group.members].sort((a, b) =>
        a.scheduleId.localeCompare(b.scheduleId),
      ),
    }))
    .sort((a, b) => a.minutes - b.minutes);
}

const PLATFORM_ICON_ORDER: ConnectorPlatform[] = [
  "threads",
  "linkedin_personal",
  "instagram",
];

function orderedPlatforms(members: CalendarSlot[]): ConnectorPlatform[] {
  const set = new Set(members.map((slot) => slot.platform));
  return PLATFORM_ICON_ORDER.filter((platform) => set.has(platform));
}

export function ScheduleCalendar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const selectedScheduleId = searchParams.get("schedule");
  const timeZone = useMemo(() => resolveTimeZone(), []);
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [slots, setSlots] = useState<CalendarSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [slotHeights, setSlotHeights] = useState<Record<string, number>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropDayKey, setDropDayKey] = useState<string | null>(null);
  const [dropMinutes, setDropMinutes] = useState<number | null>(null);
  const [createHover, setCreateHover] = useState<{
    dayKey: string;
    minutes: number;
  } | null>(null);
  const [createDraft, setCreateDraft] = useState<{
    scheduledAt: string;
  } | null>(null);
  const [busyScheduleId, setBusyScheduleId] = useState<string | null>(null);
  const dragMoved = useRef(false);
  const weekBodyScrollRef = useRef<HTMLDivElement | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const dropDayKeyRef = useRef<string | null>(null);
  const dropMinutesRef = useRef<number | null>(null);
  const resizeSession = useRef<{
    kind: "column" | "slot";
    key: string;
    startX: number;
    startY: number;
    startValue: number;
  } | null>(null);

  const range = useMemo(() => weekRange(anchor, timeZone), [anchor, timeZone]);

  useEffect(() => {
    setColWidths(readNumberMap(COL_WIDTHS_KEY));
    setSlotHeights(readNumberMap(SLOT_HEIGHTS_KEY));
  }, []);

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
          accountIds:
            selectedAccountIds.length > 0 ? selectedAccountIds : undefined,
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
  }, [selectedAccountIds, range.from, range.to, timeZone]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const session = resizeSession.current;
      if (!session) return;
      if (session.kind === "column") {
        const delta = event.clientX - session.startX;
        const next = clamp(
          session.startValue + delta,
          MIN_COL_WIDTH,
          MAX_COL_WIDTH,
        );
        setColWidths((current) => {
          const updated = { ...current, [session.key]: next };
          writeNumberMap(COL_WIDTHS_KEY, updated);
          return updated;
        });
        return;
      }
      const deltaY = event.clientY - session.startY;
      const next = clamp(
        session.startValue + deltaY,
        MIN_SLOT_HEIGHT,
        MAX_SLOT_HEIGHT,
      );
      setSlotHeights((current) => {
        const updated = { ...current, [session.key]: next };
        writeNumberMap(SLOT_HEIGHTS_KEY, updated);
        return updated;
      });
    }

    function onPointerUp() {
      if (!resizeSession.current) return;
      resizeSession.current = null;
      document.body.classList.remove("cal-resizing", "cal-resizing-y");
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

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

  const selectedRelatedScheduleIds = useMemo(() => {
    if (!selectedScheduleId) return [];
    const selected = slots.find((slot) => slot.scheduleId === selectedScheduleId);
    if (!selected) return [selectedScheduleId];
    const dayKey = dayKeyForInstant(selected.scheduledAt, timeZone);
    const minute = minutesFromMidnight(selected.scheduledAt, timeZone);
    const sameMinute = (slotsByDay.get(dayKey) ?? [])
      .filter(
        (slot) => minutesFromMidnight(slot.scheduledAt, timeZone) === minute,
      );
    const seenAccountIds = new Set<string>();
    return [selected, ...sameMinute.filter((slot) => slot !== selected)]
      .filter((slot) => {
        if (seenAccountIds.has(slot.accountId)) return false;
        seenAccountIds.add(slot.accountId);
        return true;
      })
      .map((slot) => slot.scheduleId);
  }, [selectedScheduleId, slots, slotsByDay, timeZone]);

  const emptyAccounts = !loading && accounts.length === 0 && !error;

  function columnWidthFor(dayKey: string) {
    return clamp(
      colWidths[dayKey] ?? DEFAULT_COL_WIDTH,
      MIN_COL_WIDTH,
      MAX_COL_WIDTH,
    );
  }

  function beginColumnResize(
    dayKey: string,
    event: ReactPointerEvent<HTMLSpanElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    document.body.classList.add("cal-resizing");
    resizeSession.current = {
      kind: "column",
      key: dayKey,
      startX: event.clientX,
      startY: event.clientY,
      startValue: columnWidthFor(dayKey),
    };
  }

  function beginSlotHeightResize(
    scheduleId: string,
    event: ReactPointerEvent<HTMLSpanElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    document.body.classList.add("cal-resizing", "cal-resizing-y");
    resizeSession.current = {
      kind: "slot",
      key: scheduleId,
      startX: event.clientX,
      startY: event.clientY,
      startValue: slotHeights[scheduleId] ?? DEFAULT_SLOT_HEIGHT,
    };
  }

  function minutesFromDayEvent(
    event: { clientY: number },
    dayBody: HTMLElement,
  ): number {
    const rect = dayBody.getBoundingClientRect();
    // Canvas is tall inside a scrolling parent — use viewport-relative rect only.
    // (Do not add canvas.scrollTop; the canvas itself does not scroll.)
    const y = event.clientY - rect.top;
    return snapMinutes(pxToMinutes(Math.max(0, Math.min(DAY_TIMELINE_HEIGHT, y))));
  }

  function onCanvasPointerMove(
    dayKey: string,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (draggingIdRef.current || resizeSession.current) {
      setCreateHover(null);
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest(".cal-slot")) {
      setCreateHover(null);
      return;
    }
    const canvas = event.currentTarget;
    const rawMinutes = minutesFromDayEvent(event, canvas);
    const minutes = clampDropMinutes(dayKey, rawMinutes, timeZone);
    if (minutes == null) {
      setCreateHover(null);
      return;
    }
    setCreateHover({ dayKey, minutes });
  }

  function onCanvasPointerLeave() {
    if (draggingIdRef.current) return;
    setCreateHover(null);
  }

  function onCanvasClick(
    dayKey: string,
    event: ReactPointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>,
  ) {
    if (draggingIdRef.current || resizeSession.current || dragMoved.current) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest(".cal-slot, .cal-col-resize, button, a, input")) {
      return;
    }
    if (accounts.length === 0) {
      toast({
        tone: "error",
        title: "Connect an account before scheduling from the calendar.",
      });
      return;
    }
    const canvas = event.currentTarget as HTMLDivElement;
    const rawMinutes = minutesFromDayEvent(event, canvas);
    const minutes = clampDropMinutes(dayKey, rawMinutes, timeZone);
    if (minutes == null) {
      toast({
        tone: "error",
        title: "Pick a future time to schedule a post.",
      });
      return;
    }
    setCreateHover(null);
    setCreateDraft({
      scheduledAt: instantAtDayMinutes(dayKey, minutes, timeZone),
    });
  }

  function autoScrollWhileDragging(clientY: number) {
    const scroller = weekBodyScrollRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const edge = 48;
    const maxStep = 28;
    if (clientY < rect.top + edge) {
      const intensity = (rect.top + edge - clientY) / edge;
      scroller.scrollTop -= Math.ceil(maxStep * Math.min(1, intensity));
    } else if (clientY > rect.bottom - edge) {
      const intensity = (clientY - (rect.bottom - edge)) / edge;
      scroller.scrollTop += Math.ceil(maxStep * Math.min(1, intensity));
    }
  }

  function updateDropFromPoint(clientX: number, clientY: number) {
    const scheduleId = draggingIdRef.current;
    if (!scheduleId) return;
    autoScrollWhileDragging(clientY);

    const days = document.querySelectorAll<HTMLElement>(".cal-day[data-day-key]");
    let target: HTMLElement | null = null;
    for (const day of days) {
      const rect = day.getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        target = day;
        break;
      }
    }
    // When the cursor is in the vertical scroller but outside a day column
    // horizontally, keep updating the last hovered day by Y only.
    if (!target && dropDayKeyRef.current) {
      target =
        document.querySelector<HTMLElement>(
          `.cal-day[data-day-key="${dropDayKeyRef.current}"]`,
        ) ?? null;
    }
    if (!target) return;

    const dayKey = target.dataset.dayKey;
    const body = target.querySelector(".cal-day-canvas") as HTMLElement | null;
    if (!dayKey || !body) return;

    const rawMinutes = minutesFromDayEvent({ clientY }, body);
    const minutes = clampDropMinutes(dayKey, rawMinutes, timeZone);
    dropDayKeyRef.current = dayKey;
    dropMinutesRef.current = minutes;
    setDropDayKey(dayKey);
    setDropMinutes(minutes);
    dragMoved.current = true;
  }

  function onSlotDragStart(slot: CalendarSlot, event: DragEvent<HTMLElement>) {
    if (resizeSession.current || !slot.canReschedule) {
      event.preventDefault();
      return;
    }
    dragMoved.current = false;
    draggingIdRef.current = slot.scheduleId;
    setDraggingId(slot.scheduleId);
    setCreateHover(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", slot.scheduleId);
    // Transparent drag image so the timeline guide is the primary feedback.
    try {
      const ghost = document.createElement("div");
      ghost.style.width = "1px";
      ghost.style.height = "1px";
      ghost.style.opacity = "0";
      document.body.appendChild(ghost);
      event.dataTransfer.setDragImage(ghost, 0, 0);
      requestAnimationFrame(() => ghost.remove());
    } catch {
      // ignore browsers that reject custom drag images
    }
  }

  function onSlotDragEnd() {
    draggingIdRef.current = null;
    dropDayKeyRef.current = null;
    dropMinutesRef.current = null;
    setDraggingId(null);
    setDropDayKey(null);
    setDropMinutes(null);
  }

  function onDayDragOver(dayKey: string, event: DragEvent<HTMLElement>) {
    if (!draggingIdRef.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    dropDayKeyRef.current = dayKey;
    updateDropFromPoint(event.clientX, event.clientY);
  }

  useEffect(() => {
    if (!draggingId) return;

    // Native DOM DragEvent (not React.DragEvent) for document listeners.
    function onDocumentDragOver(event: globalThis.DragEvent) {
      if (!draggingIdRef.current) return;
      event.preventDefault();
      updateDropFromPoint(event.clientX, event.clientY);
    }

    document.addEventListener("dragover", onDocumentDragOver);
    return () => {
      document.removeEventListener("dragover", onDocumentDragOver);
    };
    // updateDropFromPoint closes over timeZone; rebind when drag starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId, timeZone]);

  async function onDayDrop(dayKey: string, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const scheduleId =
      event.dataTransfer.getData("text/plain") || draggingIdRef.current || "";
    updateDropFromPoint(event.clientX, event.clientY);
    const guidedMinutes = dropMinutesRef.current;
    const guidedDay = dropDayKeyRef.current ?? dayKey;
    draggingIdRef.current = null;
    dropDayKeyRef.current = null;
    dropMinutesRef.current = null;
    setDropDayKey(null);
    setDropMinutes(null);
    setDraggingId(null);
    if (!scheduleId) return;

    const slot = slots.find((entry) => entry.scheduleId === scheduleId);
    if (!slot || !slot.canReschedule) return;

    const body = document.querySelector(
      `.cal-day[data-day-key="${guidedDay}"] .cal-day-canvas`,
    ) as HTMLElement | null;
    const rawMinutes =
      guidedMinutes ??
      (body ? minutesFromDayEvent(event, body) : null);
    const minutes =
      guidedMinutes != null
        ? guidedMinutes
        : rawMinutes == null
          ? null
          : clampDropMinutes(guidedDay, rawMinutes, timeZone);

    if (minutes == null) {
      toast({
        tone: "error",
        title: "Pick a future time — past times cannot be scheduled.",
      });
      return;
    }

    let nextAt: string;
    try {
      nextAt = instantAtDayMinutes(guidedDay, minutes, timeZone);
    } catch {
      toast({
        tone: "error",
        title: "Could not compute a new schedule time.",
      });
      return;
    }

    if (Date.parse(nextAt) <= Date.now()) {
      toast({
        tone: "error",
        title: "Pick a future time — past times cannot be scheduled.",
      });
      return;
    }

    if (nextAt === slot.scheduledAt) return;

    const previous = slots;
    setSlots((current) =>
      current.map((entry) =>
        entry.scheduleId === scheduleId
          ? { ...entry, scheduledAt: nextAt }
          : entry,
      ),
    );
    setBusyScheduleId(scheduleId);

    try {
      const updated = await rescheduleCalendarSlot(scheduleId, nextAt);
      const persistedAt = updated.scheduledAt || nextAt;
      setSlots((current) =>
        current.map((entry) =>
          entry.scheduleId === scheduleId
            ? { ...entry, scheduledAt: persistedAt }
            : entry,
        ),
      );
      toast({
        tone: "success",
        title: `Moved to ${formatSlotTime(persistedAt, timeZone)} on ${guidedDay}.`,
      });
    } catch (err) {
      setSlots(previous);
      const code = err instanceof ApiError ? err.code : "REQUEST_FAILED";
      toast({
        tone: "error",
        title:
          code === "MUTATION_UNSUPPORTED" &&
          previous.find((row) => row.scheduleId === scheduleId)?.statusBucket ===
            "Canceled"
            ? userFacingError("SCHEDULE_REACTIVATE_FAILED")
            : userFacingError(err),
      });
    } finally {
      setBusyScheduleId(null);
    }
  }

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
            <div className="cal-account-filter-row">
              <button
                type="button"
                className={cn(
                  "cal-account-btn",
                  "cal-account-btn-all",
                  selectedAccountIds.length === 0 && "cal-account-btn-active",
                )}
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
                aria-label="Filter by platform accounts"
              />
            </div>
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
              <p>{userFacingError(error)}</p>
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
            <div className="cal-week-scroll" tabIndex={0} aria-label="Week schedule">
              <div className="cal-week-frame">
                <div className="cal-week-head-row" aria-hidden="true">
                  <div className="cal-time-gutter-head" />
                  {range.days.map((day) => {
                    const width = columnWidthFor(day.key);
                    return (
                      <div
                        key={`head-${day.key}`}
                        className={cn(
                          "cal-day-head",
                          day.isToday && "cal-day-today-head",
                        )}
                        style={{ width, minWidth: width, maxWidth: width }}
                      >
                        <span className="cal-day-weekday">{day.weekdayLabel}</span>
                        <span className="cal-day-num">{day.dayOfMonth}</span>
                      </div>
                    );
                  })}
                </div>

                <div
                  className="cal-week-body-scroll"
                  ref={weekBodyScrollRef}
                >
                  <div
                    className="cal-week-grid"
                    role="grid"
                    style={
                      {
                        "--cal-day-height": `${DAY_TIMELINE_HEIGHT}px`,
                        "--cal-hour-height": `${DAY_PX_PER_HOUR}px`,
                      } as CSSProperties
                    }
                  >
                    <div className="cal-time-gutter" aria-hidden="true">
                      <div
                        className="cal-time-gutter-canvas"
                        style={{ height: DAY_TIMELINE_HEIGHT }}
                      >
                        {HOUR_MARKS.map((hour) => (
                          <div
                            key={hour}
                            className={cn(
                              "cal-time-mark",
                              hour === 0 && "cal-time-mark-start",
                            )}
                            style={{ top: minutesToPx(hour * 60) }}
                          >
                            {formatGuideTime(hour * 60)}
                          </div>
                        ))}
                        {dropMinutes != null ? (
                          <div
                            className="cal-drop-guide-chip"
                            style={{
                              top: minutesToPx(dropMinutes),
                            }}
                            data-testid="cal-drop-guide-time"
                          >
                            {formatGuideTime(dropMinutes)}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {range.days.map((day) => {
                      const daySlots = slotsByDay.get(day.key) ?? [];
                      const width = columnWidthFor(day.key);
                      const guideMinutes =
                        dropDayKey === day.key && dropMinutes != null
                          ? dropMinutes
                          : createHover?.dayKey === day.key
                            ? createHover.minutes
                            : null;
                      const showCreatePlus =
                        !draggingId &&
                        createHover?.dayKey === day.key &&
                        createHover.minutes != null;

                      return (
                        <div
                          key={day.key}
                          className={cn(
                            "cal-day",
                            day.isToday && "cal-day-today",
                            dropDayKey === day.key && "cal-day-drop-target",
                            createHover?.dayKey === day.key &&
                              "cal-day-create-target",
                          )}
                          data-day-key={day.key}
                          role="gridcell"
                          aria-label={`${day.weekdayLabel} ${day.dayOfMonth}`}
                          style={{ width, minWidth: width, maxWidth: width }}
                          onDragOver={(event) => onDayDragOver(day.key, event)}
                          onDrop={(event) => void onDayDrop(day.key, event)}
                        >
                          <div
                            className="cal-day-canvas"
                            style={{ height: DAY_TIMELINE_HEIGHT }}
                            onPointerMove={(event) =>
                              onCanvasPointerMove(day.key, event)
                            }
                            onPointerLeave={onCanvasPointerLeave}
                            onClick={(event) => onCanvasClick(day.key, event)}
                          >
                            {HOUR_MARKS.map((hour) => (
                              <div
                                key={`${day.key}-h-${hour}`}
                                className="cal-hour-line"
                                style={{ top: minutesToPx(hour * 60) }}
                              />
                            ))}

                            {guideMinutes != null ? (
                              <div
                                className={cn(
                                  "cal-drop-guide",
                                  showCreatePlus && "cal-create-guide",
                                )}
                                style={{ top: minutesToPx(guideMinutes) }}
                                data-testid={
                                  showCreatePlus
                                    ? "cal-create-guide"
                                    : "cal-drop-guide"
                                }
                              >
                                {showCreatePlus ? (
                                  <>
                                    <span
                                      className="cal-day-guide-chip"
                                      data-testid="cal-create-guide-time"
                                    >
                                      {formatGuideTime(guideMinutes)}
                                    </span>
                                    <button
                                      type="button"
                                      className="cal-create-plus"
                                      aria-label={`Add schedule at ${formatGuideTime(guideMinutes)}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (accounts.length === 0) {
                                          toast({
                                            tone: "error",
                                            title:
                                              "Connect an account before scheduling from the calendar.",
                                          });
                                          return;
                                        }
                                        setCreateHover(null);
                                        setCreateDraft({
                                          scheduledAt: instantAtDayMinutes(
                                            day.key,
                                            guideMinutes,
                                            timeZone,
                                          ),
                                        });
                                      }}
                                    >
                                      <Plus
                                        className="size-3.5"
                                        aria-hidden="true"
                                      />
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            ) : null}

                            {loading ? (
                              <p className="cal-day-muted cal-day-muted-abs">
                                Loading…
                              </p>
                            ) : (
                              groupSlotsByMinute(daySlots, timeZone).map(
                                (group) => {
                                  const primary = group.members[0]!;
                                  const platforms = orderedPlatforms(
                                    group.members,
                                  );
                                  const top = minutesToPx(group.minutes);
                                  const height = clamp(
                                    Math.max(
                                      ...group.members.map(
                                        (slot) =>
                                          slotHeights[slot.scheduleId] ??
                                          DEFAULT_SLOT_HEIGHT,
                                      ),
                                    ),
                                    MIN_SLOT_HEIGHT,
                                    MAX_SLOT_HEIGHT,
                                  );
                                  const canDrag = group.members.every(
                                    (slot) => slot.canReschedule === true,
                                  );
                                  const inactive = group.members.every(
                                    (slot) =>
                                      slot.statusBucket === "Done" ||
                                      slot.statusBucket === "Canceled" ||
                                      slot.statusBucket === "Failed",
                                  );
                                  const statusBucket = group.members.every(
                                    (slot) =>
                                      slot.statusBucket === primary.statusBucket,
                                  )
                                    ? primary.statusBucket
                                    : primary.statusBucket;
                                  const openSchedule = (scheduleId: string) => {
                                    if (dragMoved.current) {
                                      dragMoved.current = false;
                                      return;
                                    }
                                    router.push(
                                      `/app/calendar?schedule=${encodeURIComponent(scheduleId)}`,
                                      { scroll: false },
                                    );
                                  };
                                  return (
                                    <div
                                      key={group.key}
                                      className={cn(
                                        "cal-slot",
                                        inactive && "cal-slot-inactive",
                                        draggingId === primary.scheduleId &&
                                          "cal-slot-dragging",
                                        busyScheduleId ===
                                          primary.scheduleId && "cal-slot-busy",
                                        canDrag && "cal-slot-draggable",
                                      )}
                                      style={{
                                        top,
                                        height,
                                        left: "0.35rem",
                                        right: "0.35rem",
                                        zIndex: 2,
                                      }}
                                      draggable={canDrag}
                                      onDragStart={(event) =>
                                        onSlotDragStart(primary, event)
                                      }
                                      onDragEnd={onSlotDragEnd}
                                    >
                                      <button
                                        type="button"
                                        className="cal-slot-main"
                                        aria-label={`Open ${platforms
                                          .map(
                                            (platform) =>
                                              PLATFORM_LABELS[platform] ??
                                              platform,
                                          )
                                          .join(", ")} schedule at ${formatSlotTime(primary.scheduledAt, timeZone)}`}
                                        onClick={() =>
                                          openSchedule(primary.scheduleId)
                                        }
                                      >
                                        <span className="cal-slot-time">
                                          {formatSlotTime(
                                            primary.scheduledAt,
                                            timeZone,
                                          )}
                                        </span>
                                        <span
                                          className={cn(
                                            "cal-slot-status",
                                            statusClass(statusBucket),
                                          )}
                                        >
                                          {statusBucket}
                                        </span>
                                        <span className="cal-slot-account">
                                          {primary.accountLabel}
                                        </span>
                                        {primary.captionPreview ? (
                                          <span className="cal-slot-caption">
                                            {primary.captionPreview}
                                          </span>
                                        ) : (
                                          <span className="cal-slot-caption cal-slot-caption-empty">
                                            No caption yet
                                          </span>
                                        )}
                                        {primary.thumbUrl ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={primary.thumbUrl}
                                            alt=""
                                            className="cal-slot-thumb"
                                          />
                                        ) : null}
                                      </button>
                                      <span
                                        className="cal-slot-platform-marks"
                                        role="group"
                                        aria-label="Platforms"
                                      >
                                        {platforms.map((platform) => {
                                          const member = group.members.find(
                                            (slot) =>
                                              slot.platform === platform,
                                          );
                                          if (!member) return null;
                                          return (
                                            <button
                                              key={member.scheduleId}
                                              type="button"
                                              className="cal-slot-platform-mark-btn"
                                              title={
                                                PLATFORM_LABELS[platform] ??
                                                platform
                                              }
                                              aria-label={`Open ${PLATFORM_LABELS[platform] ?? platform} post`}
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                openSchedule(member.scheduleId);
                                              }}
                                            >
                                              <SlotPlatformMark
                                                platform={platform}
                                              />
                                            </button>
                                          );
                                        })}
                                      </span>
                                      <span
                                        className="cal-slot-resize-y"
                                        aria-hidden="true"
                                        onPointerDown={(event) =>
                                          beginSlotHeightResize(
                                            primary.scheduleId,
                                            event,
                                          )
                                        }
                                      />
                                    </div>
                                  );
                                },
                              )
                            )}
                          </div>
                          <span
                            className="cal-col-resize"
                            role="separator"
                            aria-orientation="vertical"
                            aria-label={`Resize ${day.weekdayLabel} column`}
                            onPointerDown={(event) =>
                              beginColumnResize(day.key, event)
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
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

      <ScheduleDetailModal
        scheduleId={selectedScheduleId}
        relatedScheduleIds={selectedRelatedScheduleIds}
        open={Boolean(selectedScheduleId)}
        accounts={accounts}
        onClose={() => {
          router.push(pathname || "/app/calendar", { scroll: false });
        }}
        onChanged={() => {
          void load();
        }}
      />
      <CreateScheduleModal
        open={Boolean(createDraft)}
        accounts={accounts}
        initialScheduledAt={createDraft?.scheduledAt ?? null}
        onClose={() => setCreateDraft(null)}
        onCreated={(scheduleId) => {
          setCreateDraft(null);
          void load();
          router.push(
            `/app/calendar?schedule=${encodeURIComponent(scheduleId)}`,
            { scroll: false },
          );
        }}
      />
    </AppShell>
  );
}
