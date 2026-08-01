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
        : "/app";
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
};

export type Run = {
  id: string;
  status: "running" | "completed" | "failed";
  safeError: string | null;
};

export type ToolSummary = {
  id: string;
  runId: string;
  toolName: string;
  status: string;
  summary: Record<string, unknown> | null;
  safeError: string | null;
};

export type ConversationDetail = {
  conversation: Conversation;
  messages: ChatMessage[];
  runs: Run[];
  toolSummaries: ToolSummary[];
  nextCursor: string | null;
};

export type TurnResponse = {
  conversation: Conversation;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  run: Run | null;
  toolSummaries: ToolSummary[];
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
  }>;
};
