import { describe, expect, it, vi } from "vitest";
import {
  ConnectorError,
  DefaultConnectorService,
  type ConnectorGateway,
} from "./connectors.js";

function gateway(value: unknown): ConnectorGateway {
  return {
    callTool: vi.fn().mockResolvedValue(value),
  };
}

describe("connector service", () => {
  it("returns every supported platform and only public account fields", async () => {
    const source = gateway({
      ok: true,
      accounts: [
        {
          id: "acct_threads_1",
          userId: "user_secret",
          platform: "threads",
          platformAccountId: "provider_secret",
          platformUsername: "studio",
          displayName: "Studio",
          avatarUrl: "https://cdn.example/avatar.jpg",
          status: "active",
          accessTokenEncrypted: "secret",
          metadataJson: "secret",
        },
        {
          id: "acct_instagram_1",
          platform: "instagram",
          platformUsername: "visuals",
          displayName: null,
          status: "reconnect_required",
        },
      ],
    });

    const result = await new DefaultConnectorService(source).list("user_1");

    expect(result.connectors).toEqual([
      {
        platform: "threads",
        state: "connected",
        accounts: [
          {
            id: "acct_threads_1",
            username: "studio",
            displayName: "Studio",
            avatarUrl: "https://cdn.example/avatar.jpg",
            state: "connected",
          },
        ],
      },
      {
        platform: "linkedin_personal",
        state: "not_connected",
        accounts: [],
      },
      {
        platform: "instagram",
        state: "reconnect_required",
        accounts: [
          {
            id: "acct_instagram_1",
            username: "visuals",
            displayName: null,
            avatarUrl: null,
            state: "reconnect_required",
          },
        ],
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /user_secret|provider_secret|accessToken|metadataJson|secret/,
    );
  });

  it("reads https avatar urls from nested metadata when top-level is missing", async () => {
    const source = gateway({
      ok: true,
      accounts: [
        {
          id: "acct_threads_2",
          platform: "threads",
          platformUsername: "nested",
          displayName: "Nested",
          status: "active",
          metadataJson: JSON.stringify({
            avatarUrl: "https://cdn.example/from-meta.jpg",
          }),
        },
        {
          id: "acct_threads_3",
          platform: "threads",
          platformUsername: "insecure",
          displayName: "Insecure",
          status: "active",
          avatarUrl: "http://cdn.example/not-https.jpg",
        },
      ],
    });

    const result = await new DefaultConnectorService(source).list("user_1");
    const threads = result.connectors.find((item) => item.platform === "threads");
    expect(threads?.accounts).toEqual([
      {
        id: "acct_threads_2",
        username: "nested",
        displayName: "Nested",
        avatarUrl: "https://cdn.example/from-meta.jpg",
        state: "connected",
      },
      {
        id: "acct_threads_3",
        username: "insecure",
        displayName: "Insecure",
        avatarUrl: null,
        state: "connected",
      },
    ]);
  });

  it.each([
    ["threads", "https://threads.net/oauth/authorize"],
    [
      "linkedin_personal",
      "https://www.linkedin.com/oauth/v2/authorization",
    ],
    [
      "instagram",
      "https://www.facebook.com/v21.0/dialog/oauth",
    ],
  ])("accepts the fixed OAuth host for %s", async (platform, authorizeUrl) => {
    const source = gateway({
      authorizeUrl,
      expiresAt: "2026-07-26T12:00:00.000Z",
    });

    await expect(
      new DefaultConnectorService(source).startConnect("user_1", platform),
    ).resolves.toEqual({
      platform,
      authorizeUrl,
      expiresAt: "2026-07-26T12:00:00.000Z",
    });
  });

  it("rejects unsupported platforms before calling SocialMCP", async () => {
    const source = gateway({});
    await expect(
      new DefaultConnectorService(source).startConnect("user_1", "facebook"),
    ).rejects.toMatchObject({
      code: "INVALID_PLATFORM",
      status: 422,
    });
    expect(source.callTool).not.toHaveBeenCalled();
  });

  it("rejects a returned authorization URL on another host", async () => {
    const source = gateway({
      authorizeUrl: "https://evil.example/consent",
      expiresAt: "2026-07-26T12:00:00.000Z",
    });

    await expect(
      new DefaultConnectorService(source).startConnect("user_1", "threads"),
    ).rejects.toBeInstanceOf(ConnectorError);
  });
});
