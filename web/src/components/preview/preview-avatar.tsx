"use client";

import { useState } from "react";

import {
  InstagramIcon,
  LinkedInIcon,
  ThreadsIcon,
} from "@/components/auth/platform-icons";
import type { ConnectorPlatform } from "@/lib/product-api";
import { cn } from "@/lib/utils";

import { monogram } from "./preview-shared";

function PlatformBadge({ platform }: { platform: ConnectorPlatform }) {
  const Icon =
    platform === "linkedin_personal"
      ? LinkedInIcon
      : platform === "instagram"
        ? InstagramIcon
        : ThreadsIcon;
  return (
    <span
      className={cn(
        "pp-avatar-platform-badge",
        `pp-avatar-platform-badge-${platform}`,
      )}
      aria-hidden="true"
    >
      <Icon className="size-2.5" />
    </span>
  );
}

export function PreviewAvatar({
  platform,
  label,
  avatarUrl,
  large = false,
}: {
  platform: ConnectorPlatform;
  label: string;
  avatarUrl?: string | null;
  large?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(avatarUrl) && !imageFailed;
  const referrerPolicy =
    platform === "linkedin_personal" ? undefined : "no-referrer";

  return (
    <span
      className={cn("pp-avatar-wrap", large && "pp-avatar-wrap-lg")}
      aria-hidden="true"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl!}
          alt=""
          className={cn("pp-avatar", "pp-avatar-photo", large && "pp-avatar-lg")}
          {...(referrerPolicy ? { referrerPolicy } : {})}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className={cn("pp-avatar", large && "pp-avatar-lg")}>
          {monogram(label)}
        </span>
      )}
      <PlatformBadge platform={platform} />
    </span>
  );
}
