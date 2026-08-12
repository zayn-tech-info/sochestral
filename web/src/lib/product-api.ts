export const apiBase = (() => {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  return raw && raw.length > 0 ? raw.replace(/\/$/, "") : "http://localhost:8787";
})();

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
  liveIntentKind?: "live" | "draft" | "schedule" | "unclear" | null;
  thinkingText?: string | null;
};

export type StreamStep =
  | "understanding"
  | "checking_intent"
  | "clarifying_intent"
  | "planning"
  | "preparing_draft"
  | "validating"
  | "scheduling"
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
  questions?: IntentQuestion[];
};

export type IntentQuestionOption = {
  id: string;
  label: string;
  recommended?: boolean;
  custom?: boolean;
};

export type IntentQuestion = {
  id: string;
  prompt: string;
  reason?: string;
  options: IntentQuestionOption[];
};

export type IntentAnswer = {
  questionId: string;
  optionId: string;
  customText?: string;
};

export const STREAM_STEP_LABELS: Record<StreamStep, string> = {
  understanding: "Reading your message",
  checking_intent: "Checking intent",
  clarifying_intent: "Clarifying intent",
  planning: "Planning from your context",
  preparing_draft: "Preparing a draft",
  validating: "Validating",
  scheduling: "Scheduling",
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
  intentQuestions?: IntentQuestion[] | null;
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
    avatarUrl?: string | null;
    state: "connected" | "reconnect_required";
    connectedAt?: string | null;
  }>;
};

