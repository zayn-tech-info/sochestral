import type { TargetPlatform } from "@sochestral/database";

const ACTION_PATTERN =
  /\b(post|publish|share|schedule|draft|validate|preview|send)\b/i;
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
  { platform: "instagram", pattern: /\binstagram\b|\binsta\b/i },
];

export type PlatformResolution =
  | { kind: "resolved"; platforms: TargetPlatform[] }
  | { kind: "clarify"; message: string };

export const PLATFORM_CLARIFICATION =
  "Which supported platform should I use? Please name Threads, LinkedIn, Instagram, or a combination of them.";

export function resolvePlatforms(message: string): PlatformResolution {
  const platforms = PLATFORM_PATTERNS.filter(({ pattern }) =>
    pattern.test(message),
  ).map(({ platform }) => platform);
  const requestsAction = ACTION_PATTERN.test(message);

  if (
    (requestsAction && platforms.length === 0) ||
    UNSUPPORTED_PATTERN.test(message) ||
    AMBIGUOUS_PATTERN.test(message)
  ) {
    return { kind: "clarify", message: PLATFORM_CLARIFICATION };
  }
  return { kind: "resolved", platforms: [...new Set(platforms)] };
}
