import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  Message,
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages";
import { isTransientError, OrchestrationError } from "./errors.js";
import { redactText } from "./redaction.js";

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
  thinking: string | null;
  toolCalls: ModelToolCall[];
  inputTokens: number;
  outputTokens: number;
  attempts: number;
  /** Anthropic/OpenAI stop reason when available (e.g. max_tokens). */
  stopReason?: string | null;
};

export type ModelToolChoice =
  | { type: "auto" }
  | { type: "tool"; name: string };

export type ModelStreamHandlers = {
  onTextDelta?: (delta: string) => void;
  onThinkingDelta?: (delta: string) => void;
};

export interface ModelProvider {
  complete(input: {
    system: string;
    messages: ModelMessage[];
    tools: ModelTool[];
    model: string;
    maxTokens: number;
    toolChoice?: ModelToolChoice;
    thinking?: { enabled: boolean; budgetTokens: number };
    stream?: ModelStreamHandlers;
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

function thinkingEnabledFromEnv(): boolean {
  return process.env.THESEAN_THINKING_ENABLED === "true";
}

function thinkingBudgetFromEnv(): number {
  const parsed = Number(process.env.THESEAN_THINKING_BUDGET_TOKENS ?? "2048");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 2048;
}

function describeModelError(error: unknown): {
  status?: number;
  message: string;
  timedOut: boolean;
} {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : undefined;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : String(error);
  const timedOut = /timeout|timed out|aborted/i.test(message);
  return { status, message, timedOut };
}

export class TheseanModelProvider implements ModelProvider {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly timeoutMs = 60_000,
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
    thinking?: { enabled: boolean; budgetTokens: number };
    stream?: ModelStreamHandlers;
  }): Promise<ModelCompletion> {
    const enableThinking =
      input.thinking?.enabled ?? thinkingEnabledFromEnv();
    const budgetTokens =
      input.thinking?.budgetTokens ?? thinkingBudgetFromEnv();

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await this.completeOnce(input, enableThinking, budgetTokens, attempt);
      } catch (error) {
        const thinkingRejected =
          enableThinking &&
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          (error as { status?: number }).status === 400;
        if (thinkingRejected && attempt === 1) {
          return this.complete({
            ...input,
            thinking: { enabled: false, budgetTokens },
            stream: input.stream,
          });
        }
        // Stream timeouts: retry once without streaming.
        const detail = describeModelError(error);
        if (input.stream && detail.timedOut && attempt === 1) {
          console.warn("[sochestral:model] stream timed out; retrying without stream", {
            model: input.model,
            timeoutMs: this.timeoutMs,
          });
          try {
            return await this.completeOnce(
              { ...input, stream: undefined },
              enableThinking,
              budgetTokens,
              attempt + 1,
            );
          } catch (retryError) {
            console.warn("[sochestral:model] request failed", {
              model: input.model,
              attempt: attempt + 1,
              timeoutMs: this.timeoutMs,
              ...describeModelError(retryError),
            });
            throw new OrchestrationError(
              "MODEL_UNAVAILABLE",
              503,
              "The model timed out before finishing. Try a shorter ask, or set THESEAN_TIMEOUT_MS higher.",
            );
          }
        }
        if (attempt === 2 || !isTransientError(error)) {
          console.warn("[sochestral:model] request failed", {
            model: input.model,
            attempt,
            timeoutMs: this.timeoutMs,
            ...detail,
          });
          throw new OrchestrationError(
            "MODEL_UNAVAILABLE",
            503,
            detail.timedOut
              ? "The model timed out before finishing. Try a shorter ask, or set THESEAN_TIMEOUT_MS higher."
              : "The model is temporarily unavailable.",
          );
        }
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs(error)));
      }
    }
    throw new OrchestrationError("MODEL_UNAVAILABLE", 503);
  }

  private async completeOnce(
    input: {
      system: string;
      messages: ModelMessage[];
      tools: ModelTool[];
      model: string;
      maxTokens: number;
      toolChoice?: ModelToolChoice;
      stream?: ModelStreamHandlers;
    },
    enableThinking: boolean,
    budgetTokens: number,
    attempt: number,
  ): Promise<ModelCompletion> {
    const controller = new AbortController();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const toolChoice = input.toolChoice ?? { type: "auto" as const };
    const tools =
      input.tools.length > 0
        ? input.tools.map((tool) => {
            const schema = { ...tool.inputSchema };
            delete schema.$schema;
            return {
              name: tool.name,
              description: tool.description,
              input_schema: schema as Tool.InputSchema,
            };
          })
        : undefined;
    const baseParams: Anthropic.MessageCreateParams = {
      model: input.model,
      system: input.system,
      messages: input.messages.map(toAnthropicMessage),
      max_tokens: enableThinking
        ? Math.max(input.maxTokens, budgetTokens + 512)
        : input.maxTokens,
      ...(enableThinking
        ? {
            thinking: {
              type: "enabled" as const,
              budget_tokens: budgetTokens,
            },
          }
        : {}),
      ...(tools
        ? {
            tools,
            tool_choice:
              toolChoice.type === "tool"
                ? { type: "tool" as const, name: toolChoice.name }
                : { type: "auto" as const },
          }
        : {}),
    };

    const timedOut = new Promise<never>((_, reject) => {
      deadline = setTimeout(() => {
        controller.abort();
        reject(new Error("Model request timed out"));
      }, this.timeoutMs);
    });

    try {
      if (input.stream) {
        const stream = this.client.messages.stream(baseParams, {
          signal: controller.signal,
        });
        const message = await Promise.race([
          (async () => {
            for await (const event of stream) {
              if (event.type !== "content_block_delta") continue;
              if (
                event.delta.type === "text_delta" &&
                "text" in event.delta
              ) {
                input.stream?.onTextDelta?.(event.delta.text);
              }
              if (
                event.delta.type === "thinking_delta" &&
                "thinking" in event.delta
              ) {
                input.stream?.onThinkingDelta?.(
                  redactText(String(event.delta.thinking)),
                );
              }
            }
            return stream.finalMessage();
          })(),
          timedOut,
        ]);
        return this.fromMessage(message, attempt);
      }

      const message = (await Promise.race([
        this.client.messages.create(baseParams, {
          signal: controller.signal,
        }),
        timedOut,
      ])) as Message;
      return this.fromMessage(message, attempt);
    } finally {
      if (deadline) clearTimeout(deadline);
    }
  }

  private fromMessage(message: Message, attempts: number): ModelCompletion {
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    const thinking = message.content
      .filter((block) => block.type === "thinking")
      .map((block) => ("thinking" in block ? String(block.thinking) : ""))
      .join("\n")
      .trim();
    const toolCalls = message.content
      .filter((block) => block.type === "tool_use")
      .map((block) => ({
        id: block.id,
        name: block.name,
        input: block.input,
      }));
    return {
      content: text || null,
      thinking: thinking ? redactText(thinking) : null,
      toolCalls,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      attempts,
      stopReason: message.stop_reason ?? null,
    };
  }
}
