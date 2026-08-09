import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  getCalendarAccounts,
  getCalendarSlots,
  type CalendarAccount,
  type CalendarSlot,
} from "@/lib/product-api";
import { ScheduleCalendar } from "./schedule-calendar";

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return {
    ...actual,
    getCalendarAccounts: vi.fn(),
    getCalendarSlots: vi.fn(),
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const accounts: CalendarAccount[] = [
  {
    id: "acct_1",
    platform: "threads",
    label: "Brand Co",
    username: "brand",
    avatarHint: null,
  },
];

function fixtureSlot(): CalendarSlot {
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
  };
}

beforeEach(() => {
  vi.mocked(getCalendarAccounts).mockReset();
  vi.mocked(getCalendarSlots).mockReset();
  vi.mocked(getCalendarAccounts).mockResolvedValue({ accounts });
  vi.mocked(getCalendarSlots).mockResolvedValue({
    slots: [fixtureSlot()],
    timeZone: "UTC",
  });
});

describe("ScheduleCalendar", () => {
  it("loads accounts and week slots (AC-1, AC-2)", async () => {
    render(<ScheduleCalendar />);

    expect(
      await screen.findByRole("button", { name: "Filter Brand Co" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Hello week")).toBeInTheDocument();
    expect(screen.getByTitle("Active display timezone")).toBeInTheDocument();
  });

  it("shows a retryable error without fake slots (AC-9)", async () => {
    vi.mocked(getCalendarSlots).mockRejectedValue(
      new ApiError(502, "SOCIALMCP_UNAVAILABLE", {}),
    );
    vi.mocked(getCalendarAccounts).mockResolvedValue({ accounts });

    render(<ScheduleCalendar />);

    expect(
      await screen.findByText(/Could not load schedules \(SOCIALMCP_UNAVAILABLE\)/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Hello week")).not.toBeInTheDocument();
  });

  it("filters by account when selected (AC-2)", async () => {
    const user = userEvent.setup();
    render(<ScheduleCalendar />);

    const accountBtn = await screen.findByRole("button", {
      name: "Filter Brand Co",
    });
    await user.click(accountBtn);

    await waitFor(() => {
      expect(getCalendarSlots).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: "acct_1" }),
      );
    });
  });
});
