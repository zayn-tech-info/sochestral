import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationDetail } from "@/lib/product-api";
import { ChatWorkspace } from "./chat-workspace";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  workspace: {} as Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("./app-shell", () => ({
  AppShell: ({
    title,
    actions,
    children,
  }: {
    title?: string;
    actions?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <main>
      {title ? <h1>{title}</h1> : null}
      {actions}
      {children}
    </main>
  ),
}));

vi.mock("./workspace-provider", () => ({
  useWorkspace: () => mocks.workspace,
}));

function detail(overrides: Partial<ConversationDetail> = {}): ConversationDetail {
  return {
    conversation: {
      id: "conv_1",
      title: "Launch plan",
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:01.000Z",
    },
    messages: [
      {
        id: "msg_1",
        role: "user",
        content: "Check this post",
        sequence: 1,
        createdAt: "2026-07-26T00:00:00.000Z",
      },
      {
        id: "msg_2",
        role: "assistant",
        content: "Your **preview** is ready.",
        sequence: 2,
        createdAt: "2026-07-26T00:00:01.000Z",
      },
    ],
    runs: [],
    toolSummaries: [],
    nextCursor: null,
    ...overrides,
  };
}

beforeEach(() => {
  window.history.replaceState({}, "", "/app");
  mocks.push.mockReset();
  mocks.workspace = {
    details: {},
    pending: {},
    errors: {},
    retries: {},
    loadConversation: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue("conv_1"),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
  };
});

describe("ChatWorkspace", () => {
  it("sends trimmed text with Enter and opens the created conversation (AC 1, AC 2)", async () => {
    const user = userEvent.setup();
    render(<ChatWorkspace conversationId={null} />);

    const composer = screen.getByLabelText("Message Sochestral");
    await user.type(composer, "  Draft a Threads post  {Enter}");

    expect(mocks.workspace.sendMessage).toHaveBeenCalledWith(
      null,
      "Draft a Threads post",
      undefined,
    );
    expect(mocks.push).toHaveBeenCalledWith("/app/chat/conv_1");
  });

  it("keeps Shift Enter as a new line without sending (AC 2)", async () => {
    const user = userEvent.setup();
    render(<ChatWorkspace conversationId={null} />);

    const composer = screen.getByLabelText("Message Sochestral");
    await user.type(composer, "First line{Shift>}{Enter}{/Shift}Second line");

    expect(mocks.workspace.sendMessage).not.toHaveBeenCalled();
    expect(composer).toHaveValue("First line\nSecond line");
  });

  it("submits a starter prompt as a normal message", async () => {
    const user = userEvent.setup();
    render(<ChatWorkspace conversationId={null} />);

    await user.click(
      screen.getByRole("button", {
        name: "Which social accounts are connected?",
      }),
    );

    expect(mocks.workspace.sendMessage).toHaveBeenCalledWith(
      null,
      "Which social accounts are connected?",
      undefined,
    );
  });

  it("renders owned messages and loads older history (AC 1, AC 3)", async () => {
    const user = userEvent.setup();
    mocks.workspace.details = { conv_1: detail({ nextCursor: "older" }) };
    render(<ChatWorkspace conversationId="conv_1" />);

    expect(screen.getByText("Check this post")).toBeInTheDocument();
    expect(screen.getByText("preview").tagName).toBe("STRONG");
    await user.click(screen.getByRole("button", { name: "Load older messages" }));

    expect(mocks.workspace.loadConversation).toHaveBeenCalledWith("conv_1", true);
  });

  it("keeps persisted tool activity collapsed until requested (AC 3)", async () => {
    const user = userEvent.setup();
    mocks.workspace.details = {
      conv_1: detail({
        toolSummaries: [
          {
            id: "tool_1",
            runId: "run_1",
            toolName: "validate_post",
            status: "succeeded",
            summary: { valid: true },
            safeError: null,
          },
        ],
      }),
    };
    render(<ChatWorkspace conversationId="conv_1" />);

    const disclosure = screen.getByRole("button", { name: /Tool activity/i });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await user.click(disclosure);

    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("validate post")).toBeInTheDocument();
    expect(screen.getByText("valid: true")).toBeInTheDocument();
  });

  it("announces pending work and blocks another send (AC 2)", () => {
    mocks.workspace.pending = { conv_1: true };
    mocks.workspace.details = { conv_1: detail() };
    render(<ChatWorkspace conversationId="conv_1" />);

    expect(screen.getByRole("status")).toHaveTextContent("Sochestral is working");
    expect(screen.getByLabelText("Message Sochestral")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("requires confirmation before deleting an idle conversation (AC 1)", async () => {
    const user = userEvent.setup();
    mocks.workspace.details = { conv_1: detail() };
    render(<ChatWorkspace conversationId="conv_1" />);

    await user.click(
      screen.getByRole("button", { name: "Delete this conversation" }),
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: /^Delete$/ }));

    expect(mocks.workspace.deleteConversation).toHaveBeenCalledWith("conv_1");
    expect(mocks.push).toHaveBeenCalledWith("/app");
  });
});
