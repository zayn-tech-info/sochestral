import { z } from "zod";
import type { TargetPlatform } from "@sochestral/database";
import { OrchestrationError } from "./errors.js";
import type { ModelTool } from "./model.js";

export const ALLOWED_TOOL_NAMES = [
  "list_connected_accounts",
  "validate_post",
  "publish_now",
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

export const unifiedPostInputSchema = z
  .object({
    platforms: z.array(platformSchema).min(1),
    title: z.string().trim().min(1).max(160).optional(),
    text: z.string().optional(),
    link: z.url().optional(),
    mediaAssetIds: z.array(z.string().trim().min(1)).optional(),
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

export type AllowedToolInput =
  | z.infer<typeof listConnectedAccountsInputSchema>
  | z.infer<typeof unifiedPostInputSchema>;

const definitions: Array<{
  name: AllowedToolName | "prepare_review";
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
  return (
    actual.length === resolved.length &&
    actual.every((platform) => resolved.includes(platform))
  );
}

export function validateToolInput(
  name: string,
  raw: unknown,
  resolvedPlatforms: TargetPlatform[],
): {
  name: AllowedToolName | "prepare_review";
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

    const parsed = unifiedPostInputSchema.parse(raw);
    if (!samePlatforms(parsed.platforms, resolvedPlatforms)) {
      throw new Error("Tool platforms do not match the explicit user request");
    }
    const input: Record<string, unknown> = { ...parsed };
    if (name === "publish_now") {
      input.dryRun = true;
      delete input.confirm;
      delete input.idempotencyKey;
    }
    return { name, input };
  } catch {
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
