import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  getCalendarAccounts,
  getCalendarSlots,
  rescheduleCalendarSlot,
  type CalendarAccount,
  type CalendarSlot,
} from "@/lib/product-api";
import { ScheduleCalendar } from "./schedule-calendar";
import { ToastProvider } from "./toast-provider";

function renderCalendar(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return {
    ...actual,
    getCalendarAccounts: vi.fn(),
    getCalendarSlots: vi.fn(),
    rescheduleCalendarSlot: vi.fn(),
  };
});

vi.mock("./app-shell", () => ({
  AppShell: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title?: string;
  }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

vi.mock("./schedule-detail-modal", () => ({
  ScheduleDetailModal: ({
    scheduleId,
    open,
  }: {
    scheduleId: string | null;
    open: boolean;
  }) =>
    open && scheduleId ? (
      <div role="dialog" aria-label={`Schedule ${scheduleId}`}>
        Modal {scheduleId}
      </div>
    ) : null,
}));

const pushMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/app/calendar",
  useSearchParams: () => searchParams,
}));

const accounts: CalendarAccount[] = [
  {
    id: "acct_1",
    platform: "threads",
    label: "Brand Co",
    username: "brand",
    avatarHint: "https://cdn.example/avatar.jpg",
  },
  {
    id: "acct_2",
    platform: "linkedin_personal",
    label: "Abdulbasit Yakubu",
    username: "yakubuabdulbasit345@gmail.com",
    avatarHint: "https://media.licdn.com/dms/image/avatar.jpg",
  },
];

function fixtureSlot(overrides: Partial<CalendarSlot> = {}): CalendarSlot {
  const midWeek = new Date();
  midWeek.setHours(12, 0, 0, 0);
  return {
    scheduleId: "sched_1",
    platform: "threads",
    accountId: "acct_1",
    accountLabel: "Brand Co",
    scheduledAt: midWeek.toISOString(),
    statusBucket: "Scheduled",
    captionPreview: "Hello week",
    thumbUrl: null,
    canReschedule: true,
    ...overrides,
  };
}

beforeEach(() => {
  pushMock.mockReset();
  searchParams = new URLSearchParams();
  vi.mocked(getCalendarAccounts).mockReset();
  vi.mocked(getCalendarSlots).mockReset();
  vi.mocked(rescheduleCalendarSlot).mockReset();
  vi.mocked(getCalendarAccounts).mockResolvedValue({ accounts });
  vi.mocked(getCalendarSlots).mockResolvedValue({
    slots: [fixtureSlot()],
    timeZone: "UTC",
  });
  vi.mocked(rescheduleCalendarSlot).mockResolvedValue({
    ...fixtureSlot(),
    caption: "Hello week",
    media: [],
    conversationId: null,
    draftId: null,
    canCancel: true,
    canEditContent: true,
  });
});

