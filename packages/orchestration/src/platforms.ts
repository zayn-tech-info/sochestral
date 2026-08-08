import type { TargetPlatform } from "@sochestral/database";

const ACTION_PATTERN =
  /\b(post|publish|share|schedule|draft|validate|preview|send)\b/i;
/** Short follow-ups that continue a prior post request without renaming the platform. */
const FOLLOW_UP_ACTION_PATTERN =
  /^(?:yes[,.]?\s+)?(?:publish|post(?:\s+it)?(?:\s+live)?|go\s+live|live(?:\s+please)?|do\s+it|ship\s+it|use\s+this|this\s+one|here(?:\s+it\s+is)?|attached|this(?:\s+image|\s+photo|\s+video)?)[.!]?$/i;
const UNSUPPORTED_PATTERN =
  /\b(facebook|tiktok|twitter|reddit|discord|youtube|pinterest|snapchat)\b/i;
const AMBIGUOUS_PATTERN = /\b(everywhere|all platforms|all accounts)\b/i;

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

export type PlatformResolution =
  | { kind: "resolved"; platforms: TargetPlatform[] }
  | { kind: "clarify"; message: string };

export const PLATFORM_CLARIFICATION =
  "Which supported platform should I use? Please name Threads, LinkedIn, Instagram, or a combination of them.";

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
  const inherited = [
    ...new Set(
      (options?.inheritedPlatforms ?? []).filter((platform) =>
        PLATFORM_PATTERNS.some((entry) => entry.platform === platform),
      ),
    ),
  ];
  const requestsAction = ACTION_PATTERN.test(message);

  if (UNSUPPORTED_PATTERN.test(message) || AMBIGUOUS_PATTERN.test(message)) {
    return { kind: "clarify", message: PLATFORM_CLARIFICATION };
  }

  const needsPlatform =
    requestsAction || FOLLOW_UP_ACTION_PATTERN.test(message.trim());

  if (needsPlatform && platforms.length === 0) {
    if (inherited.length > 0) {
      return { kind: "resolved", platforms: inherited };
    }
    return { kind: "clarify", message: PLATFORM_CLARIFICATION };
  }

  return { kind: "resolved", platforms };
}
