import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelProvider } from "./model.js";
import {
  LIVE_PUBLISH_INTENT_TOOL_NAME,
  LIVE_PUBLISH_INTENT_USER_MESSAGE_END,
  LIVE_PUBLISH_INTENT_USER_MESSAGE_START,
  intentClarification,
  localDraftIntent,
  localLiveIntent,
  resolveLivePublishIntent,
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
  ])("does not treat affirmative or slangy wording as local draft: %s", (message) => {
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
  ])("does not treat draft, questions, or bare replies as local live alone: %s", (message) => {
    expect(localLiveIntent(message)).toBe(false);
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
