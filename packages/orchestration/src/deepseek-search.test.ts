import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDeepSeekSearchClient,
  extractSearchSummary,
  failOpenSearchSummary,
} from "./deepseek-search.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createDeepSeekSearchClient", () => {
  it("returns null without a key and exposes the fail open note (AC-4)", () => {
    expect(
      createDeepSeekSearchClient({
        apiKey: null,
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat",
      }),
    ).toBeNull();
    expect(failOpenSearchSummary()).toMatch(/do not invent citations/i);
  });

  it("fails open when the provider errors (AC-4)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    const client = createDeepSeekSearchClient({
      apiKey: "sk-test",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
    });
    const result = await client!.searchWeb({ query: "founder shipping posts" });
    expect(result.ok).toBe(false);
    expect(result.summary).toBe(failOpenSearchSummary());
    expect(result.summary).not.toMatch(/https?:\/\//);
  });

  it("returns the provider brief when search succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          output_text:
            "Shop owners post short bench notes. Avoid generic Monday motivation.",
        }),
      }),
    );
    const client = createDeepSeekSearchClient({
      apiKey: "sk-test",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
    });
    const result = await client!.searchWeb({
      query: "hardware tools threads posts",
      why: "Do it all still searches first.",
    });
    expect(result).toEqual({
      ok: true,
      summary:
        "Shop owners post short bench notes. Avoid generic Monday motivation.",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.deepseek.com/responses",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const body = JSON.parse(
      (fetch as unknown as { mock: { calls: Array<[string, { body: string }]> } })
        .mock.calls[0][1].body,
    );
    expect(body.max_output_tokens).toBe(8_000);
    expect(body.reasoning).toEqual({ effort: "none" });
    expect(body.tool_choice).toEqual({ type: "web_search" });
  });

  it("reads DeepSeek message output_text and skips reasoning (AC-4)", () => {
    expect(
      extractSearchSummary({
        output: [
          {
            type: "reasoning",
            content: [{ type: "reasoning_text", text: "I should search more." }],
          },
          { type: "web_search_call" },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "Makers post short shop notes, not listicles.",
              },
            ],
          },
        ],
      }),
    ).toBe("Makers post short shop notes, not listicles.");
  });
});
