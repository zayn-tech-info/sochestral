import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelProvider } from "./model.js";
import {
  LIVE_PUBLISH_INTENT_TOOL_NAME,
  LIVE_PUBLISH_INTENT_USER_MESSAGE_END,
  LIVE_PUBLISH_INTENT_USER_MESSAGE_START,
  intentClarification,
  isSchedulePlanAcceptance,
  localDraftIntent,
  localLiveIntent,
  localScheduleIntent,
  priorHasScheduleContext,
  resolveLivePublishIntent,
  continuesLivePublishContext,
  vetoesExplicitLivePublishIntent,
  wrapUserMessageForIntentClassification,
} from "./publishing.js";

function modelCompletion(input: {
  toolCalls?: Array<{ id: string; name: string; input: unknown }>;
}) {
  return {
    content: null,
    thinking: null,
    toolCalls: input.toolCalls ?? [],
    inputTokens: 4,
    outputTokens: 2,
    attempts: 1,
  };
}

describe("localDraftIntent", () => {
  it.each([
    "Draft this post",
    "Write a caption and preview it",
    "Validate this before publishing",
    "Do not publish this",
    "Don't post it yet",
    "Can you publish this?",
    "Yeah",
    "Make this better",
  ])("maps obvious non-live wording to draft: %s", (message) => {
    expect(localDraftIntent(message)).toBe(true);
    expect(vetoesExplicitLivePublishIntent(message)).toBe(true);
  });

  it.each([
    "Ship the Threads launch post now",
    "Publish this on Threads",
    "Post it live",
    "Just shot it there",
    "Suggest captions for this photo",
    "Post this on Threads and generate a caption",
    "Can you please post this on my threads and add a caption related to the image so check the image content and based on that add the caption to the post",
  ])("does not treat affirmative or suggestion-only wording as local draft: %s", (message) => {
    expect(localDraftIntent(message)).toBe(false);
  });
});

describe("localLiveIntent", () => {
  it.each([
    "Post this on my Instagram",
    "Publish this on Threads",
    "Post it live",
    "Yes post it live on Instagram",
    "Yes post it live on Instagarm",
    "Ship the Threads launch post now",
  ])("maps clear live publish wording to live: %s", (message) => {
    expect(localLiveIntent(message)).toBe(true);
  });

  it.each([
    "Draft this post",
    "Can you publish this?",
    "Yeah",
    "Just shot it there",
    "Instagram",
    "Publish",
    "Schedule this on Threads for Friday",
    "Schedule a post for tomorrow",
  ])("does not treat draft, questions, schedule, or bare replies as local live alone: %s", (message) => {
    expect(localLiveIntent(message)).toBe(false);
  });
});

describe("localScheduleIntent", () => {
  it.each([
    "Schedule this on Threads for Friday",
    "Schedule a post for tomorrow at 9am",
    "Please schedule this Instagram post",
    "Queue this post for later",
  ])("maps clear schedule wording: %s", (message) => {
    expect(localScheduleIntent(message)).toBe(true);
  });

  it.each([
    "Post this on my Instagram",
    "Publish this now on Threads",
    "Draft a caption",
  ])("does not treat live or draft as schedule: %s", (message) => {
    expect(localScheduleIntent(message)).toBe(false);
  });
});

describe("intentClarification", () => {
  it("names inherited platforms in the clarify question", () => {
    expect(intentClarification(["threads"])).toContain("Threads");
    expect(intentClarification(["threads", "instagram"])).toContain("Instagram");
  });
});

describe("wrapUserMessageForIntentClassification", () => {
  it("wraps the user message in fixed delimiters", () => {
    expect(wrapUserMessageForIntentClassification("Publish this now")).toBe(
      `${LIVE_PUBLISH_INTENT_USER_MESSAGE_START}\nPublish this now\n${LIVE_PUBLISH_INTENT_USER_MESSAGE_END}`,
    );
  });
});

