import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  cancelCalendarSlot,
  getCalendarAccounts,
  getCalendarSlot,
  mirrorCalendarSlot,
  rescheduleCalendarSlot,
  rewriteCalendarSelection,
  updateCalendarSlotContent,
  type ScheduleDetail,
} from "@/lib/product-api";
import {
  cleanupScheduleUploads,
  uploadImagesForSchedule,
} from "@/lib/media-upload";
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

vi.mock("@/lib/media-upload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media-upload")>();
  return {
    ...actual,
    uploadImagesForSchedule: vi.fn(),
    cleanupScheduleUploads: vi.fn(),
  };
});

const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
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
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: vi.fn(() => false),
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  routerReplace.mockReset();
  vi.mocked(getCalendarSlot).mockReset();
  vi.mocked(getCalendarAccounts).mockReset();
  vi.mocked(updateCalendarSlotContent).mockReset();
  vi.mocked(mirrorCalendarSlot).mockReset();
  vi.mocked(cancelCalendarSlot).mockReset();
  vi.mocked(rescheduleCalendarSlot).mockReset();
  vi.mocked(rewriteCalendarSelection).mockReset();
  vi.mocked(uploadImagesForSchedule).mockReset();
  vi.mocked(cleanupScheduleUploads).mockReset();
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
  vi.mocked(cancelCalendarSlot).mockResolvedValue({
    ok: true,
    scheduleId: "sched_1",
  });
  vi.mocked(rewriteCalendarSelection).mockResolvedValue({
    suggestion: "Punchy hello",
  });
  vi.mocked(uploadImagesForSchedule).mockResolvedValue([]);
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
    expect(
      screen.getByRole("button", { name: /Add images for Brand Co/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add images for Brand LI/i }),
    ).toBeInTheDocument();
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

  it("restores related mirrored account and media state when reopened", async () => {
    vi.mocked(getCalendarSlot).mockImplementation(async (scheduleId) => {
      if (scheduleId === "sched_li" || scheduleId === "sched_li_duplicate") {
        return {
          ...detail,
          scheduleId,
          platform: "linkedin_personal",
          accountId: "acct_2",
          accountLabel: "Brand LI",
          media: ["https://cdn.example/linkedin.jpg"],
        };
      }
      return detail;
    });

    renderModal(
      <ScheduleDetailModal
        scheduleId="sched_1"
        relatedScheduleIds={[
          "sched_1",
          "sched_li",
          "sched_li_duplicate",
        ]}
        open
        onClose={() => undefined}
      />,
    );

    expect(
      await screen.findByLabelText(/Brand Co · Threads preview/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText(/Brand LI · LinkedIn preview/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByLabelText(/Brand LI · LinkedIn preview/i),
    ).toHaveLength(1);
    expect(screen.getAllByText("1/20 images")).toHaveLength(2);
    expect(
      document.querySelector('img[src="https://cdn.example/linkedin.jpg"]'),
    ).toBeTruthy();
    expect(screen.queryByText(/Schedule on Brand LI/i)).not.toBeInTheDocument();
  });

  it("enables Save when adding a platform to a past or canceled schedule", async () => {
    vi.mocked(getCalendarSlot).mockResolvedValue({
      ...detail,
      scheduledAt: "2020-01-01T01:05:00.000Z",
      statusBucket: "Canceled",
      canCancel: false,
    });
    renderModal(
      <ScheduleDetailModal scheduleId="sched_1" open onClose={() => undefined} />,
    );
    await screen.findByLabelText("Edit caption");
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /^LinkedIn/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Brand LI/i }));
    expect(await screen.findByText(/Schedule on Brand LI/i)).toBeInTheDocument();

    const pendingInput = screen.getByLabelText(/Schedule on Brand LI/i);
    expect(pendingInput).toHaveValue();
    const pendingValue = (pendingInput as HTMLInputElement).value;
    expect(new Date(pendingValue).getTime()).toBeGreaterThan(Date.now());
    expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
  });

  it("keeps Save disabled until a past pending time is fixed", async () => {
    renderModal(
      <ScheduleDetailModal scheduleId="sched_1" open onClose={() => undefined} />,
    );
    await screen.findByLabelText("Edit caption");
    await userEvent.click(screen.getByRole("button", { name: /^LinkedIn/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Brand LI/i }));
    expect(await screen.findByText(/Schedule on Brand LI/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();

    fireEvent.change(screen.getByLabelText(/Schedule on Brand LI/i), {
      target: { value: "2020-01-01T01:05" },
    });
    expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
    expect(
      screen.getByText(/Set a future time for each new account before saving/i),
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
        }),
      );
    });
    expect(mirrorCalendarSlot.mock.calls[0]?.[1]?.media).toBeUndefined();
    expect(rescheduleCalendarSlot).not.toHaveBeenCalled();
    expect(updateCalendarSlotContent).not.toHaveBeenCalled();
    expect(cancelCalendarSlot).not.toHaveBeenCalled();
    expect(await screen.findByText(/Also scheduled on LinkedIn/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Brand LI · LinkedIn preview/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Schedule on Brand LI/i)).not.toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("lets a new Instagram pane inherit source media through the mirror fallback", async () => {
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
          id: "acct_ig",
          platform: "instagram",
          label: "Brand IG",
          username: "brandig",
          avatarHint: null,
        },
      ],
    });
    vi.mocked(mirrorCalendarSlot).mockResolvedValue({
      created: [
        {
          ...detail,
          scheduleId: "sched_ig",
          platform: "instagram",
          accountId: "acct_ig",
          accountLabel: "Brand IG",
        },
      ],
    });
    renderModal(
      <ScheduleDetailModal scheduleId="sched_1" open onClose={() => undefined} />,
    );
    await screen.findByLabelText("Edit caption");

    await userEvent.click(screen.getByRole("button", { name: /^Instagram/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Brand IG/i }));

    expect(await screen.findByText(/Schedule on Brand IG/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mirrorCalendarSlot).toHaveBeenCalledWith(
        "sched_1",
        expect.objectContaining({
          targets: [
            expect.not.objectContaining({
              media: expect.any(Array),
            }),
          ],
        }),
      );
    });
  });

  it("deletes a new detail upload when the modal closes before save", async () => {
    vi.mocked(uploadImagesForSchedule).mockResolvedValueOnce([
      {
        assetId: "media_detail",
        externalUrl:
          "https://api.example/media/assets/media_detail/view?u=u&exp=1&sig=x",
        previewUrl: "blob:detail",
      },
    ]);
    const { container, rerender } = render(
      <ToastProvider>
        <ScheduleDetailModal scheduleId="sched_1" open onClose={() => undefined} />
      </ToastProvider>,
    );
    await screen.findByLabelText("Edit caption");
    await userEvent.click(screen.getByRole("button", { name: /Add images for Brand Co/i }));
    const fileInput = container.querySelector<HTMLInputElement>("input[type='file']");
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, {
      target: {
        files: [new File(["image"], "shot.jpg", { type: "image/jpeg" })],
      },
    });

    expect(await screen.findByText("Image 2 of 2")).toBeInTheDocument();
    rerender(
      <ToastProvider>
        <ScheduleDetailModal scheduleId="sched_1" open={false} onClose={() => undefined} />
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(cleanupScheduleUploads).toHaveBeenCalledWith(["media_detail"]);
    });
  });

  it("lets you uncheck the original platform and move the schedule", async () => {
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

    // Add a replacement account first — the sole selected account stays checked.
    await userEvent.click(screen.getByRole("button", { name: /^LinkedIn/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Brand LI/i }));
    expect(
      await screen.findByLabelText(/Brand LI · LinkedIn preview/i),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Threads, 1 account selected/i }),
    );
    const sourceCheckbox = screen.getByRole("checkbox", { name: /Brand Co/i });
    expect(sourceCheckbox).not.toBeDisabled();
    fireEvent.click(sourceCheckbox);

    await waitFor(() => {
      expect(
        screen.queryByLabelText(/Brand Co · Threads preview/i),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByLabelText(/Brand LI · LinkedIn preview/i),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mirrorCalendarSlot).toHaveBeenCalled();
      expect(cancelCalendarSlot).toHaveBeenCalledWith("sched_1");
    });
    expect(routerReplace).toHaveBeenCalledWith(
      "/app/calendar?schedule=sched_li",
    );
    expect(
      await screen.findByText(/Original platform schedule canceled/i),
    ).toBeInTheDocument();
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

  it("surfaces MCP detail messages from mirror failures", async () => {
    vi.mocked(mirrorCalendarSlot).mockRejectedValueOnce(
      new ApiError(422, "INVALID_CONTENT_UPDATE", {
        error: "INVALID_CONTENT_UPDATE",
        message: "[threads] Threads media URLs must use secure HTTPS",
      }),
    );
    renderModal(
      <ScheduleDetailModal scheduleId="sched_1" open onClose={() => undefined} />,
    );
    await screen.findByLabelText("Edit caption");
    await userEvent.click(screen.getByRole("button", { name: /^LinkedIn/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Brand LI/i }));
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(
      await screen.findByText(/Threads media URLs must use secure HTTPS/i),
    ).toBeInTheDocument();
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
