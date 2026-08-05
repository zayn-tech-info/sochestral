import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest, type ConversationDetail, type TurnResponse } from "@/lib/product-api";
import { useWorkspace, WorkspaceProvider } from "./workspace-provider";

const navigation = vi.hoisted(() => {
  const replace = vi.fn();
  return { replace, router: { replace } };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/chat/conv_1",
  useRouter: () => navigation.router,
}));

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return { ...actual, apiRequest: vi.fn() };
});

const conversation = {
  id: "conv_1",
  title: "Launch plan",
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:01.000Z",
};

function conversationDetail(
  messages: ConversationDetail["messages"],
  nextCursor: string | null,
): ConversationDetail {
  return {
    conversation,
    messages,
    runs: [],
    toolSummaries: [],
    reviewGroups: [],
    turnActivities: [],
    nextCursor,
  };
}

const turn: TurnResponse = {
  conversation,
  userMessage: {
    id: "msg_user",
    role: "user",
    content: "Hello",
    sequence: 1,
    createdAt: "2026-07-26T00:00:00.000Z",
  },
  assistantMessage: {
    id: "msg_assistant",
    role: "assistant",
    content: "Ready",
    sequence: 2,
    createdAt: "2026-07-26T00:00:01.000Z",
  },
  run: null,
  toolSummaries: [],
  reviewGroups: [],
  turnActivity: null,
};

function Harness() {
  const workspace = useWorkspace();
  const retry = workspace.retries.new ?? undefined;
  const loadedMessages = workspace.details.conv_1?.messages ?? [];

  return (
    <div>
      <span>{workspace.authLoading ? "auth loading" : workspace.user?.email}</span>
      <ul>
        {workspace.conversations.map((item) => (
          <li key={item.id}>{item.title}</li>
        ))}
      </ul>
      <span>{workspace.errors.new}</span>
      {loadedMessages.map((item) => (
        <span key={item.id}>{item.content}</span>
      ))}
      <span data-testid="turn-activities-count">
        {(workspace.details.conv_1?.turnActivities ?? []).length}
      </span>
      <button type="button" onClick={() => void workspace.sendMessage(null, "Hello", retry)}>
        {retry ? "Retry message" : "Send message"}
      </button>
      <button type="button" onClick={() => void workspace.loadConversation("conv_1")}>
        Load conversation
      </button>
      <button type="button" onClick={() => void workspace.loadConversation("conv_1", true)}>
        Load older
      </button>
      <button type="button" onClick={() => void workspace.deleteConversation("conv_1")}>
        Delete conversation
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <WorkspaceProvider>
      <Harness />
    </WorkspaceProvider>,
  );
}

beforeEach(() => {
  navigation.replace.mockReset();
  vi.mocked(apiRequest).mockReset();
  vi.spyOn(crypto, "randomUUID").mockReturnValue(
    "10000000-0000-4000-8000-000000000001",
  );
});

describe("WorkspaceProvider", () => {
  it("loads the signed in user and their conversations (AC 1, AC 8)", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path === "/auth/me") return { id: "user_1", email: "person@example.com" };
      return { conversations: [conversation], nextCursor: null };
    });

    renderProvider();

    expect(await screen.findByText("person@example.com")).toBeInTheDocument();
    expect(screen.getByText("Launch plan")).toBeInTheDocument();
  });

  it("redirects an invalid session to login with a relative return path (AC 8)", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new ApiError(401, "UNAUTHORIZED", {}));

    renderProvider();

    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        "/login?returnTo=%2Fapp%2Fchat%2Fconv_1",
      ),
    );
  });

  it("creates a conversation with a browser request id (AC 1)", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path, init) => {
      if (path === "/auth/me") return { id: "user_1", email: "person@example.com" };
      if (init?.method === "POST") return turn;
      return { conversations: [], nextCursor: null };
    });
    const user = userEvent.setup();
    renderProvider();
    await screen.findByText("person@example.com");

    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/orchestration/conversations", {
        method: "POST",
        body: JSON.stringify({
          message: "Hello",
          requestId: "10000000-0000-4000-8000-000000000001",
        }),
      }),
    );
    expect(await screen.findByText("Ready")).toBeInTheDocument();
  });

  it("reuses the request id only after an uncertain network failure (AC 1)", async () => {
    let postAttempts = 0;
    vi.mocked(apiRequest).mockImplementation(async (path, init) => {
      if (path === "/auth/me") return { id: "user_1", email: "person@example.com" };
      if (init?.method === "POST") {
        postAttempts += 1;
        if (postAttempts === 1) throw new Error("connection reset");
        return turn;
      }
      return { conversations: [], nextCursor: null };
    });
    const user = userEvent.setup();
    renderProvider();
    await screen.findByText("person@example.com");

    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText("The connection was interrupted. You can retry safely.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry message" }));

    await waitFor(() => expect(postAttempts).toBe(2));
    const postBodies = vi
      .mocked(apiRequest)
      .mock.calls.filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body)) as { requestId: string });
    expect(postBodies[0].requestId).toBe(postBodies[1].requestId);
  });

  it("prepends older messages and removes a deleted conversation (AC 1)", async () => {
    let detailCalls = 0;
    vi.mocked(apiRequest).mockImplementation(async (path, init) => {
      if (path === "/auth/me") return { id: "user_1", email: "person@example.com" };
      if (path === "/orchestration/conversations?limit=25") {
        return { conversations: [conversation], nextCursor: null };
      }
      if (String(path).startsWith("/orchestration/conversations/conv_1") && init?.method !== "DELETE") {
        detailCalls += 1;
        return detailCalls === 1
          ? conversationDetail([turn.assistantMessage], "older")
          : conversationDetail([
              { ...turn.userMessage, id: "msg_old", content: "Older message" },
            ], null);
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderProvider();
    await screen.findByText("Launch plan");

    await user.click(screen.getByRole("button", { name: "Load conversation" }));
    expect(await screen.findByText("Ready")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load older" }));
    expect(await screen.findByText("Older message")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete conversation" }));

    await waitFor(() => expect(screen.queryByText("Launch plan")).not.toBeInTheDocument());
    expect(apiRequest).toHaveBeenCalledWith("/orchestration/conversations/conv_1", {
      method: "DELETE",
    });
  });

  it("normalizes missing turnActivities when loading a conversation", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path === "/auth/me") return { id: "user_1", email: "person@example.com" };
      if (path === "/orchestration/conversations?limit=25") {
        return { conversations: [conversation], nextCursor: null };
      }
      if (String(path).startsWith("/orchestration/conversations/conv_1")) {
        return {
          conversation,
          messages: [turn.userMessage, turn.assistantMessage],
          runs: [],
          toolSummaries: [],
          nextCursor: null,
        };
      }
      return { conversations: [], nextCursor: null };
    });
    const user = userEvent.setup();
    renderProvider();
    await screen.findByText("Launch plan");

    await user.click(screen.getByRole("button", { name: "Load conversation" }));

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
      expect(screen.getByText("Ready")).toBeInTheDocument();
      expect(screen.getByTestId("turn-activities-count")).toHaveTextContent("0");
    });
  });
});
