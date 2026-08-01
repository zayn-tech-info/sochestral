import { afterEach, describe, expect, it, vi } from "vitest";
import { TheseanModelProvider } from "./model.js";

function messageResponse(
  content: Array<Record<string, unknown>> = [
    { type: "text", text: "Ready", citations: null },
  ],
) {
  return new Response(
    JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "contract-model",
      content,
      stop_reason: content.some((block) => block.type === "tool_use")
        ? "tool_use"
        : "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 12, output_tokens: 4 },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("TheseanModelProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses the Thesean Anthropic endpoint, configured model, tools, and output cap (AC-3, AC-10)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(messageResponse());
    vi.stubGlobal("fetch", fetchMock);
    const provider = new TheseanModelProvider("test-key");

    const result = await provider.complete({
      system: "Be careful",
      messages: [
        { role: "user", content: [{ type: "text", text: "Post on Threads" }] },
      ],
      tools: [
        {
          name: "validate_post",
          description: "Validate a post",
          inputSchema: { type: "object", properties: {} },
        },
      ],
      model: "contract-model",
      maxTokens: 321,
    });

    expect(result).toEqual({
      content: "Ready",
      toolCalls: [],
      inputTokens: 12,
      outputTokens: 4,
      attempts: 1,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.thesean.ai/v1/messages",
    );
    const request = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    ) as Record<string, unknown>;
    expect(request).toMatchObject({
      model: "contract-model",
      system: "Be careful",
      max_tokens: 321,
      tool_choice: { type: "auto" },
      tools: [
        {
          name: "validate_post",
          input_schema: { type: "object", properties: {} },
        },
      ],
    });
  });

  it("maps Anthropic text and tool use blocks (AC-3, AC-10)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        messageResponse([
          { type: "text", text: "Checking" },
          {
            type: "tool_use",
            id: "tool_1",
            name: "validate_post",
            input: { platforms: ["threads"], text: "Launch" },
          },
        ]),
      ),
    );
    const provider = new TheseanModelProvider("test-key");

    await expect(
      provider.complete({
        system: "Be careful",
        messages: [
          { role: "user", content: [{ type: "text", text: "Post" }] },
        ],
        tools: [],
        model: "contract-model",
        maxTokens: 100,
      }),
    ).resolves.toMatchObject({
      content: "Checking",
      toolCalls: [
        {
          id: "tool_1",
          name: "validate_post",
          input: { platforms: ["threads"], text: "Launch" },
        },
      ],
    });
  });

  it("retries one transient response and then succeeds (AC-7)", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        async () =>
          new Response('{"type":"error","error":{"type":"api_error","message":"temporary"}}', {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }),
      )
      .mockImplementationOnce(async () =>
        messageResponse([{ type: "text", text: "Recovered" }]),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new TheseanModelProvider("test-key");

    const pending = provider.complete({
      system: "Be careful",
      messages: [
        { role: "user", content: [{ type: "text", text: "Post" }] },
      ],
      tools: [],
      model: "contract-model",
      maxTokens: 100,
    });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({
      content: "Recovered",
      attempts: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("makes exactly two requests for a terminal transient failure (AC-7)", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response('{"type":"error","error":{"type":"api_error","message":"temporary"}}', {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new TheseanModelProvider("test-key");

    const pending = provider.complete({
      system: "Be careful",
      messages: [
        { role: "user", content: [{ type: "text", text: "Post" }] },
      ],
      tools: [],
      model: "contract-model",
      maxTokens: 100,
    });
    const rejection = expect(pending).rejects.toMatchObject({
      code: "MODEL_UNAVAILABLE",
      status: 503,
    });
    await vi.runAllTimersAsync();

    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
