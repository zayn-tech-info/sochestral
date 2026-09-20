import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanViewer } from "./plan-viewer";
import { reattachComment, approvePlan, commentOnPlan, getPlan, type PlanDetail } from "@/lib/plans-api";
import { ApiError } from "@/lib/product-api";

vi.mock("@/lib/plans-api", () => ({ getPlan: vi.fn(), reattachComment: vi.fn(), approvePlan: vi.fn(), commentOnPlan: vi.fn(), submitPlanComments: vi.fn(), listPlans: vi.fn() }));
vi.mock("./app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const detail: PlanDetail = {
  plan: { id: "plan_1", title: "Workshop launch", currentVersion: 1, updatedAt: "2030-01-01T00:00:00Z" },
  version: { version: 1, document: { schemaVersion: 1, sections: [{ id: "goal", type: "goal", title: "Goal", blocks: [{ id: "goal_text", kind: "paragraph", text: "Reach workshop owners" }] }] } },
  comments: [], approvals: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
  vi.mocked(getPlan).mockResolvedValue(structuredClone(detail));
  vi.mocked(approvePlan).mockResolvedValue({});
});

describe("plan review", () => {
  it("renders the saved plan and approves only its displayed version", async () => {
    render(<PlanViewer planId="plan_1" />);
    expect(await screen.findByText("Reach workshop owners")).toBeInTheDocument();
    expect(approvePlan).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Approve plan direction" }));
    expect(approvePlan).toHaveBeenCalledWith("plan_1", 1);
    expect(await screen.findByRole("status")).toHaveTextContent("Content still needs review before scheduling");
  });

  it("persists a block comment and keeps the editor empty until an anchor is selected", async () => {
    render(<PlanViewer planId="plan_1" />);
    await screen.findByText("Reach workshop owners");
    expect(screen.getByRole("button", { name: "Save comment" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Comment on Reach workshop owners" }));
    await userEvent.type(screen.getByLabelText("Your comment"), "Focus on independent shops");
    await userEvent.click(screen.getByRole("button", { name: "Save comment" }));
    expect(commentOnPlan).toHaveBeenCalledWith("plan_1", { version: 1, blockId: "goal_text", body: "Focus on independent shops" });
    expect(await screen.findByRole("status")).toHaveTextContent("Comment saved");
  });

  it("saves an explicit new location without rewriting the original feedback", async () => {
    vi.mocked(getPlan).mockResolvedValue({ ...structuredClone(detail), plan: { ...detail.plan, currentVersion: 2 }, version: { ...detail.version, version: 2 }, comments: [{ id: "old_comment", version: 1, blockId: "old_goal", quote: "Earlier text", body: "Keep the point", status: "needs_reattachment", batchId: null }] });
    render(<PlanViewer planId="plan_1" />);
    await screen.findByText("Reach workshop owners");
    await userEvent.click(screen.getByRole("button", { name: "Reattach comment: Keep the point" }));
    expect(screen.getByRole("button", { name: "Save new location" })).toBeDisabled();
    expect(screen.getByLabelText("Your comment")).toHaveValue("Keep the point");
    expect(screen.getByLabelText("Your comment")).toHaveAttribute("readonly");
    await userEvent.click(screen.getByRole("button", { name: "Comment on Reach workshop owners" }));
    await userEvent.click(screen.getByRole("button", { name: "Save new location" }));
    expect(reattachComment).toHaveBeenCalledWith("plan_1", "old_comment", { version: 2, blockId: "goal_text" });
    expect(commentOnPlan).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("Original feedback remains in history");
  });

  it("resumes watching a saved revision without resubmitting generation", async () => {
    const next = { ...structuredClone(detail), plan: { ...detail.plan, currentVersion: 2 }, version: { ...detail.version, version: 2 }, batches: [] };
    vi.mocked(getPlan).mockResolvedValueOnce({ ...structuredClone(detail), batches: [{ id: "batch_1", version: 1, status: "running", errorCode: null }] }).mockResolvedValue(next);
    render(<PlanViewer planId="plan_1" />);
    expect(await screen.findByText("Applying submitted comments…")).toBeInTheDocument();
    expect(await screen.findByText("Version 2 · Needs review", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(commentOnPlan).not.toHaveBeenCalled();
    expect(approvePlan).not.toHaveBeenCalled();
  });

  it("reads historical documents without exposing comment or approval actions", async () => {
    const latest = { ...structuredClone(detail), plan: { ...detail.plan, currentVersion: 2 }, version: { ...detail.version, version: 2 } };
    vi.mocked(getPlan).mockResolvedValue(latest);
    render(<PlanViewer planId="plan_1" />);
    await screen.findByText("Version 2 · Needs review");
    vi.mocked(getPlan).mockResolvedValue({ ...structuredClone(detail), plan: latest.plan });
    await userEvent.click(screen.getByRole("button", { name: "Previous version" }));
    expect(getPlan).toHaveBeenLastCalledWith("plan_1", 1);
    expect(await screen.findByText("Version 1 · Earlier version · Read only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve plan direction" })).toBeDisabled();
    expect(screen.queryByLabelText("Your comment")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Comment on Reach workshop owners" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous version" })).toBeDisabled();
    vi.mocked(getPlan).mockResolvedValue(latest);
    await userEvent.click(screen.getByRole("button", { name: "Back to latest" }));
    expect(await screen.findByLabelText("Your comment")).toBeInTheDocument();
    expect(approvePlan).not.toHaveBeenCalled();
    expect(commentOnPlan).not.toHaveBeenCalled();
  });

  it("preserves the original selected version and comment when the document refreshes", async () => {
    render(<PlanViewer planId="plan_1" />);
    await screen.findByText("Reach workshop owners");
    await userEvent.click(screen.getByRole("button", { name: "Comment on Reach workshop owners" }));
    fireEvent.change(screen.getByLabelText("Your comment"), { target: { value: "Keep this point" } });
    vi.mocked(getPlan).mockResolvedValue({ ...structuredClone(detail), plan: { ...detail.plan, currentVersion: 2 }, version: { ...detail.version, version: 2 } });
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("Version 2 · Needs review");
    vi.mocked(commentOnPlan).mockRejectedValue(new ApiError(409, "STALE_VERSION", {}));
    await userEvent.click(screen.getByRole("button", { name: "Save comment" }));
    await waitFor(() => expect(commentOnPlan).toHaveBeenCalledWith("plan_1", { version: 1, blockId: "goal_text", body: "Keep this point" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This plan changed");
    expect(screen.getByLabelText("Your comment")).toHaveValue("Keep this point");
  });
});
