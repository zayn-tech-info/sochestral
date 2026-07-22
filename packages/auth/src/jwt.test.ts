import { decodeJwt } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import {
  mintMcpJwt,
  MCP_JWT_TTL_SECONDS,
  requireJwtSecret,
} from "./jwt.js";

describe("requireJwtSecret", () => {
  const previous = process.env.JWT_SECRET;

  afterEach(() => {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  });

  it("throws JWT_SECRET_MISSING when unset or blank (AC-8)", () => {
    delete process.env.JWT_SECRET;
    expect(() => requireJwtSecret()).toThrow(/JWT_SECRET/);
    try {
      requireJwtSecret();
    } catch (error) {
      expect((error as Error & { code: string }).code).toBe(
        "JWT_SECRET_MISSING",
      );
    }

    process.env.JWT_SECRET = "   ";
    expect(() => requireJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it("returns the secret when set", () => {
    process.env.JWT_SECRET = "test-secret-value";
    expect(requireJwtSecret()).toBe("test-secret-value");
  });
});

describe("mintMcpJwt", () => {
  const previous = process.env.JWT_SECRET;

  afterEach(() => {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  });

  it("mints HS256 JWT with sub = userId and ~15 minute TTL (AC-7)", async () => {
    process.env.JWT_SECRET = "mint-test-secret";
    const userId = "user_testSubject123456789";
    const minted = await mintMcpJwt(userId);
    const payload = decodeJwt(minted.token);

    expect(payload.sub).toBe(userId);
    expect(typeof payload.iat).toBe("number");
    expect(typeof payload.exp).toBe("number");
    expect((payload.exp as number) - (payload.iat as number)).toBe(
      MCP_JWT_TTL_SECONDS,
    );
    expect(minted.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("fails with JWT_SECRET_MISSING when secret is empty (AC-8)", async () => {
    process.env.JWT_SECRET = "";
    await expect(mintMcpJwt("user_x")).rejects.toMatchObject({
      code: "JWT_SECRET_MISSING",
    });
  });
});
