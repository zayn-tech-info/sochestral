import { afterEach, describe, expect, it, vi } from "vitest";

import { CalendarError } from "./calendar.js";
import {
  composeScheduleCaptions,
  platformsMentionedInMessage,
  resolveComposeTargets,
} from "./schedule-compose.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resolveComposeTargets", () => {
  const targets = [
    { accountId: "acct_th", platform: "threads" as const, caption: "" },
    {
      accountId: "acct_li",
      platform: "linkedin_personal" as const,
      caption: "old",
    },
  ];

  it("targets platforms named in the message", () => {
    expect(
      resolveComposeTargets({
        message: "Write a LinkedIn version about the launch",
        targets,
      }).map((row) => row.accountId),
    ).toEqual(["acct_li"]);
  });

  it("falls back to focus account then all targets", () => {
    expect(
      resolveComposeTargets({
        message: "",
        targets,
        focusAccountId: "acct_th",
      }).map((row) => row.accountId),
    ).toEqual(["acct_th"]);

    expect(
      resolveComposeTargets({ message: "", targets }).map((row) => row.accountId),
    ).toEqual(["acct_th", "acct_li"]);
  });
});

describe("platformsMentionedInMessage", () => {
  it("detects common aliases", () => {
    expect(
      platformsMentionedInMessage("post on ig and threads", [
        "threads",
        "instagram",
        "linkedin_personal",
      ]),
    ).toEqual(["threads", "instagram"]);
  });
});

describe("composeScheduleCaptions", () => {
  it("does not turn structured replies with no allowed updates into a caption", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                assistantText: "",
                updates: [
                  {
                    accountId: "acct_other",
                    caption: "This belongs elsewhere",
                  },
                ],
              }),
            },
          ],
        }),
      }),
    );

    await expect(
      composeScheduleCaptions(
        {
          message: "LinkedIn idea please",
          targets: [
            { accountId: "acct_li", platform: "linkedin_personal", caption: "" },
          ],
          profileContext: "Name: Acme",
        },
        { THESEAN_API_KEY: "test-key" },
      ),
    ).rejects.toMatchObject({
      code: "REWRITE_UNAVAILABLE",
      status: 503,
    } satisfies Partial<CalendarError>);
  });

  it("fails closed for malformed structured replies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "text",
              text: '{"assistantText":"","updates":[',
            },
          ],
        }),
      }),
    );

    await expect(
      composeScheduleCaptions(
        {
          message: "LinkedIn idea please",
          targets: [
            { accountId: "acct_li", platform: "linkedin_personal", caption: "" },
          ],
        },
        { THESEAN_API_KEY: "test-key" },
      ),
    ).rejects.toMatchObject({
      code: "REWRITE_UNAVAILABLE",
      status: 503,
    } satisfies Partial<CalendarError>);
  });

  it("still accepts a true plain text caption reply", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "text",
              text: "A ready to post launch caption.",
            },
          ],
        }),
      }),
    );

    const result = await composeScheduleCaptions(
      {
        message: "LinkedIn idea please",
        targets: [
          { accountId: "acct_li", platform: "linkedin_personal", caption: "" },
        ],
      },
      { THESEAN_API_KEY: "test-key" },
    );

    expect(result.updates).toEqual([
      { accountId: "acct_li", caption: "A ready to post launch caption." },
    ]);
  });

  it("rejects excessive target counts before calling Thesean", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      composeScheduleCaptions(
        {
          message: "Draft these",
          targets: Array.from({ length: 15 }, (_, index) => ({
            accountId: `acct_${index}`,
            platform: "threads" as const,
            caption: "",
          })),
        },
        { THESEAN_API_KEY: "test-key" },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_REWRITE",
      status: 422,
    } satisfies Partial<CalendarError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized message and caption values before calling Thesean", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      composeScheduleCaptions(
        {
          message: "x".repeat(40001),
          targets: [{ accountId: "acct_li", platform: "linkedin_personal" }],
        },
        { THESEAN_API_KEY: "test-key" },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_REWRITE",
      status: 422,
    } satisfies Partial<CalendarError>);

    await expect(
      composeScheduleCaptions(
        {
          targets: [
            {
              accountId: "acct_li",
              platform: "linkedin_personal",
              caption: "x".repeat(40001),
            },
          ],
        },
        { THESEAN_API_KEY: "test-key" },
      ),
    ).rejects.toMatchObject({
      code: "INVALID_REWRITE",
      status: 422,
    } satisfies Partial<CalendarError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized captions returned by Thesean", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                assistantText: "",
                updates: [
                  { accountId: "acct_li", caption: "x".repeat(40001) },
                ],
              }),
            },
          ],
        }),
      }),
    );

    await expect(
      composeScheduleCaptions(
        {
          targets: [
            { accountId: "acct_li", platform: "linkedin_personal", caption: "" },
          ],
        },
        { THESEAN_API_KEY: "test-key" },
      ),
    ).rejects.toMatchObject({
      code: "REWRITE_UNAVAILABLE",
      status: 503,
    } satisfies Partial<CalendarError>);
  });

  it("parses Thesean JSON updates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                assistantText: "Drafted LinkedIn.",
                updates: [
                  {
                    accountId: "acct_li",
                    caption: "Professional launch note",
                  },
                ],
              }),
            },
          ],
        }),
      }),
    );

    const result = await composeScheduleCaptions(
      {
        message: "LinkedIn idea please",
        targets: [
          { accountId: "acct_th", platform: "threads", caption: "" },
          { accountId: "acct_li", platform: "linkedin_personal", caption: "" },
        ],
        profileContext: "Name: Acme",
      },
      { THESEAN_API_KEY: "test-key" },
    );

    expect(result.assistantText).toBe("Drafted LinkedIn.");
    expect(result.updates).toEqual([
      { accountId: "acct_li", caption: "Professional launch note" },
    ]);
  });

  it("accepts empty assistantText for action-only replies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                assistantText: "",
                updates: [
                  { accountId: "acct_li", caption: "Quiet draft" },
                ],
              }),
            },
          ],
        }),
      }),
    );

    const result = await composeScheduleCaptions(
      {
        message: "LinkedIn",
        targets: [
          { accountId: "acct_li", platform: "linkedin_personal", caption: "" },
        ],
      },
      { THESEAN_API_KEY: "test-key" },
    );

    expect(result.assistantText).toBe("");
    expect(result.updates[0]?.caption).toBe("Quiet draft");
  });

  it("soft-fails when Thesean is missing", async () => {
    await expect(
      composeScheduleCaptions(
        {
          targets: [{ accountId: "acct_1", platform: "threads" }],
        },
        {},
      ),
    ).rejects.toMatchObject({
      code: "REWRITE_UNAVAILABLE",
      status: 503,
    } satisfies Partial<CalendarError>);
  });
});
