import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanViewer } from "./plan-viewer";
import { commentOnPlan, createPlanContent, excludePlanItem, getPlan, saveContentDraft, schedulePlanPosts, submitPlanComments, type PlanDetail } from "@/lib/plans-api";
import { apiRequest, ApiError } from "@/lib/product-api";

vi.mock("@/lib/plans-api", () => ({
  getPlan: vi.fn(), commentOnPlan: vi.fn(), submitPlanComments: vi.fn(), createPlanContent: vi.fn(),
  excludePlanItem: vi.fn(), schedulePlanPosts: vi.fn(), saveContentDraft: vi.fn(), listPlans: vi.fn(), approvePlan: vi.fn(), reattachComment: vi.fn(),
}));
vi.mock("@/lib/product-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/product-api")>("@/lib/product-api");
  return { ...actual, apiRequest: vi.fn() };
});
vi.mock("./app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const detail: PlanDetail = {
  plan: { id: "plan_1", title: "Workshop launch", currentVersion: 1, updatedAt: "2030-01-01T00:00:00Z" },
  version: { version: 1, document: { schemaVersion: 1, sections: [
    { id: "goal", type: "goal", title: "Goal", blocks: [{ id: "goal_text", kind: "paragraph", text: "Reach workshop owners" }] },
    { id: "calendar", type: "calendar", title: "Calendar", blocks: [{ id: "cal", kind: "calendar", items: [{ id: "item_text", angle: "Shop tip", audience: "Builders", format: "text", destinations: ["threads"], proposedTime: "2031-01-02T09:00", assetNeeds: [] }] }] },
    { id: "audience_voice", type: "audience_voice", title: "Audience", blocks: [{ id: "av", kind: "paragraph", text: "Builders" }] },
    { id: "direction", type: "direction", title: "Direction", blocks: [{ id: "dir", kind: "paragraph", text: "Practical" }] },
    { id: "sources", type: "sources", title: "Sources", blocks: [{ id: "src", kind: "sources", sources: [] }] },
    { id: "missing_inputs", type: "missing_inputs", title: "Missing", blocks: [{ id: "miss", kind: "paragraph", text: "None" }] },
  ] } },
  comments: [], approvals: [{ scope: "plan_direction", revision: 1 }],
  board: { timezone: "UTC", timezoneConfirmed: true },
  contentJob: { id: "job_1", planVersion: 1, status: "applied", errorCode: null },
  contentItems: [{ id: "citem_1", calendarItemId: "item_text", status: "ready", excludedAt: null, revision: { revision: 1, caption: "A shop-floor caption for builders.", destinations: ["threads"], format: "text", assetNeeds: [], blockReason: null } }],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getPlan).mockResolvedValue(structuredClone(detail));
  vi.mocked(saveContentDraft).mockImplementation(async (_id, itemId) => ({ ...structuredClone(detail).contentItems![0]!, id: itemId }));
  vi.mocked(apiRequest).mockResolvedValue({ connectors: [{ platform: "threads", state: "connected", accounts: [{ id: "acct_1", username: "shop", displayName: "Shop", state: "connected" }] }] });
});

