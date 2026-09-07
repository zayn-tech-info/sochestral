const PROVISIONAL_TITLES = new Set(["New chat", "Business setup"]);

const GREETING_PATTERN =
  /^(hi|hello|hey|yo|sup|hiya|howdy|thanks|thank you|ok|okay|sure|yes|no|yep|nope|good morning|good afternoon|good evening)[!?.]*$/i;

const LEADING_FILLER_PATTERN =
  /^(hi|hello|hey|yo|sup|please|can you|could you|i want to|i'd like to|i need to)\b[,!.\s]*/i;

export const CONVERSATION_TITLE_MAX_LENGTH = 48;

export function isGreetingMessage(message: string): boolean {
  const trimmed = message.replace(/\s+/g, " ").trim();
  if (!trimmed) return true;
  if (trimmed.length > 40) return false;
  return GREETING_PATTERN.test(trimmed);
}

export function isSubstantiveMessage(message: string): boolean {
  const trimmed = message.replace(/\s+/g, " ").trim();
  if (!trimmed || isGreetingMessage(trimmed)) return false;
  return trimmed.length >= 12 || /\w{4,}/.test(trimmed);
}

function startAsTitle(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function compressMessageToTitle(message: string): string {
  let text = message.replace(/\s+/g, " ").trim();
  text = text.replace(LEADING_FILLER_PATTERN, "").trim();
  if (!text || isGreetingMessage(text)) return "New chat";
  if (text.length > CONVERSATION_TITLE_MAX_LENGTH) {
    const sliced = text.slice(0, CONVERSATION_TITLE_MAX_LENGTH);
    const lastSpace = sliced.lastIndexOf(" ");
    text =
      lastSpace > 16 ? sliced.slice(0, lastSpace).trim() : sliced.trim();
  }
  return startAsTitle(text) || "New chat";
}

export function deriveInitialConversationTitle(
  message: string,
  options: { setupGateActive?: boolean } = {},
): string {
  if (options.setupGateActive) return "Business setup";
  if (isGreetingMessage(message)) return "New chat";
  return compressMessageToTitle(message);
}

export function isProvisionalConversationTitle(
  title: string,
  firstUserMessage?: string | null,
): boolean {
  const normalized = title.replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  if (PROVISIONAL_TITLES.has(normalized)) return true;
  if (isGreetingMessage(normalized)) return true;
  if (firstUserMessage) {
    const first = firstUserMessage.replace(/\s+/g, " ").trim();
    if (isGreetingMessage(first) && normalized === first.slice(0, 80)) {
      return true;
    }
    if (normalized === compressMessageToTitle(first)) {
      return true;
    }
  }
  return false;
}

export function hasEnoughTitleContext(input: {
  userMessages: string[];
  hasAssistantReply: boolean;
  businessName?: string | null;
}): boolean {
  if (input.businessName?.trim()) return true;
  const users = input.userMessages.filter((message) => message.trim().length > 0);
  if (users.length >= 2) return true;
  if (
    users.length >= 1 &&
    input.hasAssistantReply &&
    isSubstantiveMessage(users[0]!)
  ) {
    return true;
  }
  return false;
}

export function sanitizeGeneratedTitle(raw: string): string | null {
  let text = raw
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
  if (!text || isGreetingMessage(text) || PROVISIONAL_TITLES.has(text)) {
    return null;
  }
  if (text.length > CONVERSATION_TITLE_MAX_LENGTH) {
    text = text.slice(0, CONVERSATION_TITLE_MAX_LENGTH).trim();
  }
  return text || null;
}

export const TITLE_GENERATION_SYSTEM_MESSAGE =
  "Return only a short conversation title of 3 to 6 words that names the user's goal. No quotes, no trailing punctuation, no explanation.";
