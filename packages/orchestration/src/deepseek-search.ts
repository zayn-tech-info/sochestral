export type DeepSeekSearchResult = {
  ok: boolean;
  summary: string;
};

export type DeepSeekSearchClient = {
  searchWeb(input: { query: string; why?: string }): Promise<DeepSeekSearchResult>;
};

const FAIL_OPEN =
  "No live web notes. Continue from the business profile and the conversation. Do not invent citations.";

/** Usual-day search: several web lookups plus a short brief. */
const SEARCH_TIMEOUT_MS = 90_000;
const SEARCH_MAX_OUTPUT_TOKENS = 8_000;
const SEARCH_SUMMARY_CAP = 4_000;

type SearchOutputItem = {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
};

export function extractSearchSummary(payload: {
  output_text?: string;
  output?: SearchOutputItem[];
}): string {
  const fromMessages =
    payload.output
      ?.filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((block) => block.type === "output_text" || !block.type)
      .map((block) => block.text)
      .filter((text): text is string => Boolean(text?.trim()))
      .join("\n")
      .trim() ?? "";
  const fromAnyText =
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter((block) => block.type !== "reasoning_text")
      .map((block) => block.text)
      .filter((text): text is string => Boolean(text?.trim()))
      .join("\n")
      .trim() ?? "";
  return (payload.output_text?.trim() || fromMessages || fromAnyText).trim();
}

export function createDeepSeekSearchClient(config: {
  apiKey: string | null;
  baseUrl: string;
  model: string;
}): DeepSeekSearchClient | null {
  if (!config.apiKey) return null;
  const { apiKey, baseUrl, model } = config;
  return {
    async searchWeb(input) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
      try {
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/responses`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            instructions:
              "Search the live web. Return a short operator brief: what is related to the ask, what is trending in that direction, and how real people post similar content. Name concrete examples. No generic AI listicles. No fake URLs.",
            input: input.why
              ? `${input.query}\n\nWhy this search: ${input.why}`
              : input.query,
            tools: [{ type: "web_search" }],
            tool_choice: { type: "web_search" },
            reasoning: { effort: "none" },
            max_output_tokens: SEARCH_MAX_OUTPUT_TOKENS,
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          return { ok: false, summary: FAIL_OPEN };
        }
        const payload = (await response.json()) as {
          output_text?: string;
          output?: SearchOutputItem[];
        };
        const text = extractSearchSummary(payload);
        if (!text) return { ok: false, summary: FAIL_OPEN };
        return { ok: true, summary: text.slice(0, SEARCH_SUMMARY_CAP) };
      } catch {
        return { ok: false, summary: FAIL_OPEN };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function failOpenSearchSummary(): string {
  return FAIL_OPEN;
}