describe("post board", () => {
  it("shows captions and Schedule posts without Approve plan direction", async () => {
    render(<PlanViewer planId="plan_1" />);
    expect(await screen.findByText("A shop-floor caption for builders.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve plan direction" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create content" })).not.toBeInTheDocument();
    expect(screen.queryByText("Reach workshop owners")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "View how this was planned" }));
    expect(screen.getByText("Reach workshop owners")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule posts" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add images" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Schedule on Shop/ })).toBeInTheDocument();
  });

  it("opens the calendar profile picker and schedules the selected profile", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ connectors: [{ platform: "threads", state: "connected", accounts: [
      { id: "acct_1", username: "zayntechinfo", displayName: "Abdulbasit Adeniyi", state: "connected" },
      { id: "acct_2", username: "other", displayName: "Other profile", state: "connected" },
    ] }] });
    render(<PlanViewer planId="plan_1" />);
    await screen.findByText("A shop-floor caption for builders.");
    await userEvent.click(screen.getByRole("button", { name: /Threads, 1 account selected/ }));
    expect(screen.getByRole("dialog", { name: "Threads accounts" })).toBeInTheDocument();
    expect(screen.getByText("@zayntechinfo")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /Other profile/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Abdulbasit Adeniyi/ }));
    await userEvent.click(screen.getByRole("button", { name: "Schedule posts" }));
    expect(schedulePlanPosts).toHaveBeenCalledWith("plan_1", 1, [expect.objectContaining({ accounts: { threads: "acct_2" } })]);
  });

  it("saves a time change and blocks a missing image only for Instagram", async () => {
    vi.mocked(saveContentDraft).mockResolvedValue(detail.contentItems![0]!);
    vi.mocked(getPlan).mockResolvedValue({
      ...structuredClone(detail),
      contentItems: [
        detail.contentItems![0]!,
        { id: "citem_ig", calendarItemId: "item_ig", status: "blocked", excludedAt: null, revision: { revision: 1, caption: "A photo caption.", destinations: ["instagram"], format: "image", assetNeeds: ["photo"], blockReason: "missing_media" } },
      ],
    });
    render(<PlanViewer planId="plan_1" />);
    await screen.findByText("A shop-floor caption for builders.");
    expect(screen.getAllByText("Blocked: missing image")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: /Schedule on Shop/ }));
    fireEvent.change(screen.getByLabelText("Schedule on Shop"), { target: { value: "2031-02-02T10:15" } });
    await waitFor(() => expect(saveContentDraft).toHaveBeenCalledWith("plan_1", "citem_1", expect.objectContaining({ localTime: "2031-02-02T10:15", assetIds: [] })));
  });

  it("turns the primary action into Review when a board comment is unsent", async () => {
    vi.mocked(getPlan).mockResolvedValue({
      ...structuredClone(detail),
      comments: [{ id: "c1", version: 1, scope: "board", blockId: "board", quote: null, body: "Sharper CTA", status: "pending", batchId: null }],
    });
    render(<PlanViewer planId="plan_1" />);
    await screen.findByText("Sharper CTA");
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(submitPlanComments).toHaveBeenCalledWith("plan_1", 1, ["c1"]);
    expect(schedulePlanPosts).not.toHaveBeenCalled();
  });

  it("saves a general comment and a per-post comment", async () => {
    render(<PlanViewer planId="plan_1" />);
    await screen.findByText("A shop-floor caption for builders.");
    await userEvent.type(screen.getByLabelText("General comment"), "Keep the shop floor tone");
    await userEvent.click(screen.getByRole("button", { name: "Save comment" }));
    expect(commentOnPlan).toHaveBeenCalledWith("plan_1", { version: 1, blockId: "board", body: "Keep the shop floor tone", scope: "board" });
    await screen.findByRole("status");
    await userEvent.click(screen.getByRole("button", { name: "Comment on this post" }));
    await userEvent.type(screen.getByLabelText("Comment on this post"), "Shorter first line");
    await userEvent.click(screen.getByRole("button", { name: "Save post comment" }));
    expect(commentOnPlan).toHaveBeenCalledWith("plan_1", { version: 1, blockId: "citem_1", body: "Shorter first line", scope: "post" });
  });

  it("queues ready rows from the board and excludes a post", async () => {
    render(<PlanViewer planId="plan_1" />);
    await screen.findByText("A shop-floor caption for builders.");
    await userEvent.click(screen.getByRole("button", { name: "Schedule posts" }));
    expect(schedulePlanPosts).toHaveBeenCalledWith("plan_1", 1, [expect.objectContaining({ itemId: "citem_1", excluded: false, localTime: "2031-01-02T09:00", accounts: { threads: "acct_1" } })]);
    vi.mocked(excludePlanItem).mockResolvedValue({});
    vi.mocked(getPlan).mockResolvedValue({ ...structuredClone(detail), contentItems: [{ ...detail.contentItems![0]!, excludedAt: "2030-01-01T00:00:00Z" }] });
    await userEvent.click(screen.getByRole("button", { name: "Exclude" }));
    expect(excludePlanItem).toHaveBeenCalledWith("plan_1", "citem_1", 1, true);
  });

  it("retries caption writing without stacking jargon", async () => {
    vi.mocked(getPlan).mockResolvedValue({ ...structuredClone(detail), contentJob: { id: "job_1", planVersion: 1, status: "needs_attention", errorCode: "INVALID_CONTENT" }, contentItems: [] });
    render(<PlanViewer planId="plan_1" />);
    expect(await screen.findByText("Could not write these posts. Try again.")).toBeInTheDocument();
    expect(screen.queryByText(/needs attention/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(createPlanContent).toHaveBeenCalledWith("plan_1", 1);
  });

  it("disables Schedule posts while review is running", async () => {
    vi.mocked(getPlan).mockResolvedValue({
      ...structuredClone(detail),
      batches: [{ id: "b1", version: 1, kind: "content", status: "running", errorCode: null }],
    });
    render(<PlanViewer planId="plan_1" />);
    await screen.findByText("A shop-floor caption for builders.");
    expect(screen.getByRole("button", { name: "Schedule posts" })).toBeDisabled();
    expect(schedulePlanPosts).not.toHaveBeenCalled();
  });

  it("polls while captions are writing", async () => {
    const writing = { ...structuredClone(detail), contentJob: { id: "job_1", planVersion: 1, status: "running", errorCode: null }, contentItems: [] };
    vi.mocked(getPlan).mockResolvedValueOnce(writing).mockResolvedValue(detail);
    render(<PlanViewer planId="plan_1" />);
    expect(await screen.findByText("Writing these posts…")).toBeInTheDocument();
    expect(await screen.findByText("A shop-floor caption for builders.", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("keeps a typed board comment when schedule fails", async () => {
    render(<PlanViewer planId="plan_1" />);
    await screen.findByText("A shop-floor caption for builders.");
    fireEvent.change(screen.getByLabelText("General comment"), { target: { value: "Keep this" } });
    vi.mocked(schedulePlanPosts).mockRejectedValue(new ApiError(422, "SCHEDULE_NOT_READY", {}));
    await userEvent.click(screen.getByRole("button", { name: "Schedule posts" }));
    await waitFor(() => expect(schedulePlanPosts).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toHaveTextContent("No post is ready to schedule yet.");
    expect(screen.getByLabelText("General comment")).toHaveValue("Keep this");
  });

  it("explains a missing timezone without calling schedule", async () => {
    vi.mocked(getPlan).mockResolvedValue({ ...structuredClone(detail), board: { timezone: null, timezoneConfirmed: false } });
    render(<PlanViewer planId="plan_1" />);
    await screen.findByText("A shop-floor caption for builders.");
    expect(screen.getByText(/Confirm your timezone in settings/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule posts" })).toBeDisabled();
    expect(schedulePlanPosts).not.toHaveBeenCalled();
  });

  it("shows the server code when an action fails for an unknown reason", async () => {
    render(<PlanViewer planId="plan_1" />);
    await screen.findByText("A shop-floor caption for builders.");
    vi.mocked(schedulePlanPosts).mockRejectedValue(new ApiError(500, "INTERNAL_ERROR", {}));
    await userEvent.click(screen.getByRole("button", { name: "Schedule posts" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("INTERNAL_ERROR");
  });
});