describe("resolveLivePublishIntent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies schedule intent with the LLM instead of local wording shortcuts", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const model: ModelProvider = {
      complete: vi.fn().mockResolvedValue(
        modelCompletion({
          toolCalls: [
            {
              id: "intent_1",
              name: LIVE_PUBLISH_INTENT_TOOL_NAME,
              input: { intent: "schedule" },
            },
          ],
        }),
      ),
    };

    await expect(
      resolveLivePublishIntent(model, {
        message: "Schedule this on Threads for Friday",
        modelName: "intent-model",
        mode: "full_access",
      }),
    ).resolves.toBe("schedule");

    expect(model.complete).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "[sochestral:publishing] intent resolved",
      expect.objectContaining({
        outcome: "schedule",
        reason: "llm_schedule",
        mode: "full_access",
      }),
    );
  });

  it("returns live from LLM when wording is affirmative but not a local live match", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const model: ModelProvider = {
      complete: vi.fn().mockResolvedValue(
        modelCompletion({
          toolCalls: [
            {
              id: "intent_1",
              name: LIVE_PUBLISH_INTENT_TOOL_NAME,
              input: { intent: "live" },
            },
          ],
        }),
      ),
    };

    await expect(
      resolveLivePublishIntent(model, {
        message: "Put the launch update on Threads for me",
        modelName: "intent-model",
        mode: "full_access",
      }),
    ).resolves.toBe("live");

    expect(model.complete).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      "[sochestral:publishing] intent resolved",
      expect.objectContaining({
        outcome: "live",
        reason: "llm_live",
        mode: "full_access",
      }),
    );
  });

  it.each([
    "Draft this for Threads",
    "Do not publish this on Threads",
    "Can you publish this?",
  ])("returns draft without calling the model when local draft veto triggers: %s", async (message) => {
    const model: ModelProvider = { complete: vi.fn() };

    await expect(
      resolveLivePublishIntent(model, {
        message,
        modelName: "intent-model",
      }),
    ).resolves.toBe("draft");
    expect(model.complete).not.toHaveBeenCalled();
  });

  it("lets schedule confirmations reach the LLM instead of draft heuristics", async () => {
    const model: ModelProvider = {
      complete: vi.fn().mockResolvedValue(
        modelCompletion({
          toolCalls: [
            {
              id: "intent_1",
              name: LIVE_PUBLISH_INTENT_TOOL_NAME,
              input: { intent: "schedule" },
            },
          ],
        }),
      ),
    };

    await expect(
      resolveLivePublishIntent(model, {
        message:
          "Threads and linkedin, 5 post per days is good, start date should be monday any time",
        modelName: "intent-model",
        mode: "full_access",
      }),
    ).resolves.toBe("schedule");
    expect(model.complete).toHaveBeenCalled();
  });

  it("treats plan acceptances after calendar talk as schedule, not local live", async () => {
    const model: ModelProvider = { complete: vi.fn() };
    const prior = [
      "Help me build next month's content calendar",
      "Threads and linkedin, 5 post per days is good, start date should be monday any time",
    ];
    expect(priorHasScheduleContext(prior)).toBe(true);
    expect(
      isSchedulePlanAcceptance("Yeah, go for this, that's what I want"),
    ).toBe(true);
    expect(
      isSchedulePlanAcceptance("Yeah, that's what I want go for it"),
    ).toBe(true);

    await expect(
      resolveLivePublishIntent(model, {
        message: "Yeah, go for this, that's what I want",
        priorMessages: prior,
        modelName: "intent-model",
        mode: "full_access",
      }),
    ).resolves.toBe("schedule");
    expect(model.complete).not.toHaveBeenCalled();

    await expect(
      resolveLivePublishIntent(model, {
        message: "Yeah, that's what I want go for it",
        priorMessages: prior,
        modelName: "intent-model",
        mode: "full_access",
      }),
    ).resolves.toBe("schedule");
  });

  it("does not treat concatenated calendar priors as local live via window", async () => {
    const model: ModelProvider = {
      complete: vi.fn().mockResolvedValue(
        modelCompletion({
          toolCalls: [
            {
              id: "intent_1",
              name: LIVE_PUBLISH_INTENT_TOOL_NAME,
              input: { intent: "schedule" },
            },
          ],
        }),
      ),
    };

    await expect(
      resolveLivePublishIntent(model, {
        message: "what do you still need?",
        priorMessages: [
          "Help me build next month's content calendar",
          "Threads and linkedin, 5 post per days is good",
        ],
        modelName: "intent-model",
        mode: "full_access",
      }),
    ).resolves.toBe("schedule");
    expect(model.complete).toHaveBeenCalled();
  });

  it("returns unclear for slangy go-aheads when the classifier is not live", async () => {
    const model: ModelProvider = {
      complete: vi.fn().mockResolvedValue(
        modelCompletion({
          toolCalls: [
            {
              id: "intent_1",
              name: LIVE_PUBLISH_INTENT_TOOL_NAME,
              input: { intent: "unclear" },
            },
          ],
        }),
      ),
    };

    await expect(
      resolveLivePublishIntent(model, {
        message: "Just shot it there",
        modelName: "intent-model",
        mode: "full_access",
      }),
    ).resolves.toBe("unclear");
  });

  it("returns live from local wording without calling the model", async () => {
    const model: ModelProvider = { complete: vi.fn() };
    await expect(
      resolveLivePublishIntent(model, {
        message: "Post this on my Instagram",
        modelName: "intent-model",
        mode: "full_access",
      }),
    ).resolves.toBe("live");
    expect(model.complete).not.toHaveBeenCalled();
  });

  it("uses prior user messages so a short live reply keeps platform context", async () => {
    const model: ModelProvider = { complete: vi.fn() };
    await expect(
      resolveLivePublishIntent(model, {
        message: "Post it live",
        priorMessages: ["Post this on my Instagram"],
        modelName: "intent-model",
        mode: "full_access",
      }),
    ).resolves.toBe("live");
    expect(model.complete).not.toHaveBeenCalled();
  });

  it("treats bare Publish as live when the prior turn already named a platform", async () => {
    const model: ModelProvider = { complete: vi.fn() };
    await expect(
      resolveLivePublishIntent(model, {
        message: "Publish",
        priorMessages: ["Post this on my Instagram"],
        modelName: "intent-model",
        mode: "full_access",
      }),
    ).resolves.toBe("live");
    expect(model.complete).not.toHaveBeenCalled();
  });

  it("treats Instagarm typo replies as live with prior post context", async () => {
    const model: ModelProvider = { complete: vi.fn() };
    await expect(
      resolveLivePublishIntent(model, {
        message: "Yes post it live on Instagarm",
        priorMessages: ["Post this on my Instagram"],
        modelName: "intent-model",
        mode: "full_access",
      }),
    ).resolves.toBe("live");
    expect(model.complete).not.toHaveBeenCalled();
  });

  it("keeps live intent for use this after a prior Instagram post request", async () => {
    expect(
      continuesLivePublishContext("use this", ["Post this on my Instagram"]),
    ).toBe(true);
    const model: ModelProvider = { complete: vi.fn() };
    await expect(
      resolveLivePublishIntent(model, {
        message: "use this",
        priorMessages: ["Post this on my Instagram"],
        modelName: "intent-model",
        mode: "full_access",
      }),
    ).resolves.toBe("live");
    expect(model.complete).not.toHaveBeenCalled();
  });

  it("does not continue live context for draft follow ups", async () => {
    expect(
      continuesLivePublishContext("draft a softer version", [
        "Post this on my Instagram",
      ]),
    ).toBe(false);
    const model: ModelProvider = { complete: vi.fn() };
    await expect(
      resolveLivePublishIntent(model, {
        message: "draft a softer version",
        priorMessages: ["Post this on my Instagram"],
        modelName: "intent-model",
        mode: "full_access",
      }),
    ).resolves.toBe("draft");
    expect(model.complete).not.toHaveBeenCalled();
  });

  it("asks the model for ambiguous suggestion turns instead of local unclear", async () => {
    const model: ModelProvider = {
      complete: vi.fn().mockResolvedValue(
        modelCompletion({
          toolCalls: [
            {
              id: "intent_1",
              name: LIVE_PUBLISH_INTENT_TOOL_NAME,
              input: { intent: "draft" },
            },
          ],
        }),
      ),
    };
    await expect(
      resolveLivePublishIntent(model, {
        message: "suggest captions and post",
        modelName: "intent-model",
        mode: "full_access",
      }),
    ).resolves.toBe("draft");
    expect(model.complete).toHaveBeenCalled();
  });

  it("treats post-plus-caption requests as local live when platform is named", async () => {
    const model: ModelProvider = { complete: vi.fn() };
    await expect(
      resolveLivePublishIntent(model, {
        message:
          "Post this on my threads account, based on the context of the image, generate a caption that suite the post",
        modelName: "intent-model",
        mode: "full_access",
      }),
    ).resolves.toBe("live");
    expect(model.complete).not.toHaveBeenCalled();
  });

  it("fails closed to unclear on blank messages, missing tool calls, and provider errors", async () => {
    const blankModel: ModelProvider = { complete: vi.fn() };
    await expect(
      resolveLivePublishIntent(blankModel, {
        message: "   ",
        modelName: "intent-model",
      }),
    ).resolves.toBe("unclear");
    expect(blankModel.complete).not.toHaveBeenCalled();

    const missingTool: ModelProvider = {
      complete: vi.fn().mockResolvedValue(modelCompletion({})),
    };
    await expect(
      resolveLivePublishIntent(missingTool, {
        message: "Go ahead with that",
        modelName: "intent-model",
      }),
    ).resolves.toBe("unclear");

    const failing: ModelProvider = {
      complete: vi.fn().mockRejectedValue(new Error("MODEL_UNAVAILABLE")),
    };
    await expect(
      resolveLivePublishIntent(failing, {
        message: "Go ahead with that",
        modelName: "intent-model",
      }),
    ).resolves.toBe("unclear");
  });
});
