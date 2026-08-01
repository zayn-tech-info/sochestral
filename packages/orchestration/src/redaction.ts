const SECRET_FIELDS = new Set([
  "authorization",
  "cookie",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "api_key",
  "apikey",
  "clientsecret",
  "client_secret",
  "password",
]);

const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const KEY_PATTERN =
  /\b(?:gsk|sk|pk|key)_[A-Za-z0-9_-]{12,}\b/gi;

export function redactText(value: string): string {
  return value
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(JWT_PATTERN, "[REDACTED_JWT]")
    .replace(KEY_PATTERN, "[REDACTED_KEY]");
}

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      SECRET_FIELDS.has(key.toLowerCase()) ? "[REDACTED]" : redactValue(child),
    ]),
  );
}

export function redactRecord(value: unknown): Record<string, unknown> {
  const redacted = redactValue(value);
  return typeof redacted === "object" &&
    redacted !== null &&
    !Array.isArray(redacted)
    ? (redacted as Record<string, unknown>)
    : { value: redacted };
}
