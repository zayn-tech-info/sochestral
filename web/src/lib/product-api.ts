export const apiBase =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown>,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    if (
      response.status === 401 &&
      typeof window !== "undefined" &&
      path !== "/auth/login"
    ) {
      const returnTo = window.location.pathname.startsWith("/app")
        ? window.location.pathname
        : "/app/workspace";
      window.location.assign(
        `/login?returnTo=${encodeURIComponent(returnTo)}`,
      );
    }
    throw new ApiError(
      response.status,
      typeof body.error === "string" ? body.error : "REQUEST_FAILED",
      body,
    );
  }
  return body as T;
}

export type ProductUser = {
  id: string;
  email: string | null;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sequence: number;
  createdAt: string;
  attachments?: MediaAttachment[];
};

export type MediaAttachment = {
  id: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  previewUrl: string;
};

export type PublishingMode = "always_draft" | "approve_for_me" | "full_access";

export type PublishingPreference = {
  currentMode: PublishingMode;
  effectiveMode: PublishingMode;
  revision: number;
  consentVersion: string | null;
  consentedAt: string | null;
  consentCurrent: boolean;
  policyVersion: string;
  enabled: boolean;
  authorityEventId: string | null;
};

export type Run = {
  id: string;
  status: "running" | "completed" | "failed";
  safeError: string | null;
  publishingMode?: PublishingMode;
  explicitLiveIntent?: boolean;
  liveIntentKind?: "live" | "draft" | "unclear" | null;
  thinkingText?: string | null;
};

export type StreamStep =
  | "checking_intent"
  | "clarifying_intent"
  | "preparing_draft"
  | "validating"
  | "publishing";

export type StreamEvent = {
  type: string;
  sequence?: number;
  step?: StreamStep;
  delta?: string;
  toolName?: string;
  status?: string;
  error?: string;
  result?: TurnResponse;
};

export const STREAM_STEP_LABELS: Record<StreamStep, string> = {
  checking_intent: "Checking intent",
  clarifying_intent: "Clarifying intent",
  preparing_draft: "Preparing a draft",
  validating: "Validating",
  publishing: "Publishing",
};

export async function apiStreamTurn(
  path: string,
  body: Record<string, unknown>,
  onEvent: (event: StreamEvent) => void,
): Promise<TurnResponse> {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (
      response.status === 401 &&
      typeof window !== "undefined"
    ) {
      const returnTo = window.location.pathname.startsWith("/app")
        ? window.location.pathname
        : "/app/workspace";
      window.location.assign(
        `/login?returnTo=${encodeURIComponent(returnTo)}`,
      );
    }
    throw new ApiError(
      response.status,
      typeof payload.error === "string" ? payload.error : "REQUEST_FAILED",
      payload,
    );
  }

  if (!response.body) {
    throw new ApiError(502, "STREAM_UNAVAILABLE", {});
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal: TurnResponse | null = null;
  let failedCode: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as StreamEvent;
      onEvent(event);
      if (event.type === "turn_completed" && event.result) {
        terminal = event.result as TurnResponse;
      }
      if (event.type === "turn_failed") {
        failedCode = event.error ?? "INTERNAL_ERROR";
        if (event.result) terminal = event.result as TurnResponse;
      }
    }
  }

  if (terminal) return terminal;
  if (failedCode) throw new ApiError(500, failedCode, {});
  throw new ApiError(502, "STREAM_INCOMPLETE", {});
}

export type ToolSummary = {
  id: string;
  runId: string;
  toolName: string;
  status: string;
  summary: Record<string, unknown> | null;
  safeError: string | null;
};

export type ReviewAttempt = {
  id: string;
  draftId: string;
  platform: string;
  state: "publishing" | "succeeded" | "failed" | "unknown";
  mcpPostId: string | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  completedAt: string | null;
  authorizationKind?: "manual" | "approve_for_me" | "full_access";
};

export type ReviewDraft = {
  id: string;
  platform: ConnectorPlatform;
  body: string;
  mediaUrls: string[];
  mediaItems?: Array<{ assetId: string | null; externalUrl: string | null }>;
  selectedAccountId: string | null;
  revision: number;
  status: string;
  validation: {
    errors: string[];
    warnings: string[];
    validatedRevision: number | null;
  };
  latestAttempt: ReviewAttempt | null;
};

export type ReviewGroup = {
  id: string;
  conversationId: string;
  drafts: ReviewDraft[];
};

export type TurnActivity = {
  requestMessageId: string;
  assistantMessageId: string;
  runId: string;
  toolSummaries: ToolSummary[];
  reviewGroups: ReviewGroup[];
};

export type ConversationDetail = {
  conversation: Conversation;
  messages: ChatMessage[];
  runs: Run[];
  toolSummaries: ToolSummary[];
  reviewGroups: ReviewGroup[];
  turnActivities: TurnActivity[];
  nextCursor: string | null;
};

export type TurnResponse = {
  conversation: Conversation;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  run: Run | null;
  toolSummaries: ToolSummary[];
  reviewGroups: ReviewGroup[];
  turnActivity: TurnActivity | null;
};

export type ConnectorPlatform =
  | "threads"
  | "linkedin_personal"
  | "instagram";

export type ConnectorSummary = {
  platform: ConnectorPlatform;
  state: "not_connected" | "connected" | "reconnect_required";
  accounts: Array<{
    id: string;
    username: string | null;
    displayName: string | null;
    state: "connected" | "reconnect_required";
    connectedAt?: string | null;
  }>;
};
