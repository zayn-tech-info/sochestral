import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, createImageJob, getImageJob, listBrandAssets, type ConversationDetail } from "@/lib/product-api";
import { ChatWorkspace } from "./chat-workspace";
import { ToastProvider } from "./toast-provider";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  scrollIntoView: vi.fn(),
  workspace: {} as Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock("@/lib/product-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/product-api")>();
  return {
    ...actual,
    apiRequest: vi.fn(),
    listBrandAssets: vi.fn(),
    createImageJob: vi.fn(),
    getImageJob: vi.fn(),
  };
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


function renderChat(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function wrapChat(ui: React.ReactElement) {
  return <ToastProvider>{ui}</ToastProvider>;
}

beforeEach(() => {
  window.history.replaceState({}, "", "/app");
  mocks.push.mockReset();
  mocks.replace.mockReset();
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
  vi.mocked(listBrandAssets).mockReset();
  vi.mocked(listBrandAssets).mockResolvedValue({
    items: [
      {
        id: "ba_logo",
        kind: "logo",
        name: "Mark",
        mediaAssetId: "media_logo",
        colorValue: null,
        noteText: null,
        sortOrder: 0,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ],
  });
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
  vi.mocked(createImageJob).mockReset();
  vi.mocked(createImageJob).mockResolvedValue({
    job: {
      id: "job_edit_1",
      kind: "prompt_edit",
      status: "pending_confirm",
      prompt: "make it darker",
      sizePreset: "portrait_4_5",
      width: 1080,
      height: 1350,
      sourceMediaAssetId: "media_owned1",
      resultMediaAssetId: null,
      estimatedCostCents: 2,
      creditsCharged: 2,
      errorCode: null,
      errorMessage: null,
      conversationId: null,
      createdAt: "2026-08-12T00:00:00.000Z",
      startedAt: null,
      completedAt: null,
    },
    remainingCredits: 20,
    monthlyBudget: 100,
  });
  vi.mocked(getImageJob).mockReset();
  vi.mocked(getImageJob).mockResolvedValue({
    job: {
      id: "job_edit_1",
      kind: "prompt_edit",
      status: "pending_confirm",
      prompt: "make it darker",
      sizePreset: "portrait_4_5",
      width: 1080,
      height: 1350,
      sourceMediaAssetId: "media_owned1",
      resultMediaAssetId: null,
      estimatedCostCents: 2,
      creditsCharged: 2,
      errorCode: null,
      errorMessage: null,
      conversationId: null,
      createdAt: "2026-08-12T00:00:00.000Z",
      startedAt: null,
      completedAt: null,
    },
    inputs: [],
    resultPreviewUrl: null,
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  mocks.workspace = {
    details: {},
    pending: {},
    errors: {},
    retries: {},
    pendingLaunch: null,
    launchOptimistic: null,
    liveStep: null,
    liveToolName: null,
    startNewChat: vi.fn(),
    takePendingLaunch: vi.fn(() => null),
    clearLaunchOptimistic: vi.fn(),
    loadConversation: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue("conv_1"),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
  };
});

describe("ChatWorkspace", () => {
  it("sends trimmed text with Enter and opens the created conversation (AC 1, AC 2)", async () => {
    const user = userEvent.setup();
    renderChat(<ChatWorkspace conversationId={null} />);

    const composer = screen.getByLabelText("Message Sochestral");
    await user.type(composer, "  Draft a Threads post  {Enter}");

    expect(mocks.workspace.sendMessage).toHaveBeenCalledWith(
      null,
      "Draft a Threads post",
      undefined,
      [],
      expect.any(Function),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/app/chat/conv_1");
  });

  it("opens a Brand assets command when the user types /", async () => {
    const user = userEvent.setup();
    renderChat(<ChatWorkspace conversationId={null} />);

    await user.type(screen.getByLabelText("Message Sochestral"), "/");
    expect(
      screen.getByRole("option", { name: /brand assets/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /brand assets/i }));
    expect(
      await screen.findByRole("dialog", { name: "Brand assets" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Mark")).toBeInTheDocument();
  });

  it("starts a pending launch immediately on /app/chat/new", async () => {
    const launch = {
      message: "Plan a week of posts",
      mediaAssetIds: [],
      optimisticMedia: [],
    };
    mocks.workspace.pendingLaunch = launch;
    mocks.workspace.launchOptimistic = launch;
    let launchTaken = false;
    mocks.workspace.takePendingLaunch = vi.fn(() => {
      if (launchTaken) return null;
      launchTaken = true;
      mocks.workspace.pendingLaunch = null;
      return launch;
    });
    mocks.workspace.clearLaunchOptimistic = vi.fn(() => {
      mocks.workspace.launchOptimistic = null;
    });
    mocks.workspace.sendMessage = vi.fn(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            mocks.workspace.pending = {};
            resolve("conv_launch");
          }, 20);
        }),
    );

    const { rerender } = renderChat(<ChatWorkspace conversationId="new" />);

    expect(screen.getByText("Plan a week of posts")).toBeInTheDocument();
    expect(mocks.workspace.takePendingLaunch).toHaveBeenCalled();
    await waitFor(() => {
      expect(mocks.workspace.sendMessage).toHaveBeenCalledWith(
        null,
        "Plan a week of posts",
        undefined,
        [],
        expect.any(Function),
      );
    });
    await waitFor(() => {
      expect(mocks.workspace.clearLaunchOptimistic).toHaveBeenCalled();
      expect(mocks.replace).toHaveBeenCalledWith("/app/chat/conv_launch");
    });
    // Re-render with cleared launch flags (as WorkspaceProvider would) while still on /new.
    rerender(wrapChat(<ChatWorkspace conversationId="new" />));
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/app/chat/conv_launch");
    });
    expect(mocks.replace).not.toHaveBeenCalledWith("/app/workspace");
  });

  it("keeps Shift Enter as a new line without sending (AC 2)", async () => {
    const user = userEvent.setup();
    renderChat(<ChatWorkspace conversationId={null} />);

    const composer = screen.getByLabelText("Message Sochestral");
    await user.type(composer, "First line{Shift>}{Enter}{/Shift}Second line");

    expect(mocks.workspace.sendMessage).not.toHaveBeenCalled();
    expect(composer).toHaveValue("First line\nSecond line");
  });

  it("uploads an image before sending and attaches the ready owned asset", async () => {
    const user = userEvent.setup();
    const { container } = renderChat(<ChatWorkspace conversationId={null} />);
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
      expect.any(Function),
    );
    expect(screen.queryByLabelText("Selected images")).toBeNull();
  });

  it("clears the composer attachment while the turn is still in progress", async () => {
    const user = userEvent.setup();
    mocks.workspace.details = { conv_1: detail() };
    mocks.workspace.sendMessage = vi.fn(
      () => new Promise<string | null>(() => undefined),
    );
    const { container } = renderChat(<ChatWorkspace conversationId="conv_1" />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File([new Uint8Array([1, 2, 3, 4])], "post.png", {
      type: "image/png",
    }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Reframe" })).toBeInTheDocument());
    await user.type(screen.getByLabelText("Message Sochestral"), "Make the character female{Enter}");

    expect(mocks.workspace.sendMessage).toHaveBeenCalledWith(
      "conv_1",
      "Make the character female",
      undefined,
      ["media_owned1"],
      expect.any(Function),
    );
    expect(screen.queryByLabelText("Selected images")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reframe" })).toBeNull();
    expect(
      screen.getByRole("status", { name: "Sochestral is working" }),
    ).toBeInTheDocument();
  });

  it("submits a starter prompt as a normal message", async () => {
    const user = userEvent.setup();
    renderChat(<ChatWorkspace conversationId={null} />);

    await user.click(
      screen.getByRole("button", {
        name: "Which social accounts are connected?",
      }),
    );

    expect(mocks.workspace.sendMessage).toHaveBeenCalledWith(
      null,
      "Which social accounts are connected?",
      undefined,
      [],
      expect.any(Function),
    );
  });

  it("renders owned messages and loads older history (AC 1, AC 3)", async () => {
    const user = userEvent.setup();
    mocks.workspace.details = { conv_1: detail({ nextCursor: "older" }) };
    renderChat(<ChatWorkspace conversationId="conv_1" />);

    expect(screen.getByText("Check this post")).toBeInTheDocument();
    expect(screen.getByText("preview").tagName).toBe("STRONG");
    await user.click(screen.getByRole("button", { name: "Load older messages" }));

    expect(mocks.workspace.loadConversation).toHaveBeenCalledWith("conv_1", true);
  });

  it("renders a conversation detail that omits turnActivities", () => {
    const incomplete = {
      ...detail(),
      turnActivities: undefined,
    } as unknown as ConversationDetail;
    mocks.workspace.details = { conv_1: incomplete };
    renderChat(<ChatWorkspace conversationId="conv_1" />);

    expect(screen.getByText("Check this post")).toBeInTheDocument();
    expect(screen.getByText("preview").tagName).toBe("STRONG");
  });

  it("hides tool activity from the chat transcript", () => {
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
    renderChat(<ChatWorkspace conversationId="conv_1" />);

    expect(screen.queryByRole("button", { name: /Tool activity/i })).toBeNull();
    expect(screen.queryByText(/tool action/i)).toBeNull();
    expect(screen.queryByText("validate post")).toBeNull();
  });

  it("shows a non-expandable action label for completed prepare turns", () => {
    mocks.workspace.details = {
      conv_1: detail({
        runs: [
          {
            id: "run_1",
            status: "completed",
            safeError: null,
            thinkingText: null,
            explicitLiveIntent: false,
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
                toolName: "prepare_review",
                status: "succeeded",
                summary: { ok: true },
                safeError: null,
              },
            ],
            reviewGroups: [],
          },
        ],
      }),
    };
    renderChat(<ChatWorkspace conversationId="conv_1" />);

    expect(screen.getByLabelText("Drafting")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thinking,/i })).toBeNull();
    expect(
      screen.queryByText("Reasoning unavailable for this model."),
    ).toBeNull();
  });

  it("links to calendar and scheduled posts after a successful schedule", () => {
    mocks.workspace.details = {
      conv_1: detail({
        runs: [
          {
            id: "run_1",
            status: "completed",
            safeError: null,
            thinkingText: null,
            explicitLiveIntent: false,
            liveIntentKind: "schedule",
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
                toolName: "schedule_post",
                status: "succeeded",
                summary: {
                  ok: true,
                  scheduled: true,
                  calendarPath: "/app/calendar",
                  scheduledPath: "/app/scheduled",
                },
                safeError: null,
              },
            ],
            reviewGroups: [],
          },
        ],
      }),
    };
    renderChat(<ChatWorkspace conversationId="conv_1" />);

    expect(screen.getByLabelText("Scheduling")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open calendar" })).toHaveAttribute(
      "href",
      "/app/calendar",
    );
    expect(
      screen.getByRole("link", { name: "Scheduled posts" }),
    ).toHaveAttribute("href", "/app/scheduled");
  });

  it("advances the intent Q&A carousel and submits answers before acting", async () => {
    const user = userEvent.setup();
    let calls = 0;
    mocks.workspace.sendMessage = vi.fn(
      async (_id, _message, _retry, _media, onStreamEvent, intentAnswers) => {
        calls += 1;
        if (calls === 1 && !intentAnswers?.length) {
          onStreamEvent?.({
            type: "intent_questions",
            questions: [
              {
                id: "goal",
                prompt: "What should I do with this?",
                reason: "You asked for ideas and also mentioned posting.",
                options: [
                  {
                    id: "suggest_only",
                    label: "Suggest captions only",
                    recommended: true,
                  },
                  { id: "draft_review", label: "Draft a post for my review" },
                  { id: "publish_now", label: "Publish live now" },
                  { id: "custom", label: "Something else", custom: true },
                ],
              },
            ],
          });
        }
        return "conv_1";
      },
    );
    mocks.workspace.details = { conv_1: detail() };
    renderChat(<ChatWorkspace conversationId="conv_1" />);

    await user.type(
      screen.getByLabelText("Message Sochestral"),
      "Suggest captions and post{Enter}",
    );

    expect(await screen.findByLabelText("Clarify intent")).toBeInTheDocument();
    expect(screen.getByText("What should I do with this?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clarify intent" }));
    expect(
      screen.getByRole("button", { name: /What should I do with this\?/i }),
    ).toHaveAttribute("aria-expanded", "false");
    await user.click(
      screen.getByRole("button", { name: /What should I do with this\?/i }),
    );
    expect(
      screen.getByRole("button", { name: "Clarify intent" }),
    ).toHaveAttribute("aria-expanded", "true");

    await user.click(
      screen.getByRole("button", { name: /Suggest captions only/i }),
    );

    await waitFor(() => {
      expect(mocks.workspace.sendMessage).toHaveBeenCalledTimes(2);
    });
    expect(mocks.workspace.sendMessage).toHaveBeenLastCalledWith(
      "conv_1",
      "Suggest captions and post",
      undefined,
      [],
      expect.any(Function),
      [{ questionId: "goal", optionId: "suggest_only" }],
    );
  });

  it("opens the live preview aside without a View review launcher", async () => {
    vi.mocked(apiRequest).mockImplementation(async (path) => {
      if (path === "/connectors") {
        return {
          connectors: [
            {
              platform: "threads",
              state: "connected",
              accounts: [
                {
                  id: "acct_1",
                  username: "studio",
                  displayName: "Studio",
                  state: "connected",
                },
              ],
            },
          ],
        };
      }
      return {};
    });
    mocks.workspace.details = {
      conv_1: detail({
        turnActivities: [
          {
            requestMessageId: "msg_1",
            assistantMessageId: "msg_2",
            runId: "run_1",
            toolSummaries: [],
            reviewGroups: [
              {
                id: "review_1",
                conversationId: "conv_1",
                drafts: [
                  {
                    id: "draft_1",
                    platform: "threads",
                    body: "Hello threads",
                    mediaUrls: [],
                    selectedAccountId: "acct_1",
                    revision: 1,
                    status: "draft",
                    validation: {
                      errors: [],
                      warnings: [],
                      validatedRevision: 1,
                    },
                    latestAttempt: null,
                  },
                ],
              },
            ],
          },
        ],
      }),
    };
    const user = userEvent.setup();
    renderChat(<ChatWorkspace conversationId="conv_1" />);

    expect(screen.queryByRole("button", { name: /View review/i })).toBeNull();
    expect(
      await screen.findByLabelText("Live platform preview"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Threads post preview")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close preview" }));
    expect(screen.queryByLabelText("Live platform preview")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Show preview" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show preview" }));
    expect(screen.getByLabelText("Live platform preview")).toBeInTheDocument();
  });

  it("announces pending work and blocks another send (AC 2)", () => {
    mocks.workspace.pending = { conv_1: true };
    mocks.workspace.details = { conv_1: detail() };
    renderChat(<ChatWorkspace conversationId="conv_1" />);

    expect(
      screen.getByRole("status", { name: "Sochestral is working" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(screen.getByTestId("thinking-orb")).toBeInTheDocument();
    expect(screen.getByLabelText("Message Sochestral")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Attach images" })).toBeDisabled();
  });

  it("shows the sent message and a small assistant progress state immediately", async () => {
    const user = userEvent.setup();
    mocks.workspace.details = { conv_1: detail() };
    mocks.workspace.sendMessage = vi.fn(
      () => new Promise<string | null>(() => undefined),
    );
    renderChat(<ChatWorkspace conversationId="conv_1" />);

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

  it("names the live action from the tool the agent started", async () => {
    const user = userEvent.setup();
    mocks.workspace.details = { conv_1: detail() };
    mocks.workspace.sendMessage = vi.fn(
      async (_id, _message, _retry, _media, onStreamEvent) => {
        onStreamEvent?.({
          type: "tool_started",
          toolName: "propose_image_job",
        });
        return new Promise<string | null>(() => undefined);
      },
    );
    renderChat(<ChatWorkspace conversationId="conv_1" />);

    await user.type(
      screen.getByLabelText("Message Sochestral"),
      "Make a product photo{Enter}",
    );

    await waitFor(() => {
      expect(screen.getByText("Preparing an image")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("status", { name: "Sochestral is working" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("thinking-orb")).toBeInTheDocument();
    expect(screen.queryByText("Reading your message")).toBeNull();
  });

  it("requires confirmation before deleting an idle conversation (AC 1)", async () => {
    const user = userEvent.setup();
    mocks.workspace.details = { conv_1: detail() };
    renderChat(<ChatWorkspace conversationId="conv_1" />);

    await user.click(
      screen.getByRole("button", { name: "Delete this conversation" }),
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
    await user.click(screen.getByRole("button", { name: /^Delete$/ }));

    expect(mocks.workspace.deleteConversation).toHaveBeenCalledWith("conv_1");
    expect(mocks.push).toHaveBeenCalledWith("/app/workspace");
  });

  it("keeps image actions beside the thumbnail and edits from the chat input", async () => {
    const user = userEvent.setup();
    const { container } = renderChat(<ChatWorkspace conversationId={null} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File([new Uint8Array([1, 2, 3, 4])], "post.png", {
      type: "image/png",
    }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Adjust" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Reframe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Adjust" }));
    const composer = screen.getByLabelText("Message Sochestral");
    expect(composer).toHaveAttribute("placeholder", "Describe the edit");
    expect(screen.getByText("Type the change below, then send.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Reframe" })).toBeNull();

    await user.type(composer, "make it darker");
    expect(composer).toHaveValue("make it darker");
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() =>
      expect(createImageJob).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "prompt_edit",
          prompt: "make it darker",
          sourceMediaAssetId: "media_owned1",
        }),
      ),
    );
    expect(mocks.workspace.sendMessage).not.toHaveBeenCalled();
  });

  it("shows a setup status when Reframe is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(createImageJob).mockImplementation(
      () => new Promise(() => undefined),
    );
    const { container } = renderChat(<ChatWorkspace conversationId={null} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File([new Uint8Array([1, 2, 3, 4])], "post.png", {
      type: "image/png",
    }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Reframe" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Reframe" }));

    expect(screen.getByText("Setting up a reframe…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reframe" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});
