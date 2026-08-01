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
  type Conversation,
  type ConversationDetail,
  type ProductUser,
  type TurnResponse,
} from "@/lib/product-api";

type RetryItem = {
  message: string;
  requestId: string;
  useSameRequestId: boolean;
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
  refreshConversations: (append?: boolean) => Promise<void>;
  loadConversation: (id: string, older?: boolean) => Promise<void>;
  sendMessage: (
    conversationId: string | null,
    message: string,
    retry?: RetryItem,
  ) => Promise<string | null>;
  deleteConversation: (id: string) => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

function safeReturnPath(pathname: string): string {
  return pathname.startsWith("/app") ? pathname : "/app";
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
  const cursorRef = useRef<string | null>(null);
  const detailsRef = useRef<Record<string, ConversationDetail>>({});

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
          let next: Record<string, ConversationDetail>;
          if (!older || !current[id]) {
            next = { ...current, [id]: result };
          } else {
            next = {
              ...current,
              [id]: {
                ...result,
                messages: [...result.messages, ...current[id].messages],
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
    ) => {
      const key = conversationId ?? "new";
      const requestId =
        retry?.useSameRequestId && retry.requestId
          ? retry.requestId
          : crypto.randomUUID();
      setPending((current) => ({ ...current, [key]: true }));
      setErrors((current) => ({ ...current, [key]: null }));
      setRetries((current) => ({ ...current, [key]: null }));

      try {
        const result = await apiRequest<TurnResponse>(
          conversationId
            ? `/orchestration/conversations/${conversationId}/messages`
            : "/orchestration/conversations",
          {
            method: "POST",
            body: JSON.stringify({ message, requestId }),
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
              ...result.toolSummaries,
              ...(current[result.conversation.id]?.toolSummaries ?? []),
            ],
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
          },
        }));
        return null;
      } finally {
        setPending((current) => ({ ...current, [key]: false }));
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
