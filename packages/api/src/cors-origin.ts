/**
 * Resolves browser origins allowed by CORS_ORIGIN.
 * Supports a single value or a comma-separated list.
 * Outside production, also allows the localhost ↔ 127.0.0.1 twin
 * so local login works whether the web app is opened as localhost or 127.0.0.1.
 */
export function allowedCorsOrigins(
  raw: string | undefined = process.env.CORS_ORIGIN,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string[] {
  const configured = (raw ?? "http://localhost:3000")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const origins = configured.length > 0 ? configured : ["http://localhost:3000"];

  if (nodeEnv === "production") {
    return [...new Set(origins)];
  }

  const expanded = new Set(origins);
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (url.hostname === "localhost") {
        url.hostname = "127.0.0.1";
        expanded.add(url.origin);
      } else if (url.hostname === "127.0.0.1") {
        url.hostname = "localhost";
        expanded.add(url.origin);
      }
    } catch {
      // Keep the configured string even if it is not a valid URL.
    }
  }
  return [...expanded];
}

export function isAllowedCorsOrigin(
  origin: string | undefined | null,
  raw?: string,
  nodeEnv?: string,
): boolean {
  if (!origin) return false;
  return allowedCorsOrigins(raw, nodeEnv).includes(origin);
}
