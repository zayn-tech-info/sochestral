import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, type ReviewGroup as ReviewGroupValue } from "@/lib/product-api";
import { ReviewGroup } from "./review-group";

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
      validation: { errors: [], warnings: ["Review the link."], validatedRevision: null },
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

describe("ReviewGroup", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset().mockResolvedValue(connectorResponse);
  });

  it("auto selects the only account and requires an explicit save before approval", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<ReviewGroup group={group} onRefresh={onRefresh} autoOpen />);

    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    const account = await screen.findByLabelText("Destination account");
    expect(account).toHaveValue("acct_threads");
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
    render(<ReviewGroup group={unknown} onRefresh={vi.fn().mockResolvedValue(undefined)} autoOpen />);
    await screen.findByLabelText("Destination account");
    expect(screen.queryByRole("button", { name: /Try failed platforms/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check status" }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "/review/attempts/attempt_1/check",
        expect.objectContaining({ method: "POST", body: "{}" }),
      ),
    );
  });

  it("closes to a compact launcher and can be reopened without page scrolling", async () => {
    const user = userEvent.setup();
    render(<ReviewGroup group={group} onRefresh={vi.fn().mockResolvedValue(undefined)} autoOpen />);

    const dialog = screen.getByRole("dialog");
    const launcher = screen.getByRole("button", { name: /Review social set/i });
    expect(dialog).toHaveAttribute("open");

    await user.click(screen.getByRole("button", { name: "Close review" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(launcher).toHaveFocus();

    await user.click(launcher);
    expect(dialog).toHaveAttribute("open");
  });

  it("does not automatically open completed review history", () => {
    const completed: ReviewGroupValue = {
      ...group,
      drafts: group.drafts.map((draft) => ({ ...draft, status: "published" })),
    };
    render(<ReviewGroup group={completed} onRefresh={vi.fn().mockResolvedValue(undefined)} autoOpen />);

    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: /Published/i })).toBeInTheDocument();
  });

  it("shows automatic Full access success without a draft launcher or dialog", () => {
    const completed: ReviewGroupValue = {
      ...group,
      drafts: group.drafts.map((draft) => ({
        ...draft,
        status: "published",
        latestAttempt: {
          id: "attempt_auto",
          draftId: draft.id,
          platform: draft.platform,
          state: "succeeded",
          mcpPostId: "post_1",
          error: null,
          createdAt: "2026-08-01T00:00:00.000Z",
          completedAt: "2026-08-01T00:00:01.000Z",
          authorizationKind: "full_access",
        },
      })),
    };

    render(<ReviewGroup group={completed} onRefresh={vi.fn().mockResolvedValue(undefined)} autoOpen />);

    expect(screen.getByRole("status", { name: "Published social set" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /review/i })).toBeNull();
    expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
