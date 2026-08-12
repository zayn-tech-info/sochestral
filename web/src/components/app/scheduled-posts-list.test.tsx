import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  getCalendarAccounts,
  getScheduledPosts,
  type CalendarAccount,
  type CalendarSlot,
} from "@/lib/product-api";
import { ScheduledPostsList } from "./scheduled-posts-list";

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return {
    ...actual,
    getCalendarAccounts: vi.fn(),
    getScheduledPosts: vi.fn(),
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

vi.mock("./create-schedule-modal", () => ({
  CreateScheduleModal: ({
    open,
    initialScheduledAt,
  }: {
    open: boolean;
    initialScheduledAt: string | null;
  }) =>
    open ? (
      <div
        role="dialog"
        aria-label="Create schedule"
        data-scheduled-at={initialScheduledAt ?? ""}
      >
        Create board
      </div>
    ) : null,
}));

const pushMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/app/scheduled",
  useSearchParams: () => searchParams,
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

const posts: CalendarSlot[] = [
  {
    scheduleId: "sched_1",
    platform: "threads",
    accountId: "acct_1",
    accountLabel: "Brand Co",
    scheduledAt: new Date().toISOString(),
    statusBucket: "Scheduled",
    captionPreview: "Hello list",
    thumbUrl: null,
    canReschedule: true,
  },
];

beforeEach(() => {
  pushMock.mockReset();
  searchParams = new URLSearchParams();
  vi.mocked(getCalendarAccounts).mockReset();
  vi.mocked(getScheduledPosts).mockReset();
  vi.mocked(getCalendarAccounts).mockResolvedValue({ accounts });
  vi.mocked(getScheduledPosts).mockResolvedValue({
    posts,
    timeZone: "UTC",
    from: new Date().toISOString(),
    to: new Date(Date.now() + 30 * 86400000).toISOString(),
    sort: "scheduledAt:asc",
    hasOlder: false,
    hasNewer: false,
  });
});

describe("ScheduledPostsList", () => {
  it("loads the default upcoming list (AC-1, AC-2)", async () => {
    render(<ScheduledPostsList />);
    expect(await screen.findByText("Hello list")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Week view" })).toHaveAttribute(
      "href",
      "/app/calendar",
    );
  });

  it("opens the create schedule board from Schedule post", async () => {
    const user = userEvent.setup();
    render(<ScheduledPostsList />);
    await screen.findByText("Hello list");

    expect(
      screen.queryByRole("dialog", { name: "Create schedule" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Schedule post" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Create schedule",
    });
    expect(dialog).toBeInTheDocument();
    expect(dialog.getAttribute("data-scheduled-at")).toBeTruthy();
  });

  it("shows empty CTAs when there are no accounts (AC-11)", async () => {
    vi.mocked(getCalendarAccounts).mockResolvedValue({ accounts: [] });
    vi.mocked(getScheduledPosts).mockResolvedValue({
      posts: [],
      timeZone: "UTC",
      from: new Date().toISOString(),
      to: new Date(Date.now() + 30 * 86400000).toISOString(),
      sort: "scheduledAt:asc",
      hasOlder: false,
      hasNewer: false,
    });
    render(<ScheduledPostsList />);
    expect(await screen.findByText("Nothing to see here.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat with Soc" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create post" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Connect an account" }),
    ).toHaveAttribute("href", "/app/settings/connectors");
  });

  it("shows a retryable error without fake rows (AC-8)", async () => {
    vi.mocked(getScheduledPosts).mockRejectedValue(
      new ApiError(502, "SOCIALMCP_UNAVAILABLE", {}),
    );
    render(<ScheduledPostsList />);
    expect(
      await screen.findByText(/We could not reach the social account service/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Hello list")).not.toBeInTheDocument();
  });

  it("requests Done with a backward looking window (AC-4)", async () => {
    const user = userEvent.setup();
    render(<ScheduledPostsList />);
    await screen.findByText("Hello list");
    await user.selectOptions(screen.getByLabelText("Status"), "Done");
    await waitFor(() => {
      expect(getScheduledPosts).toHaveBeenCalledWith(
        expect.objectContaining({ status: "Done" }),
      );
    });
  });

  it("opens the schedule modal in place from a row click", async () => {
    render(<ScheduledPostsList />);
    await screen.findByText("Hello list");
    await userEvent.click(screen.getByText("Hello list"));
    expect(pushMock).toHaveBeenCalledWith(
      "/app/scheduled?schedule=sched_1",
      { scroll: false },
    );
  });
});
