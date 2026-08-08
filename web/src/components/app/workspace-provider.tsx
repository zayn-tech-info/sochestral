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
  type Conversation,
  type ConversationDetail,
  type ProductUser,
  type StreamEvent,
  type StreamStep,
} from "@/lib/product-api";

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
  liveThinking: string;
  startNewChat: (launch: PendingLaunch) => void;
  takePendingLaunch: () => PendingLaunch | null;
  clearLaunchOptimistic: () => void;
  refreshConversations: (append?: boolean) => Promise<void>;
  loadConversation: (id: string, older?: boolean) => Promise<void>;
  sendMessage: (
    conversationId: string | null,
    message: string,
    retry?: RetryItem,
    mediaAssetIds?: string[],
    onStreamEvent?: (event: StreamEvent) => void,
  ) => Promise<string | null>;
  deleteConversation: (id: string) => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

function safeReturnPath(pathname: string): string {
  return pathname.startsWith("/app") ? pathname : "/app/workspace";
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
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
  const [liveThinking, setLiveThinking] = useState("");
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
      .then((currentUser) => {
        if (!active) return;
        setUser(currentUser);
        void refreshConversations().catch(() => {
          if (active) {
            setErrors((current) => ({
              ...current,
              conversations: "Conversation history is unavailable.",
            }));
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
  }, [pathname, refreshConversations, router]);

  const loadConversation = useCallback(
    async (id: string, older = false) => {
      setErrors((current) => ({ ...current, [id]: null }));
      try {
        const cursor = older ? detailsRef.current[id]?.nextCursor : null;
        const query = cursor
          ? `?limit=25&cursor=${encodeURIComponent(cursor)}`
          : "?limit=25";
        const result = await apiRequest<ConversationDetail>(
          `/orchestration/conversations/${id}${query}`,
        );
        setDetails((current) => {
          const incomingActivities = result.turnActivities ?? [];
          const normalized: ConversationDetail = {
            ...result,
            reviewGroups: result.reviewGroups ?? [],
            turnActivities: incomingActivities,
          };
          let next: Record<string, ConversationDetail>;
          if (!older || !current[id]) {
            next = { ...current, [id]: normalized };
          } else {
            const existingActivities = current[id].turnActivities ?? [];
            next = {
              ...current,
              [id]: {
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
              },
            };
          }
          detailsRef.current = next;
          return next;
        });
      } catch (error) {
        setErrors((current) => ({
          ...current,
          [id]:
            error instanceof ApiError && error.status === 404
              ? "This conversation could not be found."
              : "This conversation is unavailable right now.",
        }));
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (
      conversationId: string | null,
      message: string,
      retry?: RetryItem,
      mediaAssetIds: string[] = [],
      onStreamEvent?: (event: StreamEvent) => void,
    ) => {
      const key = conversationId ?? "new";
      const requestId =
        retry?.useSameRequestId && retry.requestId
          ? retry.requestId
          : crypto.randomUUID();
      setPending((current) => ({ ...current, [key]: true }));
      setErrors((current) => ({ ...current, [key]: null }));
      setRetries((current) => ({ ...current, [key]: null }));
      setLiveStep(null);
      setLiveThinking("");

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
          },
          (event) => {
            if (event.type === "step_started" && event.step) {
              setLiveStep(event.step);
            }
            if (event.type === "thinking_delta" && event.delta) {
              setLiveThinking((current) => `${current}${event.delta}`);
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
          setErrors((current) => ({
            ...current,
            conversations: "Conversation history could not refresh.",
          }));
        });
        return result.conversation.id;
      } catch (error) {
        const uncertain = !(error instanceof ApiError);
        const messageText =
          error instanceof ApiError
            ? error.code === "RUN_IN_PROGRESS"
              ? "Sochestral is already working in this conversation."
              : "That request could not be completed safely."
            : "The connection was interrupted. You can retry safely.";
        setErrors((current) => ({ ...current, [key]: messageText }));
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
        setLiveThinking("");
      }
    },
    [refreshConversations],
  );

  const deleteConversation = useCallback(async (id: string) => {
    await apiRequest<void>(`/orchestration/conversations/${id}`, {
      method: "DELETE",
    });
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
      liveThinking,
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
      liveThinking,
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
