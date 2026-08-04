import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, type ConversationDetail } from "@/lib/product-api";
import { ChatWorkspace } from "./chat-workspace";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  scrollIntoView: vi.fn(),
  workspace: {} as Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return { ...actual, apiRequest: vi.fn() };
});

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
  const value: ConversationDetail = {
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
    reviewGroups: [],
    turnActivities: [],
    nextCursor: null,
  };
  return {
    ...value,
    ...overrides,
    reviewGroups: overrides.reviewGroups ?? [],
    turnActivities: overrides.turnActivities ?? [],
  };
}

beforeEach(() => {
  window.history.replaceState({}, "", "/app");
  mocks.push.mockReset();
  mocks.scrollIntoView.mockReset();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: mocks.scrollIntoView,
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockImplementation((path) => {
    if (path === "/publishing/preferences") {
      return Promise.resolve({
        currentMode: "always_draft",
        effectiveMode: "always_draft",
        revision: 0,
        consentVersion: null,
        consentedAt: null,
        consentCurrent: false,
        policyVersion: "2026-08-01",
        enabled: false,
        authorityEventId: null,
      });
    }
    if (path === "/media/uploads") {
      return Promise.resolve({
        uploads: [{
          assetId: "media_owned1",
          uploadUrl: "https://upload.invalid/owned1",
          expiresAt: "2026-08-02T00:00:00.000Z",
        }],
      });
    }
    if (path === "/media/uploads/media_owned1/complete") {
      return Promise.resolve({
        id: "media_owned1",
        mimeType: "image/png",
        byteSize: 4,
        width: 1,
        height: 1,
        previewUrl: "https://media.invalid/owned1",
      });
    }
    return Promise.resolve({});
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
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

  it("uploads an image before sending and attaches the ready owned asset", async () => {
    const user = userEvent.setup();
    const { container } = render(<ChatWorkspace conversationId={null} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File([new Uint8Array([1, 2, 3, 4])], "post.png", {
      type: "image/png",
    }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/media/uploads/media_owned1/complete",
      expect.any(Object),
    ));
    await user.type(screen.getByLabelText("Message Sochestral"), "Publish this image{Enter}");

    expect(mocks.workspace.sendMessage).toHaveBeenCalledWith(
      null,
      "Publish this image",
      undefined,
      ["media_owned1"],
    );
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

  it("renders a conversation detail that omits turnActivities", () => {
    const incomplete = detail() as ConversationDetail & {
      turnActivities?: ConversationDetail["turnActivities"];
    };
    delete incomplete.turnActivities;
    mocks.workspace.details = { conv_1: incomplete };
    render(<ChatWorkspace conversationId="conv_1" />);

    expect(screen.getByText("Check this post")).toBeInTheDocument();
    expect(screen.getByText("preview").tagName).toBe("STRONG");
  });

  it("keeps persisted tool activity collapsed until requested (AC 3)", async () => {
    const user = userEvent.setup();
    mocks.workspace.details = {
      conv_1: detail({
        turnActivities: [
          {
            requestMessageId: "msg_1",
            assistantMessageId: "msg_2",
            runId: "run_1",
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
            reviewGroups: [],
          },
        ],
      }),
    };
    render(<ChatWorkspace conversationId="conv_1" />);

    const disclosure = screen.getByRole("button", { name: /Tool activity/i });
    const assistantResponse = screen.getByText(/Your/);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(disclosure).toHaveTextContent("1 tool action");
    expect(
      assistantResponse.compareDocumentPosition(disclosure) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(disclosure);

    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("validate post")).toBeInTheDocument();
    expect(screen.getByText("valid: true")).toBeInTheDocument();
  });

  it("shows activity only beneath the assistant response that caused it", () => {
    mocks.workspace.details = {
      conv_1: detail({
        messages: [
          {
            id: "msg_1",
            role: "user",
            content: "Validate this Threads post",
            sequence: 1,
            createdAt: "2026-07-26T00:00:00.000Z",
          },
          {
            id: "msg_2",
            role: "assistant",
            content: "The post is valid.",
            sequence: 2,
            createdAt: "2026-07-26T00:00:01.000Z",
          },
          {
            id: "msg_3",
            role: "user",
            content: "Yeah",
            sequence: 3,
            createdAt: "2026-07-26T00:00:02.000Z",
          },
          {
            id: "msg_4",
            role: "assistant",
            content: "What would you like to change?",
            sequence: 4,
            createdAt: "2026-07-26T00:00:03.000Z",
          },
        ],
        turnActivities: [
          {
            requestMessageId: "msg_1",
            assistantMessageId: "msg_2",
            runId: "run_1",
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
            reviewGroups: [],
          },
        ],
      }),
    };

    render(<ChatWorkspace conversationId="conv_1" />);

    const activity = screen.getByRole("button", { name: /Tool activity/i });
    const firstResponse = screen.getByText("The post is valid.").closest("li");
    const plainResponse = screen.getByText("What would you like to change?").closest("li");
    expect(firstResponse).toContainElement(activity);
    expect(plainResponse).not.toContainElement(activity);
  });

  it("announces pending work and blocks another send (AC 2)", () => {
    mocks.workspace.pending = { conv_1: true };
    mocks.workspace.details = { conv_1: detail() };
    render(<ChatWorkspace conversationId="conv_1" />);

    expect(
      screen.getByRole("status", { name: "Sochestral is working" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Checking context and safe tools")).toBeNull();
    expect(screen.getByLabelText("Message Sochestral")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("shows the sent message and a small assistant progress state immediately", async () => {
    const user = userEvent.setup();
    mocks.workspace.details = { conv_1: detail() };
    mocks.workspace.sendMessage = vi.fn(
      () => new Promise<string | null>(() => undefined),
    );
    render(<ChatWorkspace conversationId="conv_1" />);

    const composer = screen.getByLabelText("Message Sochestral");
    await user.type(composer, "Now post this on LinkedIn{Enter}");

    expect(screen.getByText("Now post this on LinkedIn")).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Sochestral is working" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.scrollIntoView).toHaveBeenCalledWith({
        behavior: "auto",
        block: "end",
      }),
    );
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
