import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  getCalendarAccounts,
  getCalendarSlot,
  mirrorCalendarSlot,
  rescheduleCalendarSlot,
  rewriteCalendarSelection,
  updateCalendarSlotContent,
  type ScheduleDetail,
} from "@/lib/product-api";
import { ScheduleDetailModal } from "./schedule-detail-modal";
import { ToastProvider } from "./toast-provider";

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return {
    ...actual,
    getCalendarAccounts: vi.fn(),
    getCalendarSlot: vi.fn(),
    updateCalendarSlotContent: vi.fn(),
    mirrorCalendarSlot: vi.fn(),
    cancelCalendarSlot: vi.fn(),
    rescheduleCalendarSlot: vi.fn(),
    rewriteCalendarSelection: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderModal(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

vi.mock("motion/react", async () => {
  function stripMotionProps<T extends Record<string, unknown>>(props: T) {
    const {
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...rest
    } = props;
    return rest;
  }
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      button: ({ children, ...props }: React.ComponentProps<"button">) => (
        <button {...stripMotionProps(props as Record<string, unknown>)}>
          {children}
        </button>
      ),
      div: ({ children, ...props }: React.ComponentProps<"div">) => (
        <div {...stripMotionProps(props as Record<string, unknown>)}>
          {children}
        </div>
      ),
    },
    useReducedMotion: () => true,
  };
});

const detail: ScheduleDetail = {
  scheduleId: "sched_1",
  platform: "threads",
  accountId: "acct_1",
  accountLabel: "Brand Co",
  scheduledAt: "2099-08-10T12:00:00.000Z",
  statusBucket: "Scheduled",
  captionPreview: "Hello week",
  thumbUrl: null,
  caption: "Hello week",
  media: ["https://cdn.example/a.jpg"],
  conversationId: null,
  draftId: null,
  canReschedule: true,
  canCancel: true,
  canEditContent: true,
};

beforeEach(() => {
  vi.mocked(getCalendarSlot).mockReset();
  vi.mocked(getCalendarAccounts).mockReset();
  vi.mocked(updateCalendarSlotContent).mockReset();
  vi.mocked(mirrorCalendarSlot).mockReset();
  vi.mocked(rescheduleCalendarSlot).mockReset();
  vi.mocked(rewriteCalendarSelection).mockReset();
  vi.mocked(getCalendarSlot).mockResolvedValue(detail);
  vi.mocked(getCalendarAccounts).mockResolvedValue({
    accounts: [
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
        label: "Brand LI",
        username: "brandli",
        avatarHint: null,
      },
    ],
  });
  vi.mocked(updateCalendarSlotContent).mockResolvedValue({
    ...detail,
    caption: "Updated caption",
  });
  vi.mocked(mirrorCalendarSlot).mockResolvedValue({
    created: [
      {
        ...detail,
        scheduleId: "sched_li",
        platform: "linkedin_personal",
        accountId: "acct_2",
        accountLabel: "Brand LI",
      },
    ],
  });
  vi.mocked(rewriteCalendarSelection).mockResolvedValue({
    suggestion: "Punchy hello",
  });
});

