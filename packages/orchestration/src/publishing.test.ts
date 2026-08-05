import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelProvider } from "./model.js";
import {
  LIVE_PUBLISH_INTENT_TOOL_NAME,
  LIVE_PUBLISH_INTENT_USER_MESSAGE_END,
  LIVE_PUBLISH_INTENT_USER_MESSAGE_START,
  resolveExplicitLivePublishIntent,
  vetoesExplicitLivePublishIntent,
  wrapUserMessageForIntentClassification,
} from "./publishing.js";

function modelCompletion(input: {
  toolCalls?: Array<{ id: string; name: string; input: unknown }>;
}) {
  return {
    content: null,
    toolCalls: input.toolCalls ?? [],
    inputTokens: 4,
    outputTokens: 2,
    attempts: 1,
  };
}

describe("vetoesExplicitLivePublishIntent", () => {
  it.each([
    "Draft this post",
    "Write a caption and preview it",
    "Validate this before publishing",
    "Do not publish this",
    "Don't post it yet",
    "Can you publish this?",
    "Yeah",
    "Make this better",
    "   ",
  ])("vetoes obvious non-intent wording: %s", (message) => {
    expect(vetoesExplicitLivePublishIntent(message)).toBe(true);
  });

  it.each([
    "Ship the Threads launch post now",
    "Publish this on Threads",
    "Post it live",
  ])("does not veto affirmative live-publish wording: %s", (message) => {
    expect(vetoesExplicitLivePublishIntent(message)).toBe(false);
  });
});

describe("wrapUserMessageForIntentClassification", () => {
  it("wraps the user message in fixed delimiters", () => {
    expect(wrapUserMessageForIntentClassification("Publish this now")).toBe(
      `${LIVE_PUBLISH_INTENT_USER_MESSAGE_START}\nPublish this now\n${LIVE_PUBLISH_INTENT_USER_MESSAGE_END}`,
    );
  });
});

describe("resolveExplicitLivePublishIntent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true only when veto passes and the forced tool reports explicitLivePublish true", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const model: ModelProvider = {
      complete: vi.fn().mockResolvedValue(
        modelCompletion({
          toolCalls: [
            {
              id: "intent_1",
              name: LIVE_PUBLISH_INTENT_TOOL_NAME,
              input: { explicitLivePublish: true },
            },
          ],
        }),
      ),
    };

    await expect(
      resolveExplicitLivePublishIntent(model, {
        message: "Ship the Threads launch post now",
        modelName: "intent-model",
        mode: "full_access",
      }),
    ).resolves.toBe(true);

    expect(model.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "intent-model",
        maxTokens: 64,
        toolChoice: { type: "tool", name: LIVE_PUBLISH_INTENT_TOOL_NAME },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: wrapUserMessageForIntentClassification(
                  "Ship the Threads launch post now",
                ),
              },
            ],
          },
        ],
      }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[sochestral:publishing] intent resolved",
      expect.objectContaining({
        outcome: "true",
        reason: "llm_true",
        mode: "full_access",
      }),
    );
  });

  it.each([
    "Draft this for Threads",
    "Do not publish this on Threads",
    "Can you publish this?",
  ])("fails closed without calling the model when veto triggers: %s", async (message) => {
    const model: ModelProvider = { complete: vi.fn() };

    await expect(
      resolveExplicitLivePublishIntent(model, {
        message,
        modelName: "intent-model",
      }),
    ).resolves.toBe(false);
    expect(model.complete).not.toHaveBeenCalled();
  });

  it.each([
    { explicitLivePublish: false },
    { explicitLivePublish: "true" },
    {},
  ])(
    "fails closed when the tool answer is not an explicit true: %j",
    async (input) => {
      const model: ModelProvider = {
        complete: vi.fn().mockResolvedValue(
          modelCompletion({
            toolCalls: [
              {
                id: "intent_1",
                name: LIVE_PUBLISH_INTENT_TOOL_NAME,
                input,
              },
            ],
          }),
        ),
      };

      await expect(
        resolveExplicitLivePublishIntent(model, {
          message: "Publish this on Threads",
          modelName: "intent-model",
        }),
      ).resolves.toBe(false);
    },
  );

  it("fails closed on blank messages, missing tool calls, and provider errors", async () => {
    const blankModel: ModelProvider = { complete: vi.fn() };
    await expect(
      resolveExplicitLivePublishIntent(blankModel, {
        message: "   ",
        modelName: "intent-model",
      }),
    ).resolves.toBe(false);
    expect(blankModel.complete).not.toHaveBeenCalled();

    const missingTool: ModelProvider = {
      complete: vi.fn().mockResolvedValue(modelCompletion({})),
    };
    await expect(
      resolveExplicitLivePublishIntent(missingTool, {
        message: "Publish this on Threads",
        modelName: "intent-model",
      }),
    ).resolves.toBe(false);

    const failing: ModelProvider = {
      complete: vi.fn().mockRejectedValue(new Error("MODEL_UNAVAILABLE")),
    };
    await expect(
      resolveExplicitLivePublishIntent(failing, {
        message: "Publish this on Threads",
        modelName: "intent-model",
      }),
    ).resolves.toBe(false);
  });
});
