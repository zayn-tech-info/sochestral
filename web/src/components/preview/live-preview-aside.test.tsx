import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, type ReviewGroup as ReviewGroupValue } from "@/lib/product-api";
import { LivePreviewAside } from "./live-preview-aside";

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return { ...actual, apiRequest: vi.fn() };
});

const group: ReviewGroupValue = {
  id: "review_1",
  conversationId: "conv_1",
  drafts: [
    {
      id: "draft_1",
      platform: "threads",
      body: "Launch day",
      mediaUrls: [],
      selectedAccountId: null,
      revision: 1,
      status: "draft",
      validation: {
        errors: [],
        warnings: ["Review the link."],
        validatedRevision: null,
      },
      latestAttempt: null,
    },
  ],
};

const connectorResponse = {
  connectors: [
    {
      platform: "threads" as const,
      state: "connected" as const,
      accounts: [
        {
          id: "acct_threads",
          username: "studio",
          displayName: "Studio",
          state: "connected" as const,
        },
      ],
    },
  ],
};

describe("LivePreviewAside", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset().mockResolvedValue(connectorResponse);
  });

  it("auto selects the only account and requires an explicit save before approval", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<LivePreviewAside group={group} onRefresh={onRefresh} />);

    expect(screen.getByLabelText("Live platform preview")).toBeInTheDocument();
    expect(screen.getByLabelText("Threads post preview")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close preview" })).toBeNull();
    const account = await screen.findByRole("button", {
      name: "Destination account",
    });
    expect(account).toHaveTextContent("Studio");
    expect(screen.getByRole("button", { name: "Approve and publish" })).toBeDisabled();
    expect(screen.getByText("Review the link.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "/review/drafts/draft_1",
        expect.objectContaining({
          method: "PATCH",
          headers: { "X-Sochestral-Request": "review-action" },
        }),
      ),
    );
    expect(onRefresh).toHaveBeenCalled();
  });

  it("calls onClose from the close control and Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <LivePreviewAside
        group={group}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Close preview" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("checks an unknown attempt without exposing a retry action", async () => {
    const user = userEvent.setup();
    const unknown: ReviewGroupValue = {
      ...group,
      drafts: [
        {
          ...group.drafts[0]!,
          status: "unknown",
          latestAttempt: {
            id: "attempt_1",
            draftId: "draft_1",
            platform: "threads",
            state: "unknown",
            mcpPostId: null,
            error: { code: "PUBLISH_STATUS_UNKNOWN", message: "Check status." },
            createdAt: "2026-08-01T00:00:00.000Z",
            completedAt: "2026-08-01T00:00:30.000Z",
          },
        },
      ],
    };
    render(
      <LivePreviewAside
        group={unknown}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await screen.findByRole("button", { name: "Destination account" });
    expect(
      screen.queryByRole("button", { name: /Try failed platforms/i }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check status" }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "/review/attempts/attempt_1/check",
        expect.objectContaining({ method: "POST", body: "{}" }),
      ),
    );
  });

  it("shows a Live badge and locked preview after publish", async () => {
    const completed: ReviewGroupValue = {
      ...group,
      drafts: group.drafts.map((draft) => ({ ...draft, status: "published" })),
    };
    render(
      <LivePreviewAside
        group={completed}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await screen.findByRole("button", { name: "Destination account" });
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve and publish" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it("shows all platforms so users can preview each look", async () => {
    const user = userEvent.setup();
    render(
      <LivePreviewAside
        group={group}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await screen.findByRole("button", { name: "Destination account" });
    expect(screen.getByRole("tab", { name: /Threads/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /LinkedIn/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Instagram/i })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /LinkedIn/i }));
    expect(screen.getByLabelText("LinkedIn post preview")).toBeInTheDocument();
    expect(screen.getByText(/Preview only for LinkedIn/i)).toBeInTheDocument();
  });

  it("rejects video files when adding media", async () => {
    const { fireEvent } = await import("@testing-library/react");
    render(
      <LivePreviewAside
        group={group}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    await screen.findByRole("button", { name: "Destination account" });
    const input = document.querySelector(
      'input[type="file"][accept="image/*"]',
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          new File([new Uint8Array([1, 2, 3])], "clip.mp4", {
            type: "video/mp4",
          }),
        ],
      },
    });
    expect(
      await screen.findByText(/Videos are not supported yet/i),
    ).toBeInTheDocument();
  });
});
