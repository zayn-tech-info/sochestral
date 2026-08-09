import { afterEach, describe, expect, it, vi } from "vitest";
import { OrchestrationError } from "./errors.js";
import {
  TheseanOpenAIModelProvider,
  toOpenAIChatMessages,
} from "./openai-model.js";

describe("toOpenAIChatMessages", () => {
  it("maps text and base64 images into OpenAI multimodal content", () => {
    const messages = toOpenAIChatMessages("System", [
      {
        role: "user",
        content: [
          { type: "text", text: "Caption this" },
          {
            type: "image",
            source: {
              type: "base64",
              mediaType: "image/png",
              data: "abc123",
            },
          },
        ],
      },
    ]);

    expect(messages[0]).toEqual({ role: "system", content: "System" });
    expect(messages[1]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Caption this" },
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,abc123" },
        },
      ],
    });
  });

  it("maps tool use and tool results into OpenAI chat roles", () => {
    const messages = toOpenAIChatMessages("System", [
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "call_1",
            name: "prepare_review",
            input: { variants: [] },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            toolUseId: "call_1",
            content: "{\"ok\":true}",
          },
        ],
      },
    ]);

    expect(messages[1]).toMatchObject({
      role: "assistant",
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: {
            name: "prepare_review",
            arguments: "{\"variants\":[]}",
          },
        },
      ],
    });
    expect(messages[2]).toEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: "{\"ok\":true}",
    });
  });
});

describe("TheseanOpenAIModelProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts chat completions with image_url parts and returns tool calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "prepare_review",
                    arguments: "{\"variants\":[{\"platform\":\"threads\",\"body\":\"Hi\"}]}",
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TheseanOpenAIModelProvider("test-key", 5_000);
    const result = await provider.complete({
      system: "System",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Post this" },
            {
              type: "image",
              source: {
                type: "base64",
                mediaType: "image/jpeg",
                data: "qq",
              },
            },
          ],
        },
      ],
      tools: [
        {
          name: "prepare_review",
          description: "Prepare",
          inputSchema: { type: "object" },
        },
      ],
      model: "ship-like/gpt-5.6-luna",
      maxTokens: 1500,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.thesean.ai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      }),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    );
    expect(body.model).toBe("ship-like/gpt-5.6-luna");
    expect(body.messages[1].content).toEqual([
      { type: "text", text: "Post this" },
      {
        type: "image_url",
        image_url: { url: "data:image/jpeg;base64,qq" },
      },
    ]);
    expect(result.toolCalls).toEqual([
      {
        id: "call_1",
        name: "prepare_review",
        input: { variants: [{ platform: "threads", body: "Hi" }] },
      },
    ]);
    expect(result.inputTokens).toBe(12);
  });

  it("maps provider failures to MODEL_UNAVAILABLE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, headers: new Headers() }),
    );
    const provider = new TheseanOpenAIModelProvider("test-key", 5_000);
    await expect(
      provider.complete({
        system: "System",
        messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
        tools: [],
        model: "ship-like/gpt-5.6-luna",
        maxTokens: 100,
      }),
    ).rejects.toMatchObject({
      code: "MODEL_UNAVAILABLE",
    } satisfies Partial<OrchestrationError>);
  });
});
