import { describe, expect, it, vi } from "vitest";
import type { ModelProvider } from "./model.js";
import {
  LIVE_PUBLISH_INTENT_TOOL_NAME,
  resolveExplicitLivePublishIntent,
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

describe("resolveExplicitLivePublishIntent", () => {
  it("returns true only when the forced tool reports explicitLivePublish true", async () => {
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
        modelName: "contract-model",
      }),
    ).resolves.toBe(true);

    expect(model.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "contract-model",
        maxTokens: 64,
        toolChoice: { type: "tool", name: LIVE_PUBLISH_INTENT_TOOL_NAME },
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Ship the Threads launch post now" }],
          },
        ],
      }),
    );
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
          message: "Publish this",
          modelName: "contract-model",
        }),
      ).resolves.toBe(false);
    },
  );

  it("fails closed on blank messages, missing tool calls, and provider errors", async () => {
    const blankModel: ModelProvider = { complete: vi.fn() };
    await expect(
      resolveExplicitLivePublishIntent(blankModel, {
        message: "   ",
        modelName: "contract-model",
      }),
    ).resolves.toBe(false);
    expect(blankModel.complete).not.toHaveBeenCalled();

    const missingTool: ModelProvider = {
      complete: vi.fn().mockResolvedValue(modelCompletion({})),
    };
    await expect(
      resolveExplicitLivePublishIntent(missingTool, {
        message: "Publish this",
        modelName: "contract-model",
      }),
    ).resolves.toBe(false);

    const failing: ModelProvider = {
      complete: vi.fn().mockRejectedValue(new Error("MODEL_UNAVAILABLE")),
    };
    await expect(
      resolveExplicitLivePublishIntent(failing, {
        message: "Publish this",
        modelName: "contract-model",
      }),
    ).resolves.toBe(false);
  });
});
