import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { decodeJwt } from "jose";
import {
  createDb,
  provisionUser,
  requireTestDatabaseUrl,
  type Database,
} from "@sochestral/database";
import {
  MCP_JWT_TTL_SECONDS,
  SESSION_COOKIE_NAME,
  setPasswordForUser,
} from "@sochestral/auth";
import { createApp } from "./app.js";

function cookieFrom(response: Response): string | undefined {
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  const match = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!match) return undefined;
  return match.split(";")[0];
}

describe("auth API routes", () => {
  let database: Database;
  let app: ReturnType<typeof createApp>;
  const previousJwt = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = "api-test-jwt-secret";
    database = createDb(requireTestDatabaseUrl());
    app = createApp(database.db);
  });

  afterAll(async () => {
    if (previousJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwt;
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.client`delete from sessions`;
    await database.client`delete from drafts`;
    await database.client`delete from users`;
  });

  async function provisionWithPassword(email: string, password: string) {
    const user = await provisionUser(database.db, email);
    await setPasswordForUser(database.db, user, password);
    return user;
  }

  it("GET /health reports the product API service", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      service: "sochestral-api",
    });
  });

  it("OPTIONS /auth/login reflects localhost and 127.0.0.1 CORS origins", async () => {
    const previousCors = process.env.CORS_ORIGIN;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.CORS_ORIGIN = "http://localhost:3000";
    process.env.NODE_ENV = "development";
    const corsApp = createApp(database.db);

    for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000"]) {
      const res = await corsApp.request("/auth/login", {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe(origin);
      expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    }

    const denied = await corsApp.request("/auth/login", {
      method: "OPTIONS",
      headers: {
        Origin: "http://192.168.1.174:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(denied.status).toBe(204);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();

    if (previousCors === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previousCors;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  it("POST /auth/login sets session cookie and returns public user (AC-3, AC-9)", async () => {
    const user = await provisionWithPassword(
      "login@example.com",
      "password123",
    );
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "  Login@Example.com ",
        password: "password123",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ id: user.id, email: "login@example.com" });
    expect(Object.keys(body).sort()).toEqual(["email", "id"]);
    expect(JSON.stringify(body)).not.toMatch(/password/i);
    expect(cookieFrom(res)?.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true);
  });

  it("POST /auth/login returns INVALID_CREDENTIALS on bad password (AC-4)", async () => {
    await provisionWithPassword("fail@example.com", "password123");
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "fail@example.com",
        password: "wrong-password",
      }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "INVALID_CREDENTIALS" });
    expect(cookieFrom(res)).toBeUndefined();
  });

  it("GET /auth/me requires a valid session cookie (AC-5)", async () => {
    const user = await provisionWithPassword("me@example.com", "password123");
    const login = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "me@example.com", password: "password123" }),
    });
    const cookie = cookieFrom(login);
    expect(cookie).toBeTruthy();

    const me = await app.request("/auth/me", {
      headers: { Cookie: cookie! },
    });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ id: user.id, email: "me@example.com" });

    const unauth = await app.request("/auth/me");
    expect(unauth.status).toBe(401);
    expect(await unauth.json()).toEqual({ error: "UNAUTHORIZED" });
  });

  it("POST /auth/logout clears the session so me fails (AC-6)", async () => {
    await provisionWithPassword("out@example.com", "password123");
    const login = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "out@example.com",
        password: "password123",
      }),
    });
    const cookie = cookieFrom(login)!;

    const logout = await app.request("/auth/logout", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(logout.status).toBe(204);

    const me = await app.request("/auth/me", {
      headers: { Cookie: cookie },
    });
    expect(me.status).toBe(401);
  });

  it("POST /auth/mcp-token returns JWT with sub = user id (AC-7, AC-9)", async () => {
    const user = await provisionWithPassword("mcp@example.com", "password123");
    const login = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "mcp@example.com",
        password: "password123",
      }),
    });
    const cookie = cookieFrom(login)!;

    const res = await app.request("/auth/mcp-token", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      expiresAt: string;
    };
    expect(Object.keys(body).sort()).toEqual(["expiresAt", "token"]);
    expect(JSON.stringify(body)).not.toMatch(/password_hash|oauth/i);
    const payload = decodeJwt(body.token);
    expect(payload.sub).toBe(user.id);
    expect((payload.exp as number) - (payload.iat as number)).toBe(
      MCP_JWT_TTL_SECONDS,
    );
  });

  it("POST /auth/mcp-token returns JWT_SECRET_MISSING when secret empty (AC-8)", async () => {
    await provisionWithPassword("nosecret@example.com", "password123");
    const login = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nosecret@example.com",
        password: "password123",
      }),
    });
    const cookie = cookieFrom(login)!;
    const saved = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "";
    try {
      const res = await app.request("/auth/mcp-token", {
        method: "POST",
        headers: { Cookie: cookie },
      });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "JWT_SECRET_MISSING" });
    } finally {
      process.env.JWT_SECRET = saved;
    }
  });
});
