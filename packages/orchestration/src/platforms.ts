import type { TargetPlatform } from "@sochestral/database";

const PLATFORM_PATTERNS: Array<{
  platform: TargetPlatform;
  pattern: RegExp;
}> = [
  { platform: "threads", pattern: /\bthreads\b/i },
  {
    platform: "linkedin_personal",
    pattern: /\blinked\s*in(?:\s+personal)?\b/i,
  },
  {
    platform: "instagram",
    // Common typos seen in chat: Instagarm, instgram, instalgram, instagam, instagrma
    pattern:
      /\b(?:instagram|instagrma|instagarm|instagam|instgram|instalgram|insta)\b/i,
  },
];

export type PlatformResolution = {
  kind: "resolved";
  platforms: TargetPlatform[];
};

/**
 * Soft-detect named platforms for tool validation and inheritance.
 * Never short-circuits the model with a canned clarify reply.
 */
export function extractPlatforms(message: string): TargetPlatform[] {
  return [
    ...new Set(
      PLATFORM_PATTERNS.filter(({ pattern }) => pattern.test(message)).map(
        ({ platform }) => platform,
      ),
    ),
  ];
}

/** Newest messages last. Returns platforms from the newest message that names any. */
export function platformsFromRecentMessages(messages: string[]): TargetPlatform[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const found = extractPlatforms(messages[index] ?? "");
    if (found.length > 0) return found;
  }
  return [];
}

export function resolvePlatforms(
  message: string,
  options?: { inheritedPlatforms?: TargetPlatform[] },
): PlatformResolution {
  const platforms = extractPlatforms(message);
  if (platforms.length > 0) {
    return { kind: "resolved", platforms };
  }
  const inherited = [
    ...new Set(
      (options?.inheritedPlatforms ?? []).filter((platform) =>
        PLATFORM_PATTERNS.some((entry) => entry.platform === platform),
      ),
    ),
  ];
  return { kind: "resolved", platforms: inherited };
}
