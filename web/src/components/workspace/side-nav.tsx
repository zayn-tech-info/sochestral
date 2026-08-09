"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  FileText,
  ImageIcon,
  Link2,
  LogOut,
  MessageSquare,
  Settings,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { apiRequest } from "@/lib/product-api";
import { cn } from "@/lib/utils";
import { productMotion } from "@/components/app/product-motion-provider";
import { useWorkspace } from "@/components/app/workspace-provider";
import {
  HoverDetails,
  RevealLabel,
} from "@/components/workspace/hover-details";
import { useWorkspacePanels } from "@/components/workspace/slide-over-panel";

type SideNavProps = {
  expanded?: boolean;
  onNavigate?: () => void;
};

const RAIL_COLLAPSED = 72;
const RAIL_EXPANDED = 252;
const RECENT_LIMIT = 5;

const items = [
  {
    href: "/app/workspace",
    label: "AI Workspace",
    icon: Sparkles,
    match: (p: string) =>
      p === "/app" ||
      p === "/app/workspace" ||
      p.startsWith("/app/chat/"),
    kind: "link" as const,
  },
  {
    href: "/app/calendar",
    label: "Calendar",
    icon: CalendarDays,
    match: (p: string) => p.startsWith("/app/calendar"),
    kind: "link" as const,
  },
  {
    href: "/app/scheduled",
    label: "Scheduled Posts",
    icon: CalendarDays,
    match: (p: string) => p.startsWith("/app/scheduled"),
    kind: "link" as const,
  },
  {
    href: "#",
    label: "Drafts",
    icon: FileText,
    match: () => false,
    kind: "soon" as const,
  },
  {
    href: "#",
    label: "Analytics",
    icon: BarChart3,
    match: () => false,
    kind: "soon" as const,
  },
] as const;

const settingsLinks = [
  {
    href: "/app/settings/profile",
    label: "Business profile",
    icon: FileText,
    match: (p: string) => p.startsWith("/app/settings/profile"),
  },
  {
    href: "/app/settings/connectors",
    label: "Connected Accounts",
    icon: Link2,
    match: (p: string) => p.startsWith("/app/settings/connectors"),
  },
  {
    href: "/app/settings/brand-assets",
    label: "Brand Assets",
    icon: ImageIcon,
    match: (p: string) => p.startsWith("/app/settings/brand-assets"),
  },
] as const;

function RailItemShell({
  label,
  open,
  children,
}: {
  label: string;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <HoverDetails label={label} detailsVisible={open}>
      {children}
    </HoverDetails>
  );
}

