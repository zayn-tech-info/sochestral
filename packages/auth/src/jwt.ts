import { SignJWT } from "jose";

const MCP_JWT_TTL_SECONDS = 15 * 60;

export function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === "") {
    const error = new Error(
      "JWT_SECRET is required (set it in the environment or root .env)",
    );
    (error as Error & { code: string }).code = "JWT_SECRET_MISSING";
    throw error;
  }
  return secret;
}

export type MintedMcpJwt = {
  token: string;
  expiresAt: Date;
};

/** Mint a short lived HS256 JWT for SocialMCP. `sub` must be a trusted users.id. */
export async function mintMcpJwt(userId: string): Promise<MintedMcpJwt> {
  const secret = requireJwtSecret();
  const key = new TextEncoder().encode(secret);
  const expiresAt = new Date(Date.now() + MCP_JWT_TTL_SECONDS * 1000);

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key);

  return { token, expiresAt };
}

export { MCP_JWT_TTL_SECONDS };
