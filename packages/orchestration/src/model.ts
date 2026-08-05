import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { isTransientError, OrchestrationError } from "./errors.js";

export type ModelTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ModelToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type ModelContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string };
    }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | {
      type: "tool_result";
      toolUseId: string;
      content: string;
      isError?: boolean;
    };

export type ModelMessage = {
  role: "user" | "assistant";
  content: ModelContentBlock[];
};

export type ModelCompletion = {
  content: string | null;
  toolCalls: ModelToolCall[];
  inputTokens: number;
  outputTokens: number;
  attempts: number;
};

export type ModelToolChoice =
  | { type: "auto" }
  | { type: "tool"; name: string };

export interface ModelProvider {
  complete(input: {
    system: string;
    messages: ModelMessage[];
    tools: ModelTool[];
    model: string;
    maxTokens: number;
    toolChoice?: ModelToolChoice;
  }): Promise<ModelCompletion>;
}

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

function toAnthropicContent(block: ModelContentBlock): ContentBlockParam {
  if (block.type === "text") return block;
  if (block.type === "image") {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: block.source.mediaType,
        data: block.source.data,
      },
    };
  }
  if (block.type === "tool_use") {
    return {
      type: "tool_use",
      id: block.id,
      name: block.name,
      input: block.input,
    };
  }
  return {
    type: "tool_result",
    tool_use_id: block.toolUseId,
    content: block.content,
    is_error: block.isError,
  };
}

function toAnthropicMessage(message: ModelMessage): MessageParam {
  return {
    role: message.role,
    content: message.content.map(toAnthropicContent),
  };
}

function toAnthropicTool(tool: ModelTool): Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Tool.InputSchema,
  };
}

export class TheseanModelProvider implements ModelProvider {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly timeoutMs = 15_000,
  ) {
    this.client = new Anthropic({
      apiKey,
      baseURL: "https://api.thesean.ai",
      maxRetries: 0,
      timeout: timeoutMs,
    });
  }

  async complete(input: {
    system: string;
    messages: ModelMessage[];
    tools: ModelTool[];
    model: string;
    maxTokens: number;
    toolChoice?: ModelToolChoice;
  }): Promise<ModelCompletion> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const controller = new AbortController();
        let deadline: ReturnType<typeof setTimeout> | undefined;
        const toolChoice = input.toolChoice ?? { type: "auto" as const };
        const request = this.client.messages.create(
          {
            model: input.model,
            system: input.system,
            messages: input.messages.map(toAnthropicMessage),
            tools: input.tools.map(toAnthropicTool),
            tool_choice:
              toolChoice.type === "tool"
                ? { type: "tool", name: toolChoice.name }
                : { type: "auto" },
            max_tokens: input.maxTokens,
          },
          { signal: controller.signal },
        );
        const timedOut = new Promise<never>((_, reject) => {
          deadline = setTimeout(() => {
            controller.abort();
            reject(new Error("Model request timed out"));
          }, this.timeoutMs);
        });
        const message = await Promise.race([request, timedOut]).finally(() => {
          if (deadline) clearTimeout(deadline);
        });
        const text = message.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");
        const toolCalls = message.content
          .filter((block) => block.type === "tool_use")
          .map((block) => ({
            id: block.id,
            name: block.name,
            input: block.input,
          }));
        return {
          content: text || null,
          toolCalls,
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          attempts: attempt,
        };
      } catch (error) {
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