export function SideNav({ expanded = false, onNavigate }: SideNavProps) {
  const pathname = usePathname();
  const motionScope = onNavigate ? "mobile" : "desktop";
  const { user, conversations, conversationsLoading } = useWorkspace();
  const { setOpenPanel } = useWorkspacePanels();
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [recentOpen, setRecentOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const closeTimer = useRef<number | null>(null);
  const initial = (user?.email?.[0] ?? "S").toUpperCase();
  const open = expanded || hovered;
  const profileLabel = user?.email?.split("@")[0] ?? "Workspace";
  const recent = conversations.slice(0, RECENT_LIMIT);
  const settingsActive = pathname.startsWith("/app/settings");

  useEffect(() => {
    if (settingsActive) setSettingsOpen(true);
  }, [settingsActive]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  function openRail() {
    if (expanded) return;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setHovered(true);
  }

  function scheduleCloseRail() {
    if (expanded) return;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHovered(false), 140);
  }

  const body = (
    <div className={cn("os-rail", open && "os-rail-expanded")}>
      <RailItemShell label="Sochestral" open={open}>
        <Link
          href="/app/workspace"
          className="os-rail-brand"
          onClick={onNavigate}
          aria-label="Sochestral home"
        >
          <span className="os-rail-mark" aria-hidden="true">
            S
          </span>
          <RevealLabel show={open} className="os-rail-brand-text">
            Sochestral
          </RevealLabel>
        </Link>
      </RailItemShell>

      <nav aria-label="Product" className="os-rail-nav">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.match(pathname);
          if (item.kind === "soon") {
            return (
              <RailItemShell key={item.label} label={`${item.label} (soon)`} open={open}>
                <button
                  type="button"
                  className="os-rail-item os-rail-item-soon"
                  disabled
                  aria-label={`${item.label} (coming soon)`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <RevealLabel show={open} className="os-rail-label">
                    {item.label}
                  </RevealLabel>
                </button>
              </RailItemShell>
            );
          }
          return (
            <RailItemShell key={item.label} label={item.label} open={open}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn("os-rail-item", active && "os-rail-item-active")}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
              >
                {active ? (
                  <motion.span
                    layoutId={`os-rail-indicator-${motionScope}`}
                    className="os-rail-indicator"
                    transition={
                      reduceMotion ? { duration: 0 } : productMotion.sheet
                    }
                    aria-hidden="true"
                  />
                ) : null}
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <RevealLabel show={open} className="os-rail-label">
                  {item.label}
                </RevealLabel>
              </Link>
            </RailItemShell>
          );
        })}
      </nav>

      <section className="os-rail-recent" aria-label="Your recent activities">
        {open ? (
          <>
            <button
              type="button"
              className="os-rail-recent-head"
              aria-expanded={recentOpen}
              onClick={() => setRecentOpen((current) => !current)}
            >
              <span>Your recent activities</span>
              <ChevronDown
                className={cn(
                  "size-3.5 os-rail-recent-caret",
                  recentOpen && "os-rail-recent-caret-open",
                )}
                aria-hidden="true"
              />
            </button>
            <AnimatePresence initial={false}>
              {recentOpen ? (
                <motion.div
                  key="recent-list"
                  initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={
                    reduceMotion ? undefined : { opacity: 0, height: 0 }
                  }
                  transition={
                    reduceMotion ? { duration: 0 } : productMotion.quick
                  }
                  className="os-rail-recent-body"
                >
                  {conversationsLoading && recent.length === 0 ? (
                    <p className="os-rail-recent-empty">Loading…</p>
                  ) : recent.length === 0 ? (
                    <p className="os-rail-recent-empty">
                      No chats yet. Start one in AI Workspace.
                    </p>
                  ) : (
                    <ul className="os-rail-recent-list">
                      {recent.map((conversation) => {
                        const active = pathname === `/app/chat/${conversation.id}`;
                        return (
                          <li key={conversation.id}>
                            <Link
                              href={`/app/chat/${conversation.id}`}
                              onClick={onNavigate}
                              className={cn(
                                "os-rail-recent-item",
                                active && "os-rail-recent-item-active",
                              )}
                              title={conversation.title}
                              aria-current={active ? "page" : undefined}
                            >
                              {conversation.title}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </>
        ) : (
          <RailItemShell label="Your recent activities" open={false}>
            <button
              type="button"
              className="os-rail-item"
              aria-label="Your recent activities"
              onClick={openRail}
            >
              <MessageSquare className="size-4 shrink-0" aria-hidden="true" />
            </button>
          </RailItemShell>
        )}
      </section>

      <div className="os-rail-footer">
        <RailItemShell label={profileLabel} open={open}>
          <button
            type="button"
            className="os-rail-item"
            aria-label="Open connected accounts panel"
            onClick={() => {
              setOpenPanel("connectors");
              onNavigate?.();
            }}
          >
            <span className="os-rail-avatar" aria-hidden="true">
              {initial}
            </span>
            <RevealLabel show={open} className="os-rail-label truncate">
              {profileLabel}
            </RevealLabel>
          </button>
        </RailItemShell>
        {open ? (
          <section className="os-rail-settings" aria-label="Settings">
            <button
              type="button"
              className={cn(
                "os-rail-item os-rail-settings-head",
                settingsActive && "os-rail-item-active",
              )}
              aria-expanded={settingsOpen}
              aria-current={settingsActive ? "page" : undefined}
              onClick={() => setSettingsOpen((current) => !current)}
            >
              <Settings className="size-4 shrink-0" aria-hidden="true" />
              <span className="os-rail-label">Settings</span>
              <ChevronDown
                className={cn(
                  "size-3.5 os-rail-recent-caret ml-auto",
                  settingsOpen && "os-rail-recent-caret-open",
                )}
                aria-hidden="true"
              />
            </button>
            <AnimatePresence initial={false}>
              {settingsOpen ? (
                <motion.div
                  key="settings-list"
                  initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={
                    reduceMotion ? undefined : { opacity: 0, height: 0 }
                  }
                  transition={
                    reduceMotion ? { duration: 0 } : productMotion.quick
                  }
                  className="os-rail-settings-body"
                >
                  <ul className="os-rail-recent-list">
                    {settingsLinks.map((item) => {
                      const active = item.match(pathname);
                      const Icon = item.icon;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={onNavigate}
                            className={cn(
                              "os-rail-recent-item os-rail-settings-link",
                              active && "os-rail-recent-item-active",
                            )}
                            aria-current={active ? "page" : undefined}
                          >
                            <Icon
                              className="size-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            <span>{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        ) : (
          <RailItemShell label="Settings" open={false}>
            <Link
              href="/app/settings"
              onClick={onNavigate}
              className={cn(
                "os-rail-item",
                settingsActive && "os-rail-item-active",
              )}
              aria-label="Settings"
              aria-current={settingsActive ? "page" : undefined}
            >
              <Settings className="size-4 shrink-0" aria-hidden="true" />
            </Link>
          </RailItemShell>
        )}
        <RailItemShell label="Sign out" open={open}>
          <button
            type="button"
            className="os-rail-item"
            aria-label="Sign out"
            onClick={async () => {
              await apiRequest<void>("/auth/logout", { method: "POST" }).catch(
                () => undefined,
              );
              window.location.assign("/login");
            }}
          >
            <LogOut className="size-4 shrink-0" aria-hidden="true" />
            <RevealLabel show={open} className="os-rail-label">
              Sign out
            </RevealLabel>
          </button>
        </RailItemShell>
      </div>
    </div>
  );

  if (expanded) {
    return body;
  }

  return (
    <motion.aside
      className={cn(
        "os-nav-rail os-nav-rail-compact",
        open && "os-nav-rail-open",
      )}
      aria-label="Workspace navigation"
      initial={false}
      animate={{
        width: open ? RAIL_EXPANDED : RAIL_COLLAPSED,
        boxShadow: open
          ? "0 1px 2px rgb(15 23 42 / 4%), 0 12px 32px rgb(15 23 42 / 8%)"
          : "0 0 0 rgb(0 0 0 / 0)",
      }}
      transition={reduceMotion ? { duration: 0 } : productMotion.rail}
      onHoverStart={openRail}
      onHoverEnd={scheduleCloseRail}
      onFocusCapture={openRail}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          scheduleCloseRail();
        }
      }}
    >
      {body}
    </motion.aside>
  );
}
