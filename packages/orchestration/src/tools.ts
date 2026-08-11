import { z } from "zod";
import type { TargetPlatform } from "@sochestral/database";
import {
  AUTONOMY_SCHEDULE_POST_CAP,
  STANDARD_SCHEDULE_POST_CAP,
} from "./autonomy-brief.js";
import { OrchestrationError } from "./errors.js";
import type { ModelTool } from "./model.js";

export const ALLOWED_TOOL_NAMES = [
  "list_connected_accounts",
  "validate_post",
  "publish_now",
  "schedule_post",
] as const;

export type AllowedToolName = (typeof ALLOWED_TOOL_NAMES)[number];

const platformSchema = z.enum([
  "threads",
  "linkedin_personal",
  "instagram",
]);
const contentTypeSchema = z.enum([
  "text",
  "link",
  "image",
  "carousel",
  "short_video",
  "long_video",
  "document",
  "discord_embed",
  "reddit_text",
  "reddit_link",
]);

export const listConnectedAccountsInputSchema = z
  .object({ platform: platformSchema.optional() })
  .strict();

export const prepareReviewInputSchema = z
  .object({
    variants: z
      .array(
        z
          .object({
            platform: platformSchema,
            body: z.string().max(8000),
            mediaUrls: z.array(z.url()).max(5).default([]),
            attachmentIndexes: z.array(z.number().int().min(0).max(4)).max(5).default([]),
          })
          .strict(),
      )
      .min(1)
      .max(3),
  })
  .strict();

export const saveProfileEntryInputSchema = z
  .object({
    category: z.enum([
      "do_not",
      "tone",
      "brand_fact",
      "cadence",
      "audience",
      "skill",
      "competitor",
    ]),
    body: z.string().trim().min(1).max(4000),
    title: z.string().trim().max(200).optional(),
  })
  .strict();

