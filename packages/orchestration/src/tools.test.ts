import { describe, expect, it } from "vitest";
import { OrchestrationError } from "./errors.js";
import {
  ALLOWED_TOOL_NAMES,
  MODEL_TOOLS,
  safeToolSummary,
  validateToolInput,
} from "./tools.js";

describe("orchestration tools", () => {
  it("keeps three SocialMCP tools and adds one product local review tool", () => {
    expect(ALLOWED_TOOL_NAMES).toEqual([
      "list_connected_accounts",
      "validate_post",
      "publish_now",
    ]);
    expect(MODEL_TOOLS.map((tool) => tool.name)).toEqual([
      "prepare_review",
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
});
