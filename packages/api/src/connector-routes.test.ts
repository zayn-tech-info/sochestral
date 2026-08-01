import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDb,
  provisionUser,
  requireTestDatabaseUrl,
  type Database,
} from "@sochestral/database";
import {
  createSession,
  SESSION_COOKIE_NAME,
} from "@sochestral/auth";
import {
  ConnectorError,
  type ConnectorService,
} from "@sochestral/orchestration";
import { createApp } from "./app.js";

function connectorMock(): ConnectorService {
  return {
    list: vi.fn().mockResolvedValue({
      connectors: [
        { platform: "threads", state: "not_connected", accounts: [] },
        {
          platform: "linkedin_personal",
          state: "not_connected",
          accounts: [],
        },
        { platform: "instagram", state: "not_connected", accounts: [] },
      ],
    }),
    startConnect: vi.fn().mockResolvedValue({
      platform: "threads",
      authorizeUrl: "https://threads.net/oauth/authorize",
      expiresAt: "2026-07-26T12:00:00.000Z",
    }),
  };
}

describe("connector API routes", () => {
  let database: Database;
  let userId: string;
  let cookie: string;
  let connectors: ConnectorService;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    database = createDb(requireTestDatabaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.client`delete from users`;
    const user = await provisionUser(database.db, "connect@example.com");
    userId = user.id;
    const session = await createSession(database.db, user.id);
    cookie = `${SESSION_COOKIE_NAME}=${session.rawToken}`;
    connectors = connectorMock();
    app = createApp(database.db, undefined, connectors);
  });

  it.each([
    ["GET", "/connectors"],
    ["POST", "/connectors/threads/connect"],
  ])("requires a product session for %s %s", async (method, path) => {
    const response = await app.request(path, { method });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "UNAUTHORIZED" });
  });

  it("lists connectors for only the session user", async () => {
    const response = await app.request("/connectors", {
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(200);
    expect(connectors.list).toHaveBeenCalledWith(userId);
    expect(JSON.stringify(await response.json())).not.toContain("token");
  });

  it("starts connect from the validated path platform", async () => {
    const response = await app.request("/connectors/threads/connect", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(200);
    expect(connectors.startConnect).toHaveBeenCalledWith(userId, "threads");
  });

  it("maps connector errors to stable public codes", async () => {
    vi.mocked(connectors.startConnect).mockRejectedValue(
      new ConnectorError("INVALID_PLATFORM", 422),
    );
    const response = await app.request("/connectors/facebook/connect", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "INVALID_PLATFORM" });
  });
});