export const unifiedPostInputSchema = z
  .object({
    platforms: z.array(platformSchema).min(1),
    title: z.string().trim().min(1).max(160).optional(),
    text: z.string().optional(),
    link: z.url().optional(),
    mediaAssetIds: z.array(z.string().trim().min(1)).max(5).optional(),
    contentType: contentTypeSchema.optional(),
    dryRun: z.boolean().optional(),
    confirm: z.boolean().optional(),
    idempotencyKey: z.string().trim().min(16).max(160).optional(),
    connectedAccountId: z.string().trim().min(1).optional(),
    connectedAccountIds: z
      .record(z.string(), z.string().trim().min(1))
      .optional(),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const schedulePostInputSchema = z
  .object({
    platforms: z.array(platformSchema).min(1),
    title: z.string().trim().min(1).max(160).optional(),
    text: z.string().optional(),
    link: z.url().optional(),
    mediaAssetIds: z.array(z.string().trim().min(1)).max(5).optional(),
    contentType: contentTypeSchema.optional(),
    confirm: z.boolean().optional(),
    idempotencyKey: z.string().trim().min(16).max(160).optional(),
    connectedAccountId: z.string().trim().min(1).optional(),
    connectedAccountIds: z
      .record(z.string(), z.string().trim().min(1))
      .optional(),
    options: z.record(z.string(), z.unknown()).optional(),
    publishAt: z
      .string()
      .trim()
      .min(1)
      .refine((value) => Number.isFinite(Date.parse(value)), {
        message: "publishAt must be a valid ISO datetime",
      }),
  })
  .strict();

export type AllowedToolInput =
  | z.infer<typeof listConnectedAccountsInputSchema>
  | z.infer<typeof unifiedPostInputSchema>
  | z.infer<typeof schedulePostInputSchema>;

const definitions: Array<{
  name: AllowedToolName | "prepare_review" | "save_profile_entry";
  description: string;
  schema: z.ZodType;
}> = [
  {
    name: "prepare_review",
    description:
      "Prepare editable review drafts for the explicitly requested platforms. This stores product review state only and never publishes.",
    schema: prepareReviewInputSchema,
  },
  {
    name: "save_profile_entry",
    description:
      "Persist an authoritative business profile rule the user asked to keep (do_not, tone, brand_fact, etc.). Only call when the user clearly wants it saved to their profile. Never claim a rule is saved unless this tool succeeds.",
    schema: saveProfileEntryInputSchema,
  },
  {
    name: "list_connected_accounts",
    description:
      "List connected account metadata. This is read only and returns no tokens.",
    schema: listConnectedAccountsInputSchema,
  },
  {
    name: "validate_post",
    description:
      "Validate content for the explicitly requested supported platforms.",
    schema: unifiedPostInputSchema,
  },
  {
    name: "publish_now",
    description:
      "Preview a publish only. The application always forces dryRun true and never permits live publish.",
    schema: unifiedPostInputSchema,
  },
  {
    name: "schedule_post",
    description:
      `Schedule a post for a future publishAt (UTC ISO, must be after now) through SocialMCP. Use when schedule intent is clear and publishAt is known from the user, an accepted plan, or an autonomy context brief. Write the caption in text and call this tool directly; do not use prepare_review for schedule asks. Never claim a schedule succeeded unless this tool returns ok. Max five mediaAssetIds. At most ${STANDARD_SCHEDULE_POST_CAP} schedule_post calls per turn normally; autonomy mode may allow up to ${AUTONOMY_SCHEDULE_POST_CAP}.`,
    schema: schedulePostInputSchema,
  },
];

export const MODEL_TOOLS: ModelTool[] = definitions.map(
  ({ name, description, schema }) => ({
    name,
    description,
    inputSchema: z.toJSONSchema(schema) as Record<string, unknown>,
  }),
);

export function isAllowedToolName(name: string): name is AllowedToolName {
  return (ALLOWED_TOOL_NAMES as readonly string[]).includes(name);
}

function samePlatforms(
  actual: TargetPlatform[],
  resolved: TargetPlatform[],
): boolean {
  // No resolved platforms means the user did not name one; the model may choose.
  if (resolved.length === 0) return actual.length > 0;
  // Tool calls may target any non-empty subset of the platforms the user named.
  return (
    actual.length > 0 &&
    actual.every((platform) => resolved.includes(platform))
  );
}

export function validateToolInput(
  name: string,
  raw: unknown,
  resolvedPlatforms: TargetPlatform[],
): {
  name: AllowedToolName | "prepare_review" | "save_profile_entry";
  input: Record<string, unknown>;
} {
  if (name === "prepare_review") {
    try {
      const parsed = prepareReviewInputSchema.parse(raw);
      if (
        !samePlatforms(
          parsed.variants.map((variant) => variant.platform),
          resolvedPlatforms,
        )
      ) {
        throw new Error("Review platforms do not match the explicit request");
      }
      return { name, input: parsed };
    } catch {
      throw new OrchestrationError(
        "INVALID_TOOL_ARGUMENTS",
        422,
        "The model produced invalid review arguments.",
      );
    }
  }
  if (name === "save_profile_entry") {
    try {
      const parsed = saveProfileEntryInputSchema.parse(raw);
      return { name, input: parsed };
    } catch {
      throw new OrchestrationError(
        "INVALID_TOOL_ARGUMENTS",
        422,
        "The model produced invalid profile entry arguments.",
      );
    }
  }
  if (!isAllowedToolName(name)) {
    throw new OrchestrationError(
      "INVALID_TOOL_ARGUMENTS",
      422,
      "The model requested a tool that is not allowed.",
    );
  }

  try {
    if (name === "list_connected_accounts") {
      const input = listConnectedAccountsInputSchema.parse(raw);
      if (
        input.platform &&
        resolvedPlatforms.length > 0 &&
        !resolvedPlatforms.includes(input.platform)
      ) {
        throw new Error("Account platform does not match the user request");
      }
      return { name, input };
    }

    const parsed =
      name === "schedule_post"
        ? schedulePostInputSchema.parse(raw)
        : unifiedPostInputSchema.parse(raw);
    if (!samePlatforms(parsed.platforms, resolvedPlatforms)) {
      throw new Error("Tool platforms do not match the explicit user request");
    }
    const input: Record<string, unknown> = { ...parsed };
    if (name === "publish_now") {
      input.dryRun = true;
      delete input.confirm;
      delete input.idempotencyKey;
    }
    if (name === "schedule_post") {
      // SocialMCP expects scheduledAt + confirm; the model speaks publishAt.
      const publishAt = input.publishAt;
      if (typeof publishAt === "string") {
        input.scheduledAt = publishAt;
      }
      delete input.publishAt;
      delete input.dryRun;
      input.confirm = true;
      const at = Date.parse(String(input.scheduledAt));
      if (!Number.isFinite(at) || at <= Date.now()) {
        throw new OrchestrationError(
          "INVALID_TOOL_ARGUMENTS",
          422,
          "publishAt must be a future UTC ISO datetime. Do not use dates in the past; derive times from the accepted plan relative to today.",
        );
      }
    }
    return { name, input };
  } catch (error) {
    if (error instanceof OrchestrationError) throw error;
    throw new OrchestrationError(
      "INVALID_TOOL_ARGUMENTS",
      422,
      "The model produced invalid tool arguments.",
    );
  }
}

function objectValue(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = source[key];
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function safeToolSummary(
  name: AllowedToolName,
  raw: unknown,
): Record<string, unknown> {
  const value =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};

  if (name === "list_connected_accounts") {
    const accounts = Array.isArray(value.accounts)
      ? value.accounts.map((entry) => {
          const account =
            typeof entry === "object" && entry !== null
              ? (entry as Record<string, unknown>)
              : {};
          return {
            platform: account.platform,
            connected: account.status === "active",
            username: account.platformUsername ?? null,
          };
        })
      : [];
    return { ok: value.ok === true, accounts };
  }

  if (name === "validate_post") {
    const normalized = objectValue(value, "normalized");
    return {
      ok: value.ok === true,
      valid: value.valid === true,
      errors: Array.isArray(value.errors) ? value.errors : [],
      warnings: Array.isArray(value.warnings) ? value.warnings : [],
      platforms: normalized?.platforms ?? [],
      composedTextLength: normalized?.composedTextLength ?? null,
      textPlanByPlatform: normalized?.textPlanByPlatform ?? {},
      mediaItemCount:
        normalized?.mediaAssetCount ?? normalized?.mediaUrlCount ?? 0,
    };
  }

  if (name === "schedule_post") {
    const scheduledRows = Array.isArray(value.scheduled)
      ? value.scheduled.filter(
          (entry): entry is Record<string, unknown> =>
            typeof entry === "object" && entry !== null && !Array.isArray(entry),
        )
      : [];
    const firstRow = scheduledRows[0];
    const publishAt =
      typeof value.publishAt === "string"
        ? value.publishAt
        : typeof firstRow?.publishAt === "string"
          ? firstRow.publishAt
          : null;
    const scheduleId =
      typeof value.id === "string"
        ? value.id
        : typeof value.scheduledPostId === "string"
          ? value.scheduledPostId
          : typeof firstRow?.id === "string"
            ? firstRow.id
            : null;
    const platforms = Array.isArray(value.platforms)
      ? value.platforms
      : scheduledRows
          .map((row) => row.platform)
          .filter((platform) => typeof platform === "string");
    return {
      ok: value.ok === true,
      scheduled:
        value.ok === true ||
        value.scheduled === true ||
        scheduledRows.length > 0,
      publishAt,
      scheduleId,
      platforms,
      scheduleCount: scheduledRows.length > 0 ? scheduledRows.length : null,
      code: typeof value.code === "string" ? value.code : null,
      message: typeof value.message === "string" ? value.message : null,
      calendarPath: "/app/calendar",
      scheduledPath: "/app/scheduled",
    };
  }

  const preview = objectValue(value, "preview");
  const mediaPlan = preview ? objectValue(preview, "mediaPlan") : undefined;
  return {
    ok: value.ok === true,
    dryRun: value.dryRun === true,
    platforms: value.wouldPublishTo ?? [],
    previewText: preview?.textPlanByPlatform ?? preview?.textPlan ?? null,
    mediaItemCount: mediaPlan?.count ?? 0,
    warnings: preview?.risks ?? [],
  };
}