export type ProfileEntry = {
  id: string;
  category: string;
  title: string | null;
  body: string;
  status: string;
  source: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type BusinessProfileResponse = {
  id: string | null;
  businessName: string | null;
  businessDescription: string | null;
  websiteUrl: string | null;
  targetAudience: string | null;
  industry: string | null;
  personaRole: string | null;
  personaRoleOther: string | null;
  primaryPlatforms: string[];
  attributionSource: string | null;
  attributionOther: string | null;
  setupStatus: "not_started" | "in_progress" | "complete";
  setupStep: string | null;
  competitorsSkipped: boolean;
  compiledNote: string;
  minimumComplete: boolean;
  sections: Record<string, ProfileEntry[]>;
  updatedAt: string;
};

export function getBusinessProfile() {
  return apiRequest<BusinessProfileResponse>("/profile");
}

export function patchBusinessProfile(
  body: Partial<{
    businessName: string | null;
    businessDescription: string | null;
    websiteUrl: string | null;
    targetAudience: string | null;
    industry: string | null;
    personaRole: string | null;
    personaRoleOther: string | null;
    primaryPlatforms: string[];
    attributionSource: string | null;
    attributionOther: string | null;
    skills: string[];
    setupStep: string | null;
    competitorsSkipped: boolean;
    redoSetup: boolean;
    confirmReset: boolean;
    completeSetup: boolean;
  }>,
) {
  return apiRequest<BusinessProfileResponse>("/profile", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function createProfileEntry(body: {
  category: string;
  title?: string | null;
  body: string;
}) {
  return apiRequest<ProfileEntry>("/profile/entries", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchProfileEntry(
  id: string,
  body: Partial<{ title: string | null; body: string; status: string }>,
) {
  return apiRequest<ProfileEntry>(`/profile/entries/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteProfileEntry(id: string) {
  return apiRequest<void>(`/profile/entries/${id}`, { method: "DELETE" });
}

export type CalendarStatusBucket =
  | "Scheduled"
  | "Done"
  | "Failed"
  | "Canceled";

export type CalendarAccount = {
  id: string;
  platform: ConnectorPlatform;
  label: string;
  username: string | null;
  avatarHint: string | null;
};

export type CalendarSlot = {
  scheduleId: string;
  platform: ConnectorPlatform;
  accountId: string;
  accountLabel: string;
  scheduledAt: string;
  statusBucket: CalendarStatusBucket;
  captionPreview: string;
  thumbUrl: string | null;
  canReschedule: boolean;
};

export type ScheduleDetail = CalendarSlot & {
  caption: string;
  media: string[];
  conversationId: string | null;
  draftId: string | null;
  canCancel: boolean;
  canEditContent: boolean;
};

export function getCalendarAccounts() {
  return apiRequest<{ accounts: CalendarAccount[] }>("/calendar/accounts");
}

export function getCalendarSlots(query: {
  from: string;
  to: string;
  timeZone: string;
  accountId?: string;
  accountIds?: string[];
  platform?: string;
}) {
  const params = new URLSearchParams({
    from: query.from,
    to: query.to,
    timeZone: query.timeZone,
  });
  const ids = [
    ...(query.accountIds ?? []),
    ...(query.accountId ? [query.accountId] : []),
  ];
  if (ids.length === 1) params.set("accountId", ids[0]!);
  else if (ids.length > 1) params.set("accountIds", ids.join(","));
  if (query.platform) params.set("platform", query.platform);
  return apiRequest<{ slots: CalendarSlot[]; timeZone: string }>(
    `/calendar/slots?${params.toString()}`,
  );
}

export function getCalendarSlot(scheduleId: string) {
  return apiRequest<ScheduleDetail>(
    `/calendar/slots/${encodeURIComponent(scheduleId)}`,
  );
}

export function createCalendarSlot(input: {
  platform: ConnectorPlatform;
  accountId: string;
  scheduledAt: string;
  caption: string;
  media?: string[];
}) {
  return createCalendarSlots({
    targets: [
      {
        platform: input.platform,
        accountId: input.accountId,
        scheduledAt: input.scheduledAt,
        caption: input.caption,
        ...(input.media ? { media: input.media } : {}),
      },
    ],
  }).then((result) => {
    const first = result.created[0];
    if (!first) {
      throw new ApiError(502, "INVALID_SCHEDULE_RESPONSE", {});
    }
    return first;
  });
}

export function createCalendarSlots(input: {
  targets: Array<{
    platform: ConnectorPlatform;
    accountId: string;
    scheduledAt: string;
    caption: string;
    media?: string[];
  }>;
  /** @deprecated Prefer per-target `media`. Shared media applies only when a target omits `media`. */
  media?: string[];
}) {
  return apiRequest<{ created: ScheduleDetail[] }>("/calendar/slots", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function composeCalendarCaptions(input: {
  message?: string;
  targets: Array<{
    accountId: string;
    platform: ConnectorPlatform;
    caption?: string;
  }>;
  focusAccountId?: string | null;
}) {
  return apiRequest<{
    assistantText: string;
    updates: Array<{ accountId: string; caption: string }>;
  }>("/calendar/compose-assist", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function rescheduleCalendarSlot(
  scheduleId: string,
  scheduledAt: string,
) {
  return apiRequest<ScheduleDetail>(
    `/calendar/slots/${encodeURIComponent(scheduleId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ scheduledAt }),
    },
  );
}

export function updateCalendarSlotContent(
  scheduleId: string,
  input: { caption?: string; media?: string[] },
) {
  const body: { caption?: string; media?: string[] } = {};
  if (typeof input.caption === "string") body.caption = input.caption;
  if (Array.isArray(input.media)) body.media = input.media;
  return apiRequest<ScheduleDetail>(
    `/calendar/slots/${encodeURIComponent(scheduleId)}/content`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export type MirrorCalendarTarget = {
  platform: ConnectorPlatform;
  accountId: string;
  scheduledAt: string;
  media?: string[];
};

export function mirrorCalendarSlot(
  scheduleId: string,
  input: {
    targets: MirrorCalendarTarget[];
    caption?: string;
    media?: string[];
  },
) {
  return apiRequest<{ created: ScheduleDetail[] }>(
    `/calendar/slots/${encodeURIComponent(scheduleId)}/mirror`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export type ScheduleRewriteAction = "regenerate" | "tweak" | "comment";

/** Selection rewrite without an existing schedule (create-board captions). */
export function rewriteCaptionSelection(input: {
  selection: string;
  action: ScheduleRewriteAction;
  instruction?: string;
}) {
  return apiRequest<{ suggestion: string }>("/calendar/rewrite-selection", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function rewriteCalendarSelection(
  scheduleId: string,
  input: {
    selection: string;
    action: ScheduleRewriteAction;
    instruction?: string;
  },
) {
  return apiRequest<{ suggestion: string }>(
    `/calendar/slots/${encodeURIComponent(scheduleId)}/rewrite-selection`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function cancelCalendarSlot(scheduleId: string) {
  return apiRequest<{ ok: true; scheduleId: string }>(
    `/calendar/slots/${encodeURIComponent(scheduleId)}`,
    { method: "DELETE" },
  );
}

export type ScheduledPostsSort = "scheduledAt:asc" | "scheduledAt:desc";

export type ScheduledPostsResponse = {
  posts: CalendarSlot[];
  timeZone: string;
  from: string;
  to: string;
  sort: ScheduledPostsSort;
  hasOlder: boolean;
  hasNewer: boolean;
};

export function getScheduledPosts(query: {
  from: string;
  to: string;
  timeZone: string;
  accountId?: string;
  accountIds?: string[];
  platform?: string;
  status?: CalendarStatusBucket;
  sort?: ScheduledPostsSort;
}) {
  const params = new URLSearchParams({
    from: query.from,
    to: query.to,
    timeZone: query.timeZone,
  });
  const ids = [
    ...(query.accountIds ?? []),
    ...(query.accountId ? [query.accountId] : []),
  ];
  if (ids.length === 1) params.set("accountId", ids[0]!);
  else if (ids.length > 1) params.set("accountIds", ids.join(","));
  if (query.platform) params.set("platform", query.platform);
  if (query.status) params.set("status", query.status);
  if (query.sort) params.set("sort", query.sort);
  return apiRequest<ScheduledPostsResponse>(
    `/scheduled/posts?${params.toString()}`,
  );
}
