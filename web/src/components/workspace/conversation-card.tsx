"use client";

import Link from "next/link";
import { MessageSquare, Sparkles } from "lucide-react";

import type { Conversation } from "@/lib/product-api";

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

export function ConversationCard({
  conversation,
}: {
  conversation: Conversation;
}) {
  return (
    <Link
      href={`/app/chat/${conversation.id}`}
      className="os-conversation-card"
    >
      <span className="os-conversation-icon" aria-hidden="true">
        <MessageSquare className="size-4" />
      </span>
      <span className="os-conversation-body">
        <span className="os-conversation-title">{conversation.title}</span>
        <span className="os-conversation-meta">
          <span className="os-ai-badge">
            <Sparkles className="size-3" aria-hidden="true" />
            AI
          </span>
          <span>{relativeTime(conversation.updatedAt)}</span>
        </span>
      </span>
    </Link>
  );
}
