export class OrchestrationError extends Error {
  constructor(
    readonly code:
      | "UNAUTHORIZED"
      | "CONVERSATION_NOT_FOUND"
      | "RUN_IN_PROGRESS"
      | "INVALID_MESSAGE"
      | "INVALID_CURSOR"
      | "INVALID_TOOL_ARGUMENTS"
      | "DAILY_RUN_LIMIT"
      | "SOCIALMCP_UNAVAILABLE"
      | "MODEL_UNAVAILABLE"
      | "INTERNAL_ERROR",
    readonly status: 401 | 404 | 409 | 422 | 429 | 500 | 502 | 503,
    message: string = code,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OrchestrationError";
  }
}

export function stableErrorCode(error: unknown): string {
  if (error instanceof OrchestrationError) return error.code;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "INTERNAL_ERROR";
}

export function isTransientError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const status =
    "status" in error && typeof error.status === "number"
      ? error.status
      : "code" in error && typeof error.code === "number"
        ? error.code
        : undefined;
  if (status === 429 || (status !== undefined && status >= 500)) {
    return true;
  }
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message.toLowerCase()
      : "";
  return /timeout|timed out|fetch failed|network|econnreset|econnrefused/.test(
    message,
  );
}
