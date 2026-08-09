import { describe, expect, it } from "vitest";
import { OrchestrationError } from "./errors.js";
import {
  ALLOWED_TOOL_NAMES,
  MODEL_TOOLS,
  safeToolSummary,
  validateToolInput,
} from "./tools.js";

describe("orchestration tools", () => {
  it("keeps SocialMCP tools plus product local review and profile save tools", () => {
    expect(ALLOWED_TOOL_NAMES).toEqual([
      "list_connected_accounts",
      "validate_post",
      "publish_now",
      "schedule_post",
    ]);
    expect(MODEL_TOOLS.map((tool) => tool.name)).toEqual([
      "prepare_review",
      "save_profile_entry",
      ...ALLOWED_TOOL_NAMES,
    ]);
  });

  it("rejects unknown tools before execution (AC-3)", () => {
    expect(() =>
      validateToolInput("delete_account", {}, ["threads"]),
    ).toThrowError(
      expect.objectContaining({
        code: "INVALID_TOOL_ARGUMENTS",
        status: 422,
      }) as OrchestrationError,
    );
  });

  it("rejects arguments that do not match explicit platforms (AC-2, AC-3)", () => {
    expect(() =>
      validateToolInput(
        "validate_post",
        { platforms: ["instagram"], text: "hello" },
        ["threads"],
      ),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_TOOL_ARGUMENTS" }),
    );
  });

  it("forces publish preview and removes confirmation (AC-5)", () => {
    const result = validateToolInput(
      "publish_now",
      {
        platforms: ["threads"],
        text: "Launch day",
        dryRun: false,
        confirm: true,
      },
      ["threads"],
    );

    expect(result.input).toMatchObject({ dryRun: true });
    expect(result.input).not.toHaveProperty("confirm");
    expect(result.input).not.toHaveProperty("idempotencyKey");
  });

  it("accepts prepare_review only for the explicit requested platforms", () => {
    const result = validateToolInput(
      "prepare_review",
      {
        variants: [
          { platform: "threads", body: "Launch", mediaUrls: [] },
        ],
      },
      ["threads"],
    );
    expect(result.name).toBe("prepare_review");
    expect(() =>
      validateToolInput(
        "prepare_review",
        { variants: [{ platform: "instagram", body: "Launch", mediaUrls: [] }] },
        ["threads"],
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TOOL_ARGUMENTS" }));
  });

  it("lets the model choose platforms when none were resolved from the message", () => {
    const review = validateToolInput(
      "prepare_review",
      {
        variants: [
          { platform: "threads", body: "Launch day", mediaUrls: [] },
        ],
      },
      [],
    );
    expect(review.name).toBe("prepare_review");
    const scheduled = validateToolInput(
      "schedule_post",
      {
        platforms: ["instagram"],
        text: "Launch day",
        publishAt: "2026-08-15T15:00:00.000Z",
      },
      [],
    );
    expect(scheduled).toMatchObject({
      name: "schedule_post",
      input: {
        platforms: ["instagram"],
        scheduledAt: "2026-08-15T15:00:00.000Z",
        confirm: true,
      },
    });
    expect(scheduled.input).not.toHaveProperty("publishAt");
    expect(scheduled.input).not.toHaveProperty("dryRun");
  });

  it("allows a subset of named platforms per tool call", () => {
    const result = validateToolInput(
      "schedule_post",
      {
        platforms: ["threads"],
        text: "Launch day",
        publishAt: "2026-08-15T15:00:00.000Z",
      },
      ["threads", "linkedin_personal"],
    );
    expect(result.name).toBe("schedule_post");
    expect(() =>
      validateToolInput(
        "schedule_post",
        {
          platforms: ["instagram"],
          text: "Launch day",
          publishAt: "2026-08-15T15:00:00.000Z",
        },
        ["threads", "linkedin_personal"],
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TOOL_ARGUMENTS" }));
  });

  it("accepts save_profile_entry without platform matching", () => {
    const result = validateToolInput(
      "save_profile_entry",
      {
        category: "do_not",
        body: "Never mention Woodcraft in posts",
        title: "Competitors",
      },
      [],
    );
    expect(result.name).toBe("save_profile_entry");
    expect(result.input).toMatchObject({
      category: "do_not",
      body: "Never mention Woodcraft in posts",
    });
  });

  it("projects connected accounts without private identifiers (AC-6, AC-9)", () => {
    const result = safeToolSummary("list_connected_accounts", {
      ok: true,
      accounts: [
        {
          id: "private-account-id",
          platform: "threads",
          status: "active",
          platformUsername: "public-name",
          accessToken: "private-token",
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      accounts: [
        {
          platform: "threads",
          connected: true,
          username: "public-name",
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/private|token/i);
  });

  it("projects validation and publish previews to safe fields (AC-5, AC-9)", () => {
    const validation = safeToolSummary("validate_post", {
      ok: true,
      valid: true,
      normalized: {
        platforms: ["threads"],
        composedTextLength: 10,
        mediaAssetCount: 1,
        rawPayload: "private",
      },
      warnings: [],
      internalId: "private",
    });
    const preview = safeToolSummary("publish_now", {
      ok: true,
      dryRun: true,
      wouldPublishTo: ["threads"],
      preview: {
        textPlan: "hello",
        mediaPlan: { count: 1, urls: ["https://signed.example/private"] },
        risks: ["review"],
      },
      postId: "private",
    });

    expect(validation).toEqual({
      ok: true,
      valid: true,
      errors: [],
      warnings: [],
      platforms: ["threads"],
      composedTextLength: 10,
      textPlanByPlatform: {},
      mediaItemCount: 1,
    });
    expect(preview).toEqual({
      ok: true,
      dryRun: true,
      platforms: ["threads"],
      previewText: "hello",
      mediaItemCount: 1,
      warnings: ["review"],
    });
    expect(JSON.stringify([validation, preview])).not.toMatch(
      /signed|internalId|postId|rawPayload/,
    );
  });

  it("accepts schedule_post with publishAt and rejects invalid args", () => {
    const result = validateToolInput(
      "schedule_post",
      {
        platforms: ["threads"],
        text: "Launch day",
        publishAt: "2026-08-15T15:00:00.000Z",
      },
      ["threads"],
    );
    expect(result).toEqual({
      name: "schedule_post",
      input: {
        platforms: ["threads"],
        text: "Launch day",
        scheduledAt: "2026-08-15T15:00:00.000Z",
        confirm: true,
      },
    });
    expect(() =>
      validateToolInput(
        "schedule_post",
        {
          platforms: ["threads"],
          text: "Launch day",
          publishAt: "not-a-date",
        },
        ["threads"],
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TOOL_ARGUMENTS" }));
    expect(() =>
      validateToolInput(
        "schedule_post",
        {
          platforms: ["threads"],
          text: "Launch day",
          publishAt: "2026-08-15T15:00:00.000Z",
          mediaAssetIds: ["a", "b", "c", "d", "e", "f"],
        },
        ["threads"],
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TOOL_ARGUMENTS" }));
    expect(() =>
      validateToolInput(
        "schedule_post",
        {
          platforms: ["threads"],
          text: "Launch day",
          publishAt: "2020-01-01T00:00:00.000Z",
        },
        ["threads"],
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "INVALID_TOOL_ARGUMENTS",
        message: expect.stringMatching(/future/i),
      }),
    );
  });

  it("summarizes schedule_post without private fields", () => {
    const summary = safeToolSummary("schedule_post", {
      ok: true,
      id: "sched_1",
      publishAt: "2026-08-15T15:00:00.000Z",
      platforms: ["threads"],
      accessToken: "secret",
    });
    expect(summary).toEqual({
      ok: true,
      scheduled: true,
      publishAt: "2026-08-15T15:00:00.000Z",
      scheduleId: "sched_1",
      platforms: ["threads"],
      scheduleCount: null,
      code: null,
      message: null,
      calendarPath: "/app/calendar",
      scheduledPath: "/app/scheduled",
    });
    expect(JSON.stringify(summary)).not.toMatch(/secret|accessToken/);

    const mcpShape = safeToolSummary("schedule_post", {
      ok: true,
      postId: "post_1",
      scheduled: [
        {
          id: "sched_a",
          platform: "threads",
          publishAt: "2026-08-15T15:00:00.000Z",
          connectedAccountId: "acct_private",
        },
        {
          id: "sched_b",
          platform: "linkedin_personal",
          publishAt: "2026-08-15T15:00:00.000Z",
          connectedAccountId: "acct_private_2",
        },
      ],
    });
    expect(mcpShape).toEqual({
      ok: true,
      scheduled: true,
      publishAt: "2026-08-15T15:00:00.000Z",
      scheduleId: "sched_a",
      platforms: ["threads", "linkedin_personal"],
      scheduleCount: 2,
      code: null,
      message: null,
      calendarPath: "/app/calendar",
      scheduledPath: "/app/scheduled",
    });
    expect(JSON.stringify(mcpShape)).not.toMatch(/acct_private|post_1/);

    const failed = safeToolSummary("schedule_post", {
      ok: false,
      status: "error",
      code: "SCHEDULE_TIME_MUST_BE_FUTURE",
      message: "scheduledAt must be in the future.",
    });
    expect(failed).toMatchObject({
      ok: false,
      scheduled: false,
      code: "SCHEDULE_TIME_MUST_BE_FUTURE",
      message: "scheduledAt must be in the future.",
    });
  });
});
