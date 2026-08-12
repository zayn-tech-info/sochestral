import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  composeCalendarCaptions,
  createCalendarSlots,
  rewriteCaptionSelection,
  type CalendarAccount,
} from "@/lib/product-api";
import {
  cleanupScheduleUploads,
  uploadImagesForSchedule,
} from "@/lib/media-upload";
import { CreateScheduleModal } from "./create-schedule-modal";
import { ToastProvider } from "./toast-provider";

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return {
    ...actual,
    createCalendarSlots: vi.fn(),
    composeCalendarCaptions: vi.fn(),
    rewriteCaptionSelection: vi.fn(),
    apiRequest: vi.fn(),
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

function renderModal(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

const accounts: CalendarAccount[] = [
  {
    id: "acct_1",
    platform: "threads",
    label: "Brand Co",
    username: "brand",
    avatarHint: "https://cdn.example/avatar.jpg",
  },
  {
    id: "acct_li",
    platform: "linkedin_personal",
    label: "Brand LI",
    username: "brandli",
    avatarHint: "https://cdn.example/li.jpg",
  },
];

const futureLocal = (() => {
  const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
})();

beforeEach(() => {
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.mocked(createCalendarSlots).mockReset();
  vi.mocked(composeCalendarCaptions).mockReset();
  vi.mocked(rewriteCaptionSelection).mockReset();
  vi.mocked(uploadImagesForSchedule).mockReset();
  vi.mocked(cleanupScheduleUploads).mockReset();
  vi.mocked(createCalendarSlots).mockResolvedValue({
    created: [
      {
        scheduleId: "sched_new",
        platform: "threads",
        accountId: "acct_1",
        accountLabel: "Brand Co",
        scheduledAt: new Date(futureLocal).toISOString(),
        statusBucket: "Scheduled",
        captionPreview: "Launch note",
        thumbUrl: null,
        caption: "Launch note",
        media: [],
        conversationId: null,
        draftId: null,
        canReschedule: true,
        canCancel: true,
        canEditContent: true,
      },
    ],
  });
  vi.mocked(composeCalendarCaptions).mockResolvedValue({
    assistantText: "Drafted for LinkedIn.",
    updates: [{ accountId: "acct_li", caption: "LI professional draft" }],
  });
  vi.mocked(rewriteCaptionSelection).mockResolvedValue({
    suggestion: "Fresh launch note",
  });
  vi.mocked(uploadImagesForSchedule).mockResolvedValue([]);
});

describe("CreateScheduleModal", () => {
  it("keeps Save disabled until account and caption are set", async () => {
    const user = userEvent.setup();
    renderModal(
      <CreateScheduleModal
        open
        accounts={accounts}
        initialScheduledAt={new Date(futureLocal).toISOString()}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Create schedule" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save schedule" }),
    ).toBeDisabled();
    expect(
      screen.getByLabelText("Caption (select an account first)"),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^Threads$/i }));
    await user.click(screen.getByRole("checkbox", { name: /Brand Co/i }));

    expect(
      screen.getByRole("button", { name: "Save schedule" }),
    ).toBeDisabled();

    const caption = screen.getByLabelText("Edit caption");
    await user.clear(caption);
    await user.type(caption, "Launch note");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Save schedule" }),
      ).toBeEnabled();
    });
  });

  it("shows multiple preview panes and enables Soc draft after accounts are selected", async () => {
    const user = userEvent.setup();
    renderModal(
      <CreateScheduleModal
        open
        accounts={accounts}
        initialScheduledAt={new Date(futureLocal).toISOString()}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Draft with Soc" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Soc writes straight into the selected previews/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Threads$/i }));
    await user.click(screen.getByRole("checkbox", { name: /Brand Co/i }));
    await user.click(screen.getByRole("button", { name: /^LinkedIn$/i }));
    await user.click(screen.getByRole("checkbox", { name: /Brand LI/i }));

    expect(
      screen.getByLabelText(/Brand Co · Threads preview/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Brand LI · LinkedIn preview/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Draft with Soc" }),
    ).toBeEnabled();
  });

  it("writes Soc compose updates into the named platform caption without chat feedback", async () => {
    const user = userEvent.setup();
    renderModal(
      <CreateScheduleModal
        open
        accounts={accounts}
        initialScheduledAt={new Date(futureLocal).toISOString()}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Threads$/i }));
    await user.click(screen.getByRole("checkbox", { name: /Brand Co/i }));
    await user.click(screen.getByRole("button", { name: /^LinkedIn$/i }));
    await user.click(screen.getByRole("checkbox", { name: /Brand LI/i }));

    await user.type(
      screen.getByLabelText("Ask Soc to draft captions"),
      "Write a LinkedIn version",
    );
    await user.click(screen.getByRole("button", { name: "Draft with Soc" }));

    await waitFor(() => {
      expect(composeCalendarCaptions).toHaveBeenCalled();
    });
    expect(
      await screen.findByDisplayValue("LI professional draft"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Drafted for LinkedIn.")).not.toBeInTheDocument();
    expect(await screen.findByText("Captions updated.")).toBeInTheDocument();
  });

  it("batch-creates calendar slots and notifies onCreated", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();

    renderModal(
      <CreateScheduleModal
        open
        accounts={accounts}
        initialScheduledAt={new Date(futureLocal).toISOString()}
        onClose={vi.fn()}
        onCreated={onCreated}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Threads$/i }));
    await user.click(screen.getByRole("checkbox", { name: /Brand Co/i }));

    const caption = screen.getByLabelText("Edit caption");
    await user.clear(caption);
    await user.type(caption, "Launch note");

    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    await waitFor(() => {
      expect(createCalendarSlots).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: [
            expect.objectContaining({
              platform: "threads",
              accountId: "acct_1",
              caption: "Launch note",
            }),
          ],
        }),
      );
    });
    expect(onCreated).toHaveBeenCalledWith("sched_new");
    expect(await screen.findByText("Scheduled.")).toBeInTheDocument();
  });

  it("places an Add images control on each selected preview pane", async () => {
    const user = userEvent.setup();
    renderModal(
      <CreateScheduleModal
        open
        accounts={accounts}
        initialScheduledAt={new Date(futureLocal).toISOString()}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /^Add images$/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Threads$/i }));
    await user.click(screen.getByRole("checkbox", { name: /Brand Co/i }));
    await user.click(screen.getByRole("button", { name: /^LinkedIn$/i }));
    await user.click(screen.getByRole("checkbox", { name: /Brand LI/i }));

    expect(
      screen.getByRole("button", { name: /Add images for Brand Co/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add images for Brand LI/i }),
    ).toBeInTheDocument();
  });

  it("deletes a new upload when it is removed before save", async () => {
    const user = userEvent.setup();
    vi.mocked(uploadImagesForSchedule).mockResolvedValueOnce([
      {
        assetId: "media_new",
        externalUrl:
          "https://api.example/media/assets/media_new/view?u=u&exp=1&sig=x",
        previewUrl: "blob:preview",
      },
    ]);
    const { container } = renderModal(
      <CreateScheduleModal
        open
        accounts={accounts}
        initialScheduledAt={new Date(futureLocal).toISOString()}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Threads$/i }));
    await user.click(screen.getByRole("checkbox", { name: /Brand Co/i }));
    await user.click(screen.getByRole("button", { name: /Add images for Brand Co/i }));
    const fileInput = container.querySelector<HTMLInputElement>("input[type='file']");
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, {
      target: {
        files: [new File(["image"], "shot.jpg", { type: "image/jpeg" })],
      },
    });

    expect(await screen.findByText("Image 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Remove image 1 from Brand Co/i }));

    await waitFor(() => {
      expect(cleanupScheduleUploads).toHaveBeenCalledWith(["media_new"]);
    });
  });

  it("shows rewrite chips when highlighting caption text", async () => {
    const user = userEvent.setup();
    renderModal(
      <CreateScheduleModal
        open
        accounts={accounts}
        initialScheduledAt={new Date(futureLocal).toISOString()}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Threads$/i }));
    await user.click(screen.getByRole("checkbox", { name: /Brand Co/i }));

    const caption = screen.getByLabelText("Edit caption") as HTMLTextAreaElement;
    await user.clear(caption);
    await user.type(caption, "Launch note");
    caption.focus();
    caption.setSelectionRange(0, 6);
    fireEvent.select(caption);

    expect(
      await screen.findByRole("toolbar", { name: "Rewrite selection" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tweak" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    await waitFor(() => {
      expect(rewriteCaptionSelection).toHaveBeenCalled();
    });
    expect(rewriteCaptionSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "regenerate",
        selection: expect.any(String),
      }),
    );
    expect(await screen.findByText("Fresh launch note")).toBeInTheDocument();
  });
});
