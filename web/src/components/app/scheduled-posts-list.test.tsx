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
  },
];

beforeEach(() => {
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
      await screen.findByText(/Could not load scheduled posts \(SOCIALMCP_UNAVAILABLE\)/),
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
});
