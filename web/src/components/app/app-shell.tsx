"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Settings,
} from "lucide-react";
import { motion } from "motion/react";

import { apiRequest } from "@/lib/product-api";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { MobileSheet } from "./mobile-sheet";
import { productMotion } from "./product-motion-provider";
import { useWorkspace } from "./workspace-provider";

function NavigationContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const motionScope = onNavigate ? "mobile" : "desktop";
  const chatActive =
    pathname === "/app" || pathname.startsWith("/app/chat/");
  const settingsActive = pathname.startsWith("/app/settings");
  const { conversations, conversationsLoading, conversationCursor, refreshConversations, user } =
    useWorkspace();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-2 pb-4">
        <Brand />
      </div>
      <Link
        href="/app"
        onClick={onNavigate}
        className="new-chat-button"
      >
        <Plus className="size-4" aria-hidden="true" />
        New chat
      </Link>
      <nav aria-label="Product" className="mt-5 grid gap-1">
        <Link
          href="/app"
          onClick={onNavigate}
          className={cn(
            "nav-item",
            chatActive ? "nav-item-active" : "",
          )}
        >
          {chatActive ? (
            <motion.span
              layoutId={`primary-nav-indicator-${motionScope}`}
              className="nav-active-indicator"
              transition={productMotion.sheet}
              aria-hidden="true"
            />
          ) : null}
          <MessageSquare className="size-4" aria-hidden="true" />
          <span>Chat</span>
        </Link>
        <Link
          href="/app/settings/connectors"
          onClick={onNavigate}
          className={cn(
            "nav-item",
            settingsActive ? "nav-item-active" : "",
          )}
        >
          {settingsActive ? (
            <motion.span
              layoutId={`primary-nav-indicator-${motionScope}`}
              className="nav-active-indicator"
              transition={productMotion.sheet}
              aria-hidden="true"
            />
          ) : null}
          <Settings className="size-4" aria-hidden="true" />
          <span>Settings</span>
        </Link>
      </nav>

      <section className="mt-7 min-h-0 flex-1" aria-labelledby="recent-title">
        <div className="mb-2 flex items-center justify-between px-3">
          <h2 id="recent-title" className="eyebrow">
            Recent
          </h2>
          {conversationsLoading ? (
            <span className="sr-only" role="status">
              Loading conversations
            </span>
          ) : null}
        </div>
        <ul className="conversation-list">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/app/chat/${conversation.id}`}
                onClick={onNavigate}
                className={cn(
                  "conversation-link",
                  pathname.endsWith(conversation.id)
                    ? "conversation-link-active"
                    : "",
                )}
              >
                {conversation.title}
              </Link>
            </li>
          ))}
        </ul>
        {conversationCursor ? (
          <button
            type="button"
            className="load-more-button"
            onClick={() => void refreshConversations(true)}
            disabled={conversationsLoading}
          >
            Load more
          </button>
        ) : null}
      </section>

      <footer className="mt-4 border-t border-border pt-4">
        <p className="truncate px-3 text-sm text-muted-foreground">
          {user?.email ?? "Signed in"}
        </p>
        <button
          type="button"
          className="nav-item mt-2 w-full"
          onClick={async () => {
            await apiRequest<void>("/auth/logout", { method: "POST" }).catch(
              () => undefined,
            );
            window.location.assign("/login");
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </button>
      </footer>
    </div>
  );
}

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { authLoading } = useWorkspace();
  const [navOpen, setNavOpen] = useState(false);

  if (authLoading) {
    return (
      <main id="main-content" className="app-loading" role="status">
        <Brand />
        <span>Opening your workspace</span>
      </main>
    );
  }

  return (
    <div className="app-frame">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <aside className="app-nav" aria-label="Workspace navigation">
        <NavigationContent />
      </aside>

      <div className="app-center">
        <header className="app-mobile-header">
          <button
            type="button"
            className="icon-button"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <Brand compact />
          <span className="size-11" aria-hidden="true" />
        </header>
        <motion.main
          key={pathname}
          id="main-content"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={productMotion.enter}
          className="app-main"
        >
          {title ? (
            <header className="app-page-heading">
              <div>
                <h1>{title}</h1>
                {description ? <p>{description}</p> : null}
              </div>
              {actions ? <div className="app-page-actions">{actions}</div> : null}
            </header>
          ) : null}
          {children}
        </motion.main>
      </div>

      <MobileSheet
        open={navOpen}
        title="Navigation"
        onClose={() => setNavOpen(false)}
      >
        <NavigationContent onNavigate={() => setNavOpen(false)} />
      </MobileSheet>
    </div>
  );
}