describe("ScheduleDetailModal", () => {
  it("opens a full-bleed preview modal with header timing actions", async () => {
    const onClose = vi.fn();
    renderModal(
      <ScheduleDetailModal
        scheduleId="sched_1"
        open
        onClose={onClose}
      />,
    );

    expect(
      await screen.findByRole("dialog", { name: /scheduled post/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Edit caption")).toHaveValue("Hello week");
    expect(screen.queryByRole("heading", { name: "Caption" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Media" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "When it goes out" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save new time" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancel schedule" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toHaveClass(
      "cal-btn-primary",
    );
    expect(document.querySelector(".cal-modal-footer")).toBeTruthy();
    expect(document.querySelector(".cal-modal-body-preview")).toBeTruthy();
    expect(document.querySelector(".cal-modal-preview-row")).toBeTruthy();
    expect(screen.getByLabelText("Target accounts")).toBeInTheDocument();
    expect(screen.getByLabelText("Close")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("toggles a second account preview beside the schedule account", async () => {
    renderModal(
      <ScheduleDetailModal scheduleId="sched_1" open onClose={() => undefined} />,
    );
    await screen.findByLabelText("Edit caption");
    expect(
      screen.getByLabelText(/Brand Co · Threads preview/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Brand LI · LinkedIn preview/i),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^LinkedIn/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Brand LI/i }));
    expect(
      await screen.findByLabelText(/Brand LI · LinkedIn preview/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Brand Co · Threads preview/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Schedule on Brand LI/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
    // Caption stays editable on every selected column (shared state).
    expect(screen.getAllByLabelText("Edit caption").length).toBeGreaterThanOrEqual(2);

    const captions = screen.getAllByLabelText("Edit caption") as HTMLTextAreaElement[];
    const mirrorCaption = captions[captions.length - 1]!;
    mirrorCaption.focus();
    mirrorCaption.setSelectionRange(0, 5);
    fireEvent.select(mirrorCaption);
    expect(
      await screen.findByRole("toolbar", { name: "Rewrite selection" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tweak" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();

    // Popover stays open after check; uncheck without re-toggling the platform button.
    fireEvent.click(screen.getByRole("checkbox", { name: /Brand LI/i }));
    await waitFor(() => {
      expect(
        screen.queryByLabelText(/Brand LI · LinkedIn preview/i),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByLabelText(/Brand Co · Threads preview/i),
    ).toBeInTheDocument();
  });

  it("mirrors a pending account through Save changes without reschedule", async () => {
    const onChanged = vi.fn();
    renderModal(
      <ScheduleDetailModal
        scheduleId="sched_1"
        open
        onClose={() => undefined}
        onChanged={onChanged}
      />,
    );
    await screen.findByLabelText("Edit caption");
    await userEvent.click(screen.getByRole("button", { name: /^LinkedIn/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Brand LI/i }));
    expect(await screen.findByText(/Schedule on Brand LI/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mirrorCalendarSlot).toHaveBeenCalledWith(
        "sched_1",
        expect.objectContaining({
          targets: [
            expect.objectContaining({
              platform: "linkedin_personal",
              accountId: "acct_2",
            }),
          ],
          caption: "Hello week",
          media: ["https://cdn.example/a.jpg"],
        }),
      );
    });
    expect(rescheduleCalendarSlot).not.toHaveBeenCalled();
    expect(updateCalendarSlotContent).not.toHaveBeenCalled();
    expect(await screen.findByText(/Also scheduled on LinkedIn/i)).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("mirrors onto two Threads accounts from the same source schedule", async () => {
    vi.mocked(getCalendarAccounts).mockResolvedValue({
      accounts: [
        {
          id: "acct_1",
          platform: "threads",
          label: "Brand Co",
          username: "brand",
          avatarHint: null,
        },
        {
          id: "acct_t2",
          platform: "threads",
          label: "Brand Two",
          username: "brand2",
          avatarHint: null,
        },
        {
          id: "acct_t3",
          platform: "threads",
          label: "Brand Three",
          username: "brand3",
          avatarHint: null,
        },
      ],
    });
    vi.mocked(mirrorCalendarSlot).mockResolvedValue({
      created: [
        {
          ...detail,
          scheduleId: "sched_t2",
          accountId: "acct_t2",
          accountLabel: "Brand Two",
        },
        {
          ...detail,
          scheduleId: "sched_t3",
          accountId: "acct_t3",
          accountLabel: "Brand Three",
        },
      ],
    });

    renderModal(
      <ScheduleDetailModal scheduleId="sched_1" open onClose={() => undefined} />,
    );
    await screen.findByLabelText("Edit caption");

    await userEvent.click(
      screen.getByRole("button", { name: /Threads, 1 account selected/i }),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /Brand Two/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Brand Three/i }));

    expect(await screen.findByText(/Schedule on Brand Two/i)).toBeInTheDocument();
    expect(screen.getByText(/Schedule on Brand Three/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mirrorCalendarSlot).toHaveBeenCalledWith(
        "sched_1",
        expect.objectContaining({
          targets: expect.arrayContaining([
            expect.objectContaining({
              platform: "threads",
              accountId: "acct_t2",
            }),
            expect.objectContaining({
              platform: "threads",
              accountId: "acct_t3",
            }),
          ]),
        }),
      );
    });
  });

  it("shows an error toast when mirror returns no created schedules", async () => {
    vi.mocked(mirrorCalendarSlot).mockResolvedValue({ created: [] });
    renderModal(
      <ScheduleDetailModal
        scheduleId="sched_1"
        open
        onClose={() => undefined}
      />,
    );
    await screen.findByLabelText("Edit caption");
    await userEvent.click(screen.getByRole("button", { name: /^LinkedIn/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Brand LI/i }));
    expect(await screen.findByText(/Schedule on Brand LI/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(
      await screen.findByText(/No additional schedules were created/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Also scheduled on/i)).not.toBeInTheDocument();
  });

  it("saves caption edits through the content patch helper", async () => {
    renderModal(
      <ScheduleDetailModal scheduleId="sched_1" open onClose={() => undefined} />,
    );
    const caption = await screen.findByLabelText("Edit caption");
    fireEvent.change(caption, { target: { value: "Updated caption" } });
    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );

    await waitFor(() => {
      expect(updateCalendarSlotContent).toHaveBeenCalledWith("sched_1", {
        caption: "Updated caption",
      });
    });
    expect(rescheduleCalendarSlot).not.toHaveBeenCalled();
  });

  it("shows load errors without crashing", async () => {
    vi.mocked(getCalendarSlot).mockRejectedValueOnce(
      new ApiError(404, "SCHEDULE_NOT_FOUND", {}),
    );
    renderModal(
      <ScheduleDetailModal scheduleId="missing" open onClose={() => undefined} />,
    );
    expect(
      await screen.findByText(/This schedule was not found/i),
    ).toBeInTheDocument();
  });

  it("shows action errors as save failures, not load failures", async () => {
    vi.mocked(updateCalendarSlotContent).mockRejectedValueOnce(
      new ApiError(502, "INVALID_SCHEDULE_RESPONSE", {}),
    );
    renderModal(
      <ScheduleDetailModal scheduleId="sched_1" open onClose={() => undefined} />,
    );
    const caption = await screen.findByLabelText("Edit caption");
    fireEvent.change(caption, { target: { value: "Updated caption" } });
    await userEvent.click(
      screen.getByRole("button", { name: /save changes/i }),
    );
    expect(
      await screen.findByText(/Schedule data came back incomplete/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/This schedule was not found/i),
    ).not.toBeInTheDocument();
  });

  it("regenerates a selection immediately from the floating toolbar", async () => {
    renderModal(
      <ScheduleDetailModal scheduleId="sched_1" open onClose={() => undefined} />,
    );
    const caption = (await screen.findByLabelText(
      "Edit caption",
    )) as HTMLTextAreaElement;
    caption.focus();
    caption.setSelectionRange(0, 5);
    fireEvent.select(caption);

    expect(
      await screen.findByRole("toolbar", { name: "Rewrite selection" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Regenerate" }));

    await waitFor(() => {
      expect(rewriteCalendarSelection).toHaveBeenCalledWith("sched_1", {
        selection: "Hello",
        action: "regenerate",
      });
    });

    expect(await screen.findByText("Punchy hello")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(caption).toHaveValue("Punchy hello week");
  });

  it("opens a compact tweak input before rewriting", async () => {
    renderModal(
      <ScheduleDetailModal scheduleId="sched_1" open onClose={() => undefined} />,
    );
    const caption = (await screen.findByLabelText(
      "Edit caption",
    )) as HTMLTextAreaElement;
    caption.focus();
    caption.setSelectionRange(0, 5);
    fireEvent.select(caption);

    await userEvent.click(await screen.findByRole("button", { name: "Tweak" }));
    await userEvent.type(
      screen.getByLabelText("Tweak instruction"),
      "make it punchy",
    );
    await userEvent.click(screen.getByRole("button", { name: "Go" }));

    await waitFor(() => {
      expect(rewriteCalendarSelection).toHaveBeenCalledWith("sched_1", {
        selection: "Hello",
        action: "tweak",
        instruction: "make it punchy",
      });
    });
  });
});
