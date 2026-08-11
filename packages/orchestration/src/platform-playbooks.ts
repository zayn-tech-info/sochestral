import type { TargetPlatform } from "@sochestral/database";

export type PlatformPlaybook = {
  platform: TargetPlatform;
  label: string;
  postForms: string[];
  sellingNotes: string;
  /** Local-wall-clock hour windows (0-23) used as heuristic candidates. */
  preferredHoursLocal: number[];
  /** Default posts to plan per week when cadence is missing. */
  defaultPostsPerWeek: number;
  /** Max posts this platform should land on a single calendar day. */
  maxPostsPerDay: number;
};

export const PLATFORM_PLAYBOOKS: Record<TargetPlatform, PlatformPlaybook> = {
  threads: {
    platform: "threads",
    label: "Threads",
    postForms: [
      "short conversational text",
      "question hook",
      "single-image with caption",
    ],
    sellingNotes:
      "Lead with a sharp observation or question. Keep copy skimmable. Soft CTA that invites replies rather than hard sell.",
    preferredHoursLocal: [9, 12, 17],
    defaultPostsPerWeek: 3,
    maxPostsPerDay: 2,
  },
  linkedin_personal: {
    platform: "linkedin_personal",
    label: "LinkedIn Personal",
    postForms: [
      "first-person professional narrative",
      "lesson learned with bullet takeaways",
      "product update with business outcome",
    ],
    sellingNotes:
      "Open with a concrete result or tension. Use short paragraphs. End with one clear CTA or question for peers.",
    preferredHoursLocal: [8, 10, 13],
    defaultPostsPerWeek: 2,
    maxPostsPerDay: 1,
  },
  instagram: {
    platform: "instagram",
    label: "Instagram",
    postForms: [
      "single image feed post",
      "carousel storytelling",
      "caption-led value post with CTA in first lines",
    ],
    sellingNotes:
      "Visual first. Strong first line. Clear offer or save-worthy tip. Hashtags only when they fit the brand voice.",
    preferredHoursLocal: [11, 15, 19],
    defaultPostsPerWeek: 3,
    maxPostsPerDay: 1,
  },
};

export function playbookFor(platform: TargetPlatform): PlatformPlaybook {
  return PLATFORM_PLAYBOOKS[platform];
}
