"use client";

import type { RefObject } from "react";

import type { ConnectorPlatform } from "@/lib/product-api";

export const platformNames = {
  threads: "Threads",
  linkedin_personal: "LinkedIn",
  instagram: "Instagram",
} as const;

export type ReviewMediaItem = {
  assetId: string | null;
  externalUrl: string | null;
};

export type EditableDraft = {
  body: string;
  selectedAccountId: string | null;
  mediaItems: ReviewMediaItem[];
};

export function accountLabel(account: {
  displayName: string | null;
  username: string | null;
}) {
  return account.displayName ?? account.username ?? "Connected account";
}

function cleanUsername(username: string | null | undefined) {
  if (!username) return null;
  const trimmed = username.replace(/^@/, "").trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) {
    const local = trimmed.split("@")[0]?.trim();
    return local || null;
  }
  return trimmed;
}

/** Public facing name/handle line under the avatar, per platform chrome. */
export function accountSubtitle(
  platform: ConnectorPlatform,
  account: {
    displayName: string | null;
    username: string | null;
  } | null,
) {
  if (!account) return "Connect an account";
  const handle = cleanUsername(account.username);
  if (platform === "linkedin_personal") {
    if (account.username && !account.username.includes("@")) {
      return account.username.replace(/^@/, "");
    }
    return "Personal profile";
  }
  if (handle) return handle;
  if (account.displayName) {
    return account.displayName.replace(/\s+/g, "").toLowerCase();
  }
  return "account";
}

export function accountHandle(account: {
  displayName: string | null;
  username: string | null;
} | null) {
  if (!account) return "account";
  return (
    cleanUsername(account.username) ??
    (account.displayName ?? "account").replace(/\s+/g, "").toLowerCase()
  );
}

export function monogram(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}

export function mediaSrc(
  item: ReviewMediaItem,
  mediaPreviews: Record<string, string>,
) {
  if (item.assetId && mediaPreviews[item.assetId]) {
    return mediaPreviews[item.assetId]!;
  }
  return item.externalUrl ?? null;
}

export function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

export type PreviewAccount = {
  id: string;
  username: string | null;
  displayName: string | null;
  state: "connected" | "reconnect_required";
} | null;

export type PlatformPreviewProps = {
  platform: ConnectorPlatform;
  body: string;
  mediaItems: ReviewMediaItem[];
  mediaPreviews: Record<string, string>;
  account: PreviewAccount;
  locked: boolean;
  live: boolean;
  onBodyChange: (value: string) => void;
  /** Optional circular profile photo for schedule / account chrome. */
  avatarUrl?: string | null;
  /** Optional ref to the editable caption textarea (schedule selection AI). */
  bodyRef?: RefObject<HTMLTextAreaElement | null>;
  /** Fired when the caption selection changes; receives the active textarea. */
  onBodySelect?: (el: HTMLTextAreaElement) => void;
};
