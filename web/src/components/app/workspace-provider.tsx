"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ApiError,
  apiRequest,
  apiStreamTurn,
  getBusinessProfile,
  STREAM_TOOL_LABELS,
  type Conversation,
  type ConversationDetail,
  type IntentAnswer,
  type ProductUser,
  type StreamEvent,
  type StreamStep,
} from "@/lib/product-api";
import { userFacingError } from "@/lib/user-facing-error";
import { useToast } from "./toast-provider";

type RetryItem = {
  message: string;
  requestId: string;
  useSameRequestId: boolean;
  mediaAssetIds: string[];
};

export type PendingLaunchMedia = {
  key: string;
  previewUrl: string;
  fileName: string;
};

export type PendingLaunch = {
  message: string;
  mediaAssetIds: string[];
  optimisticMedia: PendingLaunchMedia[];
};

type WorkspaceValue = {
  user: ProductUser | null;
  authLoading: boolean;
  conversations: Conversation[];
  conversationsLoading: boolean;
  conversationCursor: string | null;
  details: Record<string, ConversationDetail>;
  pending: Record<string, boolean>;
  errors: Record<string, string | null>;
  retries: Record<string, RetryItem | null>;
  pendingLaunch: PendingLaunch | null;
  launchOptimistic: PendingLaunch | null;
  liveStep: StreamStep | null;
  liveToolName: string | null;
  startNewChat: (launch: PendingLaunch) => void;
  takePendingLaunch: () => PendingLaunch | null;
  clearLaunchOptimistic: () => void;
  refreshConversations: (append?: boolean) => Promise<void>;
  loadConversation: (id: string, older?: boolean) => Promise<ConversationDetail | null>;
  sendMessage: (
    conversationId: string | null,
    message: string,
    retry?: RetryItem,
    mediaAssetIds?: string[],
    onStreamEvent?: (event: StreamEvent) => void,
    intentAnswers?: IntentAnswer[],
  ) => Promise<string | null>;
  deleteConversation: (id: string) => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

function safeReturnPath(pathname: string): string {
  return pathname.startsWith("/app") ? pathname : "/app/workspace";
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<ProductUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationCursor, setConversationCursor] = useState<string | null>(
    null,
  );
  const [details, setDetails] = useState<
    Record<string, ConversationDetail>
  >({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [retries, setRetries] = useState<Record<string, RetryItem | null>>({});
  const [pendingLaunch, setPendingLaunch] = useState<PendingLaunch | null>(
    null,
  );
  const [launchOptimistic, setLaunchOptimistic] =
    useState<PendingLaunch | null>(null);
  const [liveStep, setLiveStep] = useState<StreamStep | null>(null);
  const [liveToolName, setLiveToolName] = useState<string | null>(null);
  const pendingLaunchRef = useRef<PendingLaunch | null>(null);
  const launchStartedRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const detailsRef = useRef<Record<string, ConversationDetail>>({});

  const startNewChat = useCallback(
    (launch: PendingLaunch) => {
      pendingLaunchRef.current = launch;
      launchStartedRef.current = false;
      setPendingLaunch(launch);
      setLaunchOptimistic(launch);
      router.push("/app/chat/new");
    },
    [router],
  );

  const takePendingLaunch = useCallback(() => {
    if (launchStartedRef.current) return null;
    const launch = pendingLaunchRef.current;
    if (!launch) return null;
    launchStartedRef.current = true;
    pendingLaunchRef.current = null;
    setPendingLaunch(null);
    return launch;
  }, []);

  const clearLaunchOptimistic = useCallback(() => {
    setLaunchOptimistic(null);
    launchStartedRef.current = false;
  }, []);

  const refreshConversations = useCallback(async (append = false) => {
    setConversationsLoading(true);
    try {
      const cursor = append ? cursorRef.current : null;
      const query = cursor
        ? `?limit=25&cursor=${encodeURIComponent(cursor)}`
        : "?limit=25";
      const result = await apiRequest<{
        conversations: Conversation[];
        nextCursor: string | null;
      }>(`/orchestration/conversations${query}`);
      setConversations((current) =>
        append ? [...current, ...result.conversations] : result.conversations,
      );
      setConversationCursor(result.nextCursor);
      cursorRef.current = result.nextCursor;
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<ProductUser>("/auth/me")
      .then(async (currentUser) => {
        if (!active) return;
        setUser(currentUser);

        const onOnboarding = pathname.startsWith("/app/onboarding");
        try {
          const profile = await getBusinessProfile();
          if (!active) return;
          if (profile.setupStatus !== "complete") {
            if (!onOnboarding) {
              router.replace("/app/onboarding");
            }
            return;
          }
          if (onOnboarding) {
            router.replace("/app/workspace");
            return;
          }
        } catch {
          if (!active) return;
          if (!onOnboarding) {
            toast({
              tone: "error",
              title: "Could not load your profile. Refresh and try again.",
            });
            return;
          }
        }

        void refreshConversations().catch(() => {
          if (active) {
            const messageText = "Conversation history is unavailable.";
            setErrors((current) => ({
              ...current,
              conversations: messageText,
            }));
            toast({ tone: "error", title: messageText });
          }
        });
      })
      .catch(() => {
        if (!active) return;
        const returnTo = encodeURIComponent(safeReturnPath(pathname));
        router.replace(`/login?returnTo=${returnTo}`);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pathname, refreshConversations, router, toast]);

  const loadConversation = useCallback(
    async (id: string, older = false): Promise<ConversationDetail | null> => {
      setErrors((current) => ({ ...current, [id]: null }));
      try {
        const cursor = older ? detailsRef.current[id]?.nextCursor : null;
        const query = cursor
          ? `?limit=25&cursor=${encodeURIComponent(cursor)}`
          : "?limit=25";
        const result = await apiRequest<ConversationDetail>(
          `/orchestration/conversations/${id}${query}`,
        );
        const incomingActivities = result.turnActivities ?? [];
        const normalized: ConversationDetail = {
          ...result,
          reviewGroups: result.reviewGroups ?? [],
          turnActivities: incomingActivities,
        };
        let loaded = normalized;
        setDetails((current) => {
          let next: Record<string, ConversationDetail>;
          if (!older || !current[id]) {
            next = { ...current, [id]: normalized };
            loaded = normalized;
          } else {
            const existingActivities = current[id].turnActivities ?? [];
            const merged: ConversationDetail = {
              ...normalized,
              messages: [...normalized.messages, ...current[id].messages],
              turnActivities: [
                ...incomingActivities,
                ...existingActivities.filter(
                  (activity) =>
                    !incomingActivities.some(
                      (incoming) =>
                        incoming.assistantMessageId === activity.assistantMessageId,
                    ),
                ),
              ],
            };
            next = {
              ...current,
              [id]: merged,
            };
            loaded = merged;
          }
          detailsRef.current = next;
          return next;
        });
        return loaded;
      } catch (error) {
        setErrors((current) => ({
          ...current,
          [id]:
            error instanceof ApiError && error.status === 404
              ? "This conversation could not be found."
              : "This conversation is unavailable right now.",
        }));
        return null;
      }
    },
    [],
  );

  const waitForIdleConversation = useCallback(
    async (conversationId: string, pendingKeys: string[]) => {
      const markPending = (value: boolean) => {
        setPending((current) => {
          const next = { ...current };
          for (const key of pendingKeys) {
            next[key] = value;
          }
          return next;
        });
      };
      markPending(true);
      setLiveStep((current) => current ?? "understanding");
      for (const key of pendingKeys) {
        setErrors((current) => ({ ...current, [key]: null }));
        setRetries((current) => ({ ...current, [key]: null }));
      }

      for (let attempt = 0; attempt < 90; attempt += 1) {
        const detail = await loadConversation(conversationId);
        const stillRunning = detail?.runs.some((run) => run.status === "running");
        if (!stillRunning) {
          markPending(false);
          setLiveStep(null);
          void refreshConversations().catch(() => undefined);
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      markPending(false);
      setLiveStep(null);
      setErrors((current) => ({
        ...current,
        [conversationId]:
          "This is taking longer than expected. Refresh the conversation, or try again in a moment.",
      }));
      return false;
    },
    [loadConversation, refreshConversations],
  );

  const sendMessage = useCallback(
    async (
      conversationId: string | null,
      message: string,
      retry?: RetryItem,
      mediaAssetIds: string[] = [],
      onStreamEvent?: (event: StreamEvent) => void,
      intentAnswers: IntentAnswer[] = [],
    ) => {
      const key = conversationId ?? "new";
      const requestId =
        retry?.useSameRequestId && retry.requestId
          ? retry.requestId
          : crypto.randomUUID();
      setPending((current) => ({ ...current, [key]: true }));
      setErrors((current) => ({ ...current, [key]: null }));
      setRetries((current) => ({ ...current, [key]: null }));
      setLiveStep("understanding");
      setLiveToolName(null);

      try {
        const effectiveMediaAssetIds = retry?.mediaAssetIds ?? mediaAssetIds;
        const path = conversationId
          ? `/orchestration/conversations/${conversationId}/messages/stream`
          : "/orchestration/conversations/stream";
        const result = await apiStreamTurn(
          path,
          {
            message,
            requestId,
            ...(effectiveMediaAssetIds.length > 0
              ? { mediaAssetIds: effectiveMediaAssetIds }
              : {}),
            ...(intentAnswers.length > 0 ? { intentAnswers } : {}),
          },
          (event) => {
            if (event.type === "step_started" && event.step) {
              setLiveStep(event.step);
            }
            if (
              event.type === "tool_started" &&
              event.toolName &&
              STREAM_TOOL_LABELS[event.toolName]
            ) {
              setLiveToolName(event.toolName);
            }
            onStreamEvent?.(event);
          },
        );
        setDetails((current) => {
          const next = {
            ...current,
            [result.conversation.id]: {
            conversation: result.conversation,
            messages: [
              ...(current[result.conversation.id]?.messages ?? []),
              result.userMessage,
              result.assistantMessage,
            ],
            runs: result.run
              ? [
                  result.run,
                  ...(current[result.conversation.id]?.runs ?? []),
                ]
              : current[result.conversation.id]?.runs ?? [],
            toolSummaries: [
              ...(result.toolSummaries ?? []),
              ...(current[result.conversation.id]?.toolSummaries ?? []),
            ],
            reviewGroups: result.reviewGroups ?? [],
            turnActivities: result.turnActivity
              ? [
                  result.turnActivity,
                  ...(current[result.conversation.id]?.turnActivities ?? []).filter(
                    (activity) =>
                      activity.assistantMessageId !==
                      result.turnActivity?.assistantMessageId,
                  ),
                ]
              : current[result.conversation.id]?.turnActivities ?? [],
            nextCursor:
              current[result.conversation.id]?.nextCursor ?? null,
          },
          };
          detailsRef.current = next;
          return next;
        });
        void refreshConversations().catch(() => {
          const messageText = "Conversation history could not refresh.";
          setErrors((current) => ({
            ...current,
            conversations: messageText,
          }));
          toast({ tone: "error", title: messageText });
        });
        return result.conversation.id;
      } catch (error) {
        const busy =
          error instanceof ApiError && error.code === "RUN_IN_PROGRESS";
        const uncertain = !(error instanceof ApiError);
        if (conversationId && (busy || uncertain)) {
          // Keep the in-chat working state instead of a conflict toast; wait for the active run.
          const finished = await waitForIdleConversation(conversationId, [
            key,
            conversationId,
          ]);
          if (finished || busy) {
            return finished ? conversationId : null;
          }
        }
        const messageText =
          error instanceof ApiError
            ? busy
              ? userFacingError("RUN_IN_PROGRESS")
              : error.code === "INVALID_MESSAGE"
                ? typeof error.details.message === "string" &&
                  error.details.message.trim() &&
                  error.details.message !== "INVALID_MESSAGE"
                  ? error.details.message
                  : userFacingError("INVALID_MESSAGE")
                : userFacingError(error, {
                    fallback:
                      "That request could not be completed safely.",
                  })
            : "The connection was interrupted. You can retry safely.";
        setErrors((current) => ({ ...current, [key]: messageText }));
        toast({
          tone: busy ? "info" : "error",
          title: messageText,
        });
        setRetries((current) => ({
          ...current,
          [key]: {
            message,
            requestId,
            useSameRequestId: uncertain,
            mediaAssetIds: retry?.mediaAssetIds ?? mediaAssetIds,
          },
        }));
        return null;
      } finally {
        setPending((current) => ({ ...current, [key]: false }));
        setLiveStep(null);
        setLiveToolName(null);
      }
    },
    [refreshConversations, toast, waitForIdleConversation],
  );

  const deleteConversation = useCallback(async (id: string) => {
    try {
      await apiRequest<void>(`/orchestration/conversations/${id}`, {
        method: "DELETE",
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "RUN_IN_PROGRESS") {
        throw new ApiError(409, "RUN_IN_PROGRESS", {
          error: "RUN_IN_PROGRESS",
          message:
            "A publish is still finishing for this conversation. Wait a moment, then delete again.",
        });
      }
      throw error;
    }
    setConversations((current) =>
      current.filter((conversation) => conversation.id !== id),
    );
    setDetails((current) => {
      const next = { ...current };
      delete next[id];
      detailsRef.current = next;
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      user,
      authLoading,
      conversations,
      conversationsLoading,
      conversationCursor,
      details,
      pending,
      errors,
      retries,
      pendingLaunch,
      launchOptimistic,
      liveStep,
      liveToolName,
      startNewChat,
      takePendingLaunch,
      clearLaunchOptimistic,
      refreshConversations,
      loadConversation,
      sendMessage,
      deleteConversation,
    }),
    [
      user,
      authLoading,
      conversations,
      conversationsLoading,
      conversationCursor,
      details,
      pending,
      errors,
      retries,
      pendingLaunch,
      launchOptimistic,
      liveStep,
      liveToolName,
      startNewChat,
      takePendingLaunch,
      clearLaunchOptimistic,
      refreshConversations,
      loadConversation,
      sendMessage,
      deleteConversation,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  }
  return value;
}
