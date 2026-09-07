/** Provider said the reply hit the token cap. */
export function isLengthStopReason(reason: string | null | undefined): boolean {
  return reason === "max_tokens" || reason === "length";
}

/**
 * Visible assistant text that stops mid-thought (no end punctuation, hanging list).
 * Used when the provider omits a length stop reason.
 */
export function looksCutOffAssistantText(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  if (/[.!?]["'\u201d\u2019)]*$/.test(value)) return false;
  if (/:\s*$/.test(value)) return true;
  if (/\b\d+\.\s+/.test(value) && !/[.!?]\s*$/.test(value)) return true;
  if (/\b(?:day|the|a|an|to|for|and|or|which|should|before|after)\s*$/i.test(value)) {
    return true;
  }
  return false;
}

export function shouldContinueAssistantReply(input: {
  content: string | null | undefined;
  stopReason?: string | null;
  outputTokens?: number;
  maxTokens?: number;
  toolCallCount: number;
}): boolean {
  if (input.toolCallCount > 0) return false;
  const content = input.content?.trim() ?? "";
  if (!content) return false;
  if (isLengthStopReason(input.stopReason)) return true;
  if (
    typeof input.outputTokens === "number" &&
    typeof input.maxTokens === "number" &&
    input.maxTokens > 0 &&
    input.outputTokens >= input.maxTokens
  ) {
    return true;
  }
  return looksCutOffAssistantText(content);
}

export function joinContinuedReply(prior: string, next: string | null): string {
  const left = prior.trimEnd();
  const right = (next ?? "").trim();
  if (!right) return left;
  if (!left) return right;
  const needsSpace = !/\s$/.test(left) && !/^[.,;:!?]/.test(right);
  return `${left}${needsSpace ? " " : ""}${right}`;
}
