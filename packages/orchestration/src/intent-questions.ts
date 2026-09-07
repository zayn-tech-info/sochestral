import type { TargetPlatform } from "@sochestral/database";

export type IntentQuestionOption = {
  id: string;
  label: string;
  recommended?: boolean;
  custom?: boolean;
};

export type IntentQuestion = {
  id: string;
  prompt: string;
  reason?: string;
  options: IntentQuestionOption[];
};

export type IntentAnswer = {
  questionId: string;
  optionId: string;
  customText?: string;
};

function platformLabels(platforms: TargetPlatform[]): string[] {
  return platforms.map((platform) => {
    if (platform === "threads") return "Threads";
    if (platform === "linkedin_personal") return "LinkedIn";
    return "Instagram";
  });
}

function withCustom(
  options: Omit<IntentQuestionOption, "custom">[],
): IntentQuestionOption[] {
  const capped = options.slice(0, 5);
  return [
    ...capped,
    { id: "custom", label: "Something else", custom: true },
  ];
}

/**
 * Product-owned clarify questions after the model marks intent unclear.
 * Built from resolved platforms / current-turn media, not message regex.
 */
export function buildIntentQuestions(input: {
  message: string;
  platforms: TargetPlatform[];
  hasCurrentMedia: boolean;
}): IntentQuestion[] {
  const labels = platformLabels(input.platforms);
  const questions: IntentQuestion[] = [];
  const platformPhrase =
    labels.length === 0
      ? "your accounts"
      : labels.length === 1
        ? labels[0]!
        : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;

  questions.push({
    id: "goal",
    prompt: `What should I do on ${platformPhrase}?`,
    reason:
      "I could not tell whether you want a live publish, a scheduled post, a draft for review, or help in chat only.",
    options: withCustom([
      {
        id: "draft_review",
        label: "Draft a post for my review",
        recommended: true,
      },
      { id: "schedule_post", label: "Schedule a post" },
      {
        id: "decide_schedule",
        label: "Decide and schedule for me",
      },
      { id: "publish_now", label: "Publish live now" },
      { id: "suggest_only", label: "Just help with captions or ideas" },
    ]),
  });

  if (labels.length === 0) {
    questions.push({
      id: "platform",
      prompt: "Which platform should I use?",
      reason: "No platform is clear from this turn yet.",
      options: withCustom([
        { id: "threads", label: "Threads", recommended: true },
        { id: "instagram", label: "Instagram" },
        { id: "linkedin_personal", label: "LinkedIn" },
      ]),
    });
  }

  if (input.hasCurrentMedia) {
    questions.push({
      id: "media",
      prompt: "Which media should I use?",
      reason: "I will only use images from this message unless you say otherwise.",
      options: withCustom([
        {
          id: "this_message",
          label: "Only the image attached to this message",
          recommended: true,
        },
        { id: "no_media", label: "Text only, no image" },
      ]),
    });
  }

  return questions;
}

/** Product owned brand clarify when image brand use is unclear (AC-3). */
export function buildBrandClarifyQuestions(): IntentQuestion[] {
  return [
    {
      id: "brand_use",
      prompt: "Should this image use your Brand Assets?",
      reason:
        "This looks like marketing creative, and I need a clear yes or no before I propose the image.",
      options: withCustom([
        {
          id: "use_brand",
          label: "Yes, use my brand",
          recommended: true,
        },
        { id: "skip_brand", label: "No, keep it brand free" },
      ]),
    },
  ];
}

export function buildAutonomyBriefQuestions(input: {
  needsPlatform: boolean;
  hasContentType: boolean;
  hasDirection: boolean;
}): IntentQuestion[] {
  const questions: IntentQuestion[] = [];
  if (!input.hasContentType) {
    questions.push({
      id: "content_type",
      prompt: "What kind of content should I plan?",
      reason: "I need a direction before I research and schedule.",
      options: withCustom([
        { id: "founder", label: "Founder updates and shipping notes", recommended: true },
        { id: "product", label: "Product and offer posts" },
        { id: "educational", label: "How-to and educational posts" },
        { id: "mixed", label: "A mix across the next days" },
      ]),
    });
  }
  if (!input.hasDirection) {
    questions.push({
      id: "direction",
      prompt: "What should the next posts push toward?",
      reason: "A short aim keeps the captions specific instead of generic.",
      options: withCustom([
        { id: "customers", label: "Win more customers", recommended: true },
        { id: "launch", label: "Talk about a launch or ship" },
        { id: "authority", label: "Show expertise and stay visible" },
        { id: "community", label: "Talk with the people I already have" },
      ]),
    });
  }
  if (input.needsPlatform) {
    questions.push({
      id: "platform",
      prompt: "Which platform should I use?",
      reason: "No platform is clear from this turn yet.",
      options: withCustom([
        { id: "threads", label: "Threads", recommended: true },
        { id: "instagram", label: "Instagram" },
        { id: "linkedin_personal", label: "LinkedIn" },
      ]),
    });
  }
  return questions;
}

