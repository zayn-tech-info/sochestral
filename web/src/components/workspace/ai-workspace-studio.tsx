"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CalendarDays,
  Megaphone,
  Sparkles,
  Target,
  WandSparkles,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { productMotion } from "@/components/app/product-motion-provider";
import { useWorkspace } from "@/components/app/workspace-provider";
import { ComposerCommand } from "@/components/workspace/composer-command";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { cn } from "@/lib/utils";

const RECENT_PREVIEW = 3;

const promptPills = [
  {
    label: "Give me ideas",
    prompt:
      "Generate a full week of social content ideas for my connected channels.",
    accent: true,
    icon: Sparkles,
  },
  {
    label: "New campaign",
    prompt:
      "Draft a product launch campaign across Threads, LinkedIn, and Instagram.",
    icon: Megaphone,
  },
  {
    label: "Build a calendar",
    prompt:
      "Help me build next month's content calendar with themes and formats.",
    icon: CalendarDays,
  },
  {
    label: "Improve brand voice",
    prompt: "Help me define a clear brand voice for social posts.",
    icon: WandSparkles,
  },
  {
    label: "Launch announcement",
    prompt:
      "Repurpose a product update into Threads, LinkedIn, and Instagram drafts.",
    icon: Target,
  },
] as const;

function relativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function AiWorkspaceStudio() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { user, conversations, conversationsLoading, sendMessage, pending } =
    useWorkspace();
  const [showAllChats, setShowAllChats] = useState(false);
  const busy = Boolean(pending.new);

  const firstName = useMemo(() => {
    const local = user?.email?.split("@")[0] ?? "there";
    return local.charAt(0).toUpperCase() + local.slice(1);
  }, [user?.email]);

  const visibleChats = showAllChats
    ? conversations
    : conversations.slice(0, RECENT_PREVIEW);
  const hasMoreChats = conversations.length > RECENT_PREVIEW;

  async function startPrompt(prompt: string) {
    if (busy) return;
    const id = await sendMessage(null, prompt);
    if (id) router.push(`/app/chat/${id}`);
  }

  return (
    <WorkspaceShell>
      <div className="os-welcome">
        <header className="os-welcome-hero">
          <h1>Welcome back, {firstName}.</h1>
        </header>

        <ComposerCommand
          autoFocus
          className="os-composer-landing"
          placeholder="Ask Sochestral to plan a week of posts, draft a campaign, or refine brand voice…"
        />

        <div className="os-prompt-pills" role="list" aria-label="Suggested prompts">
          {promptPills.map((item) => {
            const Icon = item.icon;
            return (
              <motion.button
                key={item.label}
                type="button"
                role="listitem"
                className={cn(
                  "os-prompt-pill",
                  "accent" in item && item.accent && "os-prompt-pill-accent",
                )}
                disabled={busy}
                onClick={() => void startPrompt(item.prompt)}
                whileHover={reduceMotion || busy ? undefined : { y: -1 }}
                transition={productMotion.quick}
              >
                {"accent" in item && item.accent ? (
                  <Icon className="size-3.5" aria-hidden="true" />
                ) : (
                  <span className="os-prompt-pill-plus" aria-hidden="true">
                    +
                  </span>
                )}
                {item.label}
              </motion.button>
            );
          })}
        </div>

        <section className="os-welcome-activity" aria-labelledby="recent-chats-title">
          <div className="os-welcome-activity-head">
            <h2 id="recent-chats-title">Recent chats</h2>
            {conversations.length > 0 ? (
              <span className="os-welcome-activity-meta">
                {conversations.length} conversation
                {conversations.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>

          {conversationsLoading && conversations.length === 0 ? (
            <p className="os-welcome-empty" role="status">
              Loading conversations…
            </p>
          ) : conversations.length === 0 ? (
            <p className="os-welcome-empty">
              Your first conversation will show up here.
            </p>
          ) : (
            <>
              <ul className="os-activity-list">
                {visibleChats.map((conversation) => (
                  <li key={conversation.id}>
                    <Link
                      href={`/app/chat/${conversation.id}`}
                      className="os-activity-row"
                    >
                      <span className="os-activity-dot" aria-hidden="true" />
                      <span className="os-activity-copy">
                        <strong>{conversation.title}</strong>
                        <span>
                          Updated {relativeTime(conversation.updatedAt)}
                        </span>
                      </span>
                      <span className="os-activity-action">
                        Open
                        <ArrowUpRight className="size-3.5" aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {hasMoreChats ? (
                <button
                  type="button"
                  className="os-read-more"
                  onClick={() => setShowAllChats((current) => !current)}
                  aria-expanded={showAllChats}
                >
                  {showAllChats
                    ? "Show less"
                    : `Read more (${conversations.length - RECENT_PREVIEW} more)`}
                </button>
              ) : null}
            </>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
