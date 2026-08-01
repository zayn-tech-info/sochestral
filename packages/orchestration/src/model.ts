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

export interface ModelProvider {
  complete(input: {
    system: string;
    messages: ModelMessage[];
    tools: ModelTool[];
    model: string;
    maxTokens: number;
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

  constructor(apiKey: string) {
    this.client = new Anthropic({
      apiKey,
      baseURL: "https://api.thesean.ai",
      maxRetries: 0,
    });
  }

  async complete(input: {
    system: string;
    messages: ModelMessage[];
    tools: ModelTool[];
    model: string;
    maxTokens: number;
  }): Promise<ModelCompletion> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const message = await this.client.messages.create({
          model: input.model,
          system: input.system,
          messages: input.messages.map(toAnthropicMessage),
          tools: input.tools.map(toAnthropicTool),
          tool_choice: { type: "auto" },
          max_tokens: input.maxTokens,
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