describe("ScheduleCalendar", () => {
  it("loads accounts and week slots (AC-1, AC-2)", async () => {
    renderCalendar(<ScheduleCalendar />);

    expect(
      await screen.findByRole("button", { name: "All accounts" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Filter by platform accounts" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Threads/i })).toBeInTheDocument();
    expect(await screen.findByText("Hello week")).toBeInTheDocument();
    expect(screen.getByTitle("Active display timezone")).toBeInTheDocument();
  });

  it("opens multi-account platform popovers with avatar chrome", async () => {
    const user = userEvent.setup();
    vi.mocked(getCalendarAccounts).mockResolvedValue({
      accounts: [
        accounts[0]!,
        {
          id: "acct_t2",
          platform: "threads",
          label: "Brand Two",
          username: "brand2",
          avatarHint: "https://cdn.example/avatar2.jpg",
        },
        accounts[1]!,
      ],
    });
    renderCalendar(<ScheduleCalendar />);

    await user.click(await screen.findByRole("button", { name: /^Threads/i }));
    expect(
      screen.getByRole("dialog", { name: /Threads accounts/i }),
    ).toBeInTheDocument();

    const brandCo = screen.getByRole("checkbox", { name: /Brand Co/i });
    const avatar = brandCo
      .closest("label")
      ?.querySelector("img.pap-account-avatar-img");
    expect(avatar).toHaveAttribute("src", "https://cdn.example/avatar.jpg");
    expect(avatar).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(screen.getByText("@brand2")).toBeInTheDocument();
  });

  it("shows a retryable error without fake slots (AC-9)", async () => {
    vi.mocked(getCalendarSlots).mockRejectedValue(
      new ApiError(502, "SOCIALMCP_UNAVAILABLE", {}),
    );
    vi.mocked(getCalendarAccounts).mockResolvedValue({ accounts });

    renderCalendar(<ScheduleCalendar />);

    expect(
      await screen.findByText(/We could not reach the social account service/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Hello week")).not.toBeInTheDocument();
  });

  it("filters by account when selected (AC-2)", async () => {
    const user = userEvent.setup();
    renderCalendar(<ScheduleCalendar />);

    expect(await screen.findByRole("button", { name: "All accounts" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Threads/i }));

    await waitFor(() => {
      expect(getCalendarSlots).toHaveBeenCalledWith(
        expect.objectContaining({ accountIds: ["acct_1"] }),
      );
    });
  });

  it("filters by multiple account ids across platforms", async () => {
    const user = userEvent.setup();
    renderCalendar(<ScheduleCalendar />);

    await screen.findByRole("button", { name: "All accounts" });
    await user.click(screen.getByRole("button", { name: /^Threads/i }));
    await user.click(screen.getByRole("button", { name: /^LinkedIn/i }));

    await waitFor(() => {
      expect(getCalendarSlots).toHaveBeenCalledWith(
        expect.objectContaining({
          accountIds: expect.arrayContaining(["acct_1", "acct_2"]),
        }),
      );
    });
  });

  it("renders canceled slots with inactive hatch styling and still opens detail", async () => {
    vi.mocked(getCalendarSlots).mockResolvedValue({
      slots: [
        fixtureSlot({
          scheduleId: "sched_canceled",
          statusBucket: "Canceled",
          canReschedule: true,
          captionPreview: "Canceled caption",
        }),
      ],
      timeZone: "UTC",
    });

    renderCalendar(<ScheduleCalendar />);
    await screen.findByText("Canceled caption");

    const slot = document.querySelector(".cal-slot");
    expect(slot).toHaveClass("cal-slot-inactive");
    expect(slot).toHaveClass("cal-slot-draggable");
  });

  it("merges same-minute multi-platform slots into one card with side-by-side icons", async () => {
    const at = fixtureSlot().scheduledAt;
    vi.mocked(getCalendarSlots).mockResolvedValue({
      slots: [
        fixtureSlot({
          scheduleId: "sched_threads",
          platform: "threads",
          accountId: "acct_1",
          accountLabel: "Brand Co",
          scheduledAt: at,
          captionPreview: "Shared minute",
        }),
        fixtureSlot({
          scheduleId: "sched_li",
          platform: "linkedin_personal",
          accountId: "acct_2",
          accountLabel: "Abdulbasit Yakubu",
          scheduledAt: at,
          captionPreview: "Shared minute",
        }),
      ],
      timeZone: "UTC",
    });

    renderCalendar(<ScheduleCalendar />);
    await screen.findByText("Shared minute");

    expect(document.querySelectorAll(".cal-slot")).toHaveLength(1);
    expect(document.querySelectorAll(".cal-slot-platform-mark")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Open Threads post" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open LinkedIn post" }),
    ).toBeInTheDocument();
  });

  it("drag-drop persists a new timed schedule and shows the drop guide", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-10T15:00:00.000Z")); // Monday

    vi.mocked(getCalendarSlots).mockResolvedValue({
      slots: [
        fixtureSlot({
          scheduledAt: new Date("2026-08-10T16:00:00.000Z").toISOString(),
        }),
      ],
      timeZone: "UTC",
    });

    renderCalendar(<ScheduleCalendar />);
    await screen.findByText("Hello week");
    expect(document.querySelector(".cal-slot-platform-mark")).toBeTruthy();

    const slot = document.querySelector(".cal-slot") as HTMLElement;
    const days = Array.from(document.querySelectorAll(".cal-day"));
    expect(slot).toBeTruthy();
    expect(days.length).toBeGreaterThan(1);

    const sourceDay = slot.closest(".cal-day");
    // Prefer a later weekday so clampDropMinutes does not reject a past column.
    const targetDay = [...days]
      .reverse()
      .find((day) => day !== sourceDay) as HTMLElement;
    expect(targetDay).toBeTruthy();

    const dataTransfer = {
      effectAllowed: "move",
      dropEffect: "move",
      setData: vi.fn(),
      getData: vi.fn(() => "sched_1"),
      setDragImage: vi.fn(),
    };

    fireEvent.dragStart(slot, { dataTransfer });
    const canvas = targetDay.querySelector(".cal-day-canvas") as HTMLElement;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      value: () => ({
        top: 0,
        left: 0,
        bottom: 1400,
        right: 200,
        width: 200,
        height: 1400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    const dragOverEvent = createEvent.dragOver(targetDay, { dataTransfer });
    Object.defineProperty(dragOverEvent, "clientY", { value: 56 * 17 });
    Object.defineProperty(dragOverEvent, "dataTransfer", { value: dataTransfer });
    fireEvent(targetDay, dragOverEvent);

    await waitFor(() => {
      expect(screen.getByTestId("cal-drop-guide-time").textContent).toMatch(
        /5:00 PM/,
      );
    });
    expect(screen.getByTestId("cal-drop-guide")).toBeInTheDocument();

    const dropEvent = createEvent.drop(targetDay, { dataTransfer });
    Object.defineProperty(dropEvent, "clientY", { value: 56 * 17 });
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
    fireEvent(targetDay, dropEvent);
    fireEvent.dragEnd(slot, { dataTransfer });

    await waitFor(() => {
      expect(rescheduleCalendarSlot).toHaveBeenCalledWith(
        "sched_1",
        expect.any(String),
      );
    });
    expect(await screen.findByText(/Moved to/i)).toBeInTheDocument();
    expect(screen.getByText("Hello week")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("rejects drops onto past days without calling reschedule", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Wednesday — Monday of this week is entirely in the past
    vi.setSystemTime(new Date("2026-08-12T15:00:00.000Z"));

    vi.mocked(getCalendarSlots).mockResolvedValue({
      slots: [
        fixtureSlot({
          scheduledAt: new Date("2026-08-12T16:00:00.000Z").toISOString(),
        }),
      ],
      timeZone: "UTC",
    });

    renderCalendar(<ScheduleCalendar />);
    await screen.findByText("Hello week");

    const slot = document.querySelector(".cal-slot") as HTMLElement;
    const days = Array.from(document.querySelectorAll(".cal-day"));
    const monday = days[0] as HTMLElement;
    expect(monday).toBeTruthy();

    const dataTransfer = {
      effectAllowed: "move",
      dropEffect: "move",
      setData: vi.fn(),
      getData: vi.fn(() => "sched_1"),
    };

    fireEvent.dragStart(slot, { dataTransfer });
    const canvas = monday.querySelector(".cal-day-canvas") as HTMLElement;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      value: () => ({
        top: 0,
        left: 0,
        bottom: 1400,
        right: 200,
        width: 200,
        height: 1400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    const dragOverEvent = createEvent.dragOver(monday, { dataTransfer });
    Object.defineProperty(dragOverEvent, "clientY", { value: 56 * 10 });
    Object.defineProperty(dragOverEvent, "dataTransfer", { value: dataTransfer });
    fireEvent(monday, dragOverEvent);

    const dropEvent = createEvent.drop(monday, { dataTransfer });
    Object.defineProperty(dropEvent, "clientY", { value: 56 * 10 });
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
    fireEvent(monday, dropEvent);

    expect(
      await screen.findByText(/Pick a future time/i),
    ).toBeInTheDocument();
    expect(rescheduleCalendarSlot).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("opens schedule detail as an in-place modal via ?schedule=", async () => {
    searchParams = new URLSearchParams("schedule=sched_1");
    renderCalendar(<ScheduleCalendar />);

    expect(
      await screen.findByRole("dialog", { name: "Schedule sched_1" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Back to calendar")).not.toBeInTheDocument();
  });

  it("sets ?schedule= when a slot is opened instead of navigating to a detail page", async () => {
    renderCalendar(<ScheduleCalendar />);
    const open = await screen.findByRole("button", {
      name: /Open Threads schedule at/i,
    });
    await userEvent.click(open);
    expect(pushMock).toHaveBeenCalledWith(
      "/app/calendar?schedule=sched_1",
      { scroll: false },
    );
    expect(pushMock).not.toHaveBeenCalledWith("/app/calendar/sched_1");
  });
});
