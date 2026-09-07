import { isTransientError, OrchestrationError } from "./errors.js";
import type {
  ModelCompletion,
  ModelContentBlock,
  ModelMessage,
  ModelProvider,
  ModelStreamHandlers,
  ModelTool,
  ModelToolCall,
  ModelToolChoice,
} from "./model.js";

type OpenAIChatMessage =
  | {
      role: "system" | "user" | "assistant";
      content: string | OpenAIContentPart[];
      tool_calls?: OpenAIToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAIChatResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      tool_calls?: OpenAIToolCall[];
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

function retryAfterMs(error: unknown): number {
  if (typeof error === "object" && error !== null && "headers" in error) {
    const headers = error.headers;
    if (headers instanceof Headers) {
      const value = Number(headers.get("retry-after"));
      if (Number.isFinite(value) && value >= 0) {
        return Math.min(value * 1000, 5000);
      }
    }
  }
  return 100;
}

function imageDataUrl(
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  data: string,
): string {
  return `data:${mediaType};base64,${data}`;
}

/** Exported for unit tests: map Anthropic-shaped blocks into OpenAI chat messages. */
export function toOpenAIChatMessages(
  system: string,
  messages: ModelMessage[],
): OpenAIChatMessage[] {
  const result: OpenAIChatMessage[] = [
    { role: "system", content: system },
  ];

  for (const message of messages) {
    if (message.role === "assistant") {
      const text = message.content
        .filter((block): block is Extract<ModelContentBlock, { type: "text" }> =>
          block.type === "text",
        )
        .map((block) => block.text)
        .join("");
      const toolCalls = message.content
        .filter((block): block is Extract<ModelContentBlock, { type: "tool_use" }> =>
          block.type === "tool_use",
        )
        .map((block) => ({
          id: block.id,
          type: "function" as const,
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input ?? {}),
          },
        }));
      result.push({
        role: "assistant",
        content: text || (toolCalls.length > 0 ? "" : ""),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    const toolResults = message.content.filter(
      (block): block is Extract<ModelContentBlock, { type: "tool_result" }> =>
        block.type === "tool_result",
    );
    if (toolResults.length > 0) {
      for (const block of toolResults) {
        result.push({
          role: "tool",
          tool_call_id: block.toolUseId,
          content: block.content,
        });
      }
      continue;
    }

    const parts: OpenAIContentPart[] = [];
    for (const block of message.content) {
      if (block.type === "text") {
        parts.push({ type: "text", text: block.text });
      } else if (block.type === "image") {
        parts.push({
          type: "image_url",
          image_url: {
            url: imageDataUrl(block.source.mediaType, block.source.data),
          },
        });
      }
    }
    result.push({
      role: "user",
      content: parts.length === 1 && parts[0]?.type === "text" ? parts[0].text : parts,
    });
  }

  return result;
}

function toOpenAITools(tools: ModelTool[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

function toOpenAIToolChoice(toolChoice: ModelToolChoice | undefined) {
  if (!toolChoice || toolChoice.type === "auto") return "auto";
  return {
    type: "function" as const,
    function: { name: toolChoice.name },
  };
}

function parseToolCalls(toolCalls: OpenAIToolCall[] | undefined): ModelToolCall[] {
  if (!toolCalls?.length) return [];
  return toolCalls.map((call) => {
    let input: unknown = {};
    try {
      input = JSON.parse(call.function.arguments || "{}");
    } catch {
      input = { raw: call.function.arguments };
    }
    return {
      id: call.id,
      name: call.function.name,
      input,
    };
  });
}

/**
 * OpenAI-compatible Thesean client for GPT vision routes (e.g. ship-like/gpt-5.6-luna).
 * Uses Chat Completions so tools + multimodal image_url content work together.
 */
export class TheseanOpenAIModelProvider implements ModelProvider {
  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs = 60_000,
    private readonly baseURL = "https://api.thesean.ai/v1",
  ) {}

  async complete(input: {
    system: string;
    messages: ModelMessage[];
    tools: ModelTool[];
    model: string;
    maxTokens: number;
    toolChoice?: ModelToolChoice;
    thinking?: { enabled: boolean; budgetTokens: number };
    stream?: ModelStreamHandlers;
  }): Promise<ModelCompletion> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const controller = new AbortController();
        const deadline = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          // GPT-5.6 Luna rejects Thesean's injected default (`minimal` / omitted).
          // Chat Completions wants a luna-valid effort: none | low | medium | high | xhigh | max.
          const reasoningEffort = input.thinking?.enabled === true ? "low" : "none";
          const body = {
            model: input.model,
            messages: toOpenAIChatMessages(input.system, input.messages),
            max_completion_tokens: input.maxTokens,
            reasoning_effort: reasoningEffort,
            stream: false,
            ...(input.tools.length > 0
              ? {
                  tools: toOpenAITools(input.tools),
                  tool_choice: toOpenAIToolChoice(input.toolChoice),
                }
              : {}),
          };
          const response = await fetch(`${this.baseURL}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          if (!response.ok) {
            const errBody = await response.text().catch(() => "");
            // #region agent log
            fetch('http://127.0.0.1:7380/ingest/bba007c1-d719-434b-a717-ab19f91562f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ebe5c0'},body:JSON.stringify({sessionId:'ebe5c0',runId:'pre-fix',hypothesisId:'F',location:'openai-model.ts:complete',message:'luna http error',data:{attempt,model:input.model,status:response.status,body:errBody.slice(0,300),toolCount:input.tools.length,maxTokens:input.maxTokens},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            const err = new Error(`Thesean OpenAI request failed (${response.status})`) as Error & {
              status?: number;
              headers?: Headers;
            };
            err.status = response.status;
            err.headers = response.headers;
            throw err;
          }
          const payload = (await response.json()) as OpenAIChatResponse;
          const message = payload.choices?.[0]?.message;
          const content = message?.content?.trim() ? message.content : null;
          // #region agent log
          fetch('http://127.0.0.1:7380/ingest/bba007c1-d719-434b-a717-ab19f91562f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ebe5c0'},body:JSON.stringify({sessionId:'ebe5c0',runId:'post-fix',hypothesisId:'F',location:'openai-model.ts:complete',message:'luna ok',data:{attempt,model:input.model,reasoningEffort,toolCallCount:message?.tool_calls?.length??0,finishReason:payload.choices?.[0]?.finish_reason??null,maxTokens:input.maxTokens},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          if (content && input.stream?.onTextDelta) {
            input.stream.onTextDelta(content);
          }
          return {
            content,
            thinking: null,
            toolCalls: parseToolCalls(message?.tool_calls),
            inputTokens: payload.usage?.prompt_tokens ?? 0,
            outputTokens: payload.usage?.completion_tokens ?? 0,
            attempts: attempt,
            stopReason: payload.choices?.[0]?.finish_reason ?? null,
          };
        } finally {
          clearTimeout(deadline);
        }
      } catch (error) {
        // #region agent log
        fetch('http://127.0.0.1:7380/ingest/bba007c1-d719-434b-a717-ab19f91562f7',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ebe5c0'},body:JSON.stringify({sessionId:'ebe5c0',runId:'pre-fix',hypothesisId:'F',location:'openai-model.ts:complete',message:'luna request failed',data:{attempt,model:input.model,status:typeof error==='object'&&error&&'status' in error?(error as {status:unknown}).status:null,name:error instanceof Error?error.name:null,msg:error instanceof Error?error.message.slice(0,80):null,aborted:typeof error==='object'&&error&&'name' in error&&(error as {name:string}).name==='AbortError'},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (attempt === 2 || !isTransientError(error)) {
          throw new OrchestrationError(
            "MODEL_UNAVAILABLE",
            503,
            "The model is temporarily unavailable.",
          );
        }
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs(error)));
      }
    }
    throw new OrchestrationError("MODEL_UNAVAILABLE", 503);
  }
}