export function autonomyBriefFromAnswers(answers: IntentAnswer[]): {
  contentType?: string;
  direction?: string;
  platforms: TargetPlatform[];
} {
  const byId = new Map(answers.map((answer) => [answer.questionId, answer]));
  const typeAnswer = byId.get("content_type");
  const directionAnswer = byId.get("direction");
  const platform = byId.get("platform");
  const contentType = typeAnswer
    ? typeAnswer.optionId === "custom"
      ? typeAnswer.customText?.trim() || undefined
      : typeAnswer.optionId
    : undefined;
  const direction = directionAnswer
    ? directionAnswer.optionId === "custom"
      ? directionAnswer.customText?.trim() || undefined
      : directionAnswer.optionId === "customers"
        ? "Win more customers"
        : directionAnswer.optionId === "launch"
          ? "Talk about a launch or ship"
          : directionAnswer.optionId === "authority"
            ? "Show expertise and stay visible"
            : directionAnswer.optionId === "community"
              ? "Talk with the people I already have"
              : directionAnswer.optionId
    : undefined;
  const platforms: TargetPlatform[] = [];
  if (platform) {
    const raw =
      platform.optionId === "custom"
        ? (platform.customText ?? "").toLowerCase()
        : platform.optionId;
    if (raw === "threads" || raw.includes("thread")) platforms.push("threads");
    if (raw === "instagram" || raw.includes("instagram") || raw.includes("insta")) {
      platforms.push("instagram");
    }
    if (raw === "linkedin_personal" || raw.includes("linkedin")) {
      platforms.push("linkedin_personal");
    }
  }
  return { contentType, direction, platforms };
}

export function brandIntentFromAnswers(
  answers: IntentAnswer[],
): "use" | "skip" | null {
  const answer = answers.find((item) => item.questionId === "brand_use");
  if (!answer) return null;
  if (answer.optionId === "use_brand") return "use";
  if (answer.optionId === "skip_brand") return "skip";
  if (answer.optionId === "custom") {
    const custom = (answer.customText ?? "").trim().toLowerCase();
    if (
      custom.includes("don't use") ||
      custom.includes("do not use") ||
      custom.includes("without brand") ||
      custom.includes("no brand") ||
      custom.includes("brand free") ||
      custom.includes("random")
    ) {
      return "skip";
    }
    if (custom.includes("brand") || custom.includes("logo") || custom.includes("yes")) {
      return "use";
    }
  }
  return null;
}

export function resolveIntentFromAnswers(
  answers: IntentAnswer[],
): {
  kind: "live" | "draft" | "suggest" | "schedule";
  autonomous: boolean;
  platforms: TargetPlatform[];
  useCurrentMedia: boolean;
  summaryMessage: string;
} {
  const byId = new Map(answers.map((answer) => [answer.questionId, answer]));
  const goal = byId.get("goal");
  const platform = byId.get("platform");
  const media = byId.get("media");

  let kind: "live" | "draft" | "suggest" | "schedule" = "draft";
  let autonomous = false;
  if (goal?.optionId === "publish_now") {
    kind = "live";
  } else if (goal?.optionId === "decide_schedule") {
    kind = "schedule";
    autonomous = true;
  } else if (goal?.optionId === "schedule_post") {
    kind = "schedule";
  } else if (goal?.optionId === "suggest_only") {
    kind = "suggest";
  } else if (goal?.optionId === "draft_review") {
    kind = "draft";
  } else if (goal?.optionId === "custom") {
    const custom = (goal.customText ?? "").trim().toLowerCase();
    if (custom.includes("publish") || custom.includes("post live") || custom === "live") {
      kind = "live";
    } else if (
      custom.includes("suggest") ||
      custom.includes("caption") ||
      custom.includes("idea")
    ) {
      // Check suggest/caption before the "for me" autonomy heuristic so
      // "just suggest captions for me" does not become autonomous schedule.
      kind = "suggest";
    } else if (
      custom.includes("decide") ||
      custom.includes("yourself") ||
      custom.includes("for me")
    ) {
      kind = "schedule";
      autonomous = true;
    } else if (
      custom.includes("schedule") ||
      custom.includes("later") ||
      custom.includes("queue")
    ) {
      kind = "schedule";
    } else {
      kind = "draft";
    }
  }

  const platforms: TargetPlatform[] = [];
  if (platform) {
    const raw =
      platform.optionId === "custom"
        ? (platform.customText ?? "").toLowerCase()
        : platform.optionId;
    if (raw === "threads" || raw.includes("thread")) platforms.push("threads");
    if (raw === "instagram" || raw.includes("instagram") || raw.includes("insta")) {
      platforms.push("instagram");
    }
    if (raw === "linkedin_personal" || raw.includes("linkedin")) {
      platforms.push("linkedin_personal");
    }
  }

  const useCurrentMedia =
    !media ||
    media.optionId === "this_message" ||
    (media.optionId === "custom" &&
      !(media.customText ?? "").toLowerCase().includes("no") &&
      !(media.customText ?? "").toLowerCase().includes("text only"));

  const lines = answers.map((answer) => {
    const label =
      answer.optionId === "custom"
        ? answer.customText?.trim() || "Custom"
        : answer.optionId;
    return `- ${answer.questionId}: ${label}`;
  });

  return {
    kind,
    autonomous,
    platforms,
    useCurrentMedia,
    summaryMessage: `Intent confirmed:\n${lines.join("\n")}`,
  };
}
