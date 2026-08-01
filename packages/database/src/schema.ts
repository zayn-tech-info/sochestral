import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const drafts = pgTable(
  "drafts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    body: text("body").notNull(),
    mediaUrls: text("media_urls").array(),
    status: text("status").notNull().default("draft"),
    lastError: text("last_error"),
    mcpPostId: text("mcp_post_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("drafts_user_id_idx").on(table.userId),
    index("drafts_user_id_status_idx").on(table.userId, table.status),
    check(
      "drafts_platform_check",
      sql`${table.platform} in ('threads', 'linkedin', 'instagram')`,
    ),
    check(
      "drafts_status_check",
      sql`${table.status} in ('draft', 'approved', 'publish_requested', 'published', 'failed')`,
    ),
  ],
);

export const orchestrationConversations = pgTable(
  "orchestration_conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("orchestration_conversations_user_updated_idx").on(
      table.userId,
      table.updatedAt,
      table.id,
    ),
  ],
);

export const orchestrationMessages = pgTable(
  "orchestration_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => orchestrationConversations.id, {
        onDelete: "cascade",
      }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    sequence: integer("sequence").notNull(),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("orchestration_messages_conversation_sequence_unique").on(
      table.conversationId,
      table.sequence,
    ),
    uniqueIndex("orchestration_messages_request_id_unique")
      .on(table.requestId)
      .where(sql`${table.requestId} is not null`),
    index("orchestration_messages_conversation_sequence_idx").on(
      table.conversationId,
      table.sequence,
    ),
    check(
      "orchestration_messages_role_check",
      sql`${table.role} in ('user', 'assistant')`,
    ),
  ],
);

export const orchestrationRuns = pgTable(
  "orchestration_runs",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => orchestrationConversations.id, {
        onDelete: "cascade",
      }),
    triggerMessageId: text("trigger_message_id")
      .notNull()
      .references(() => orchestrationMessages.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    targetPlatforms: text("target_platforms").array().notNull(),
    modelStepCount: integer("model_step_count").notNull().default(0),
    providerAttemptCount: integer("provider_attempt_count").notNull().default(0),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    safeError: text("safe_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("orchestration_runs_one_active_conversation_unique")
      .on(table.conversationId)
      .where(sql`${table.status} = 'running'`),
    index("orchestration_runs_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    check(
      "orchestration_runs_status_check",
      sql`${table.status} in ('running', 'completed', 'failed')`,
    ),
    check(
      "orchestration_runs_model_step_count_check",
      sql`${table.modelStepCount} between 0 and 4`,
    ),
    check(
      "orchestration_runs_provider_attempt_count_check",
      sql`${table.providerAttemptCount} >= 0`,
    ),
  ],
);

export const orchestrationToolCalls = pgTable(
  "orchestration_tool_calls",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => orchestrationRuns.id, { onDelete: "cascade" }),
    providerCallId: text("provider_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    status: text("status").notNull().default("pending"),
    arguments: jsonb("arguments").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    attemptCount: integer("attempt_count").notNull().default(1),
    durationMs: integer("duration_ms"),
    safeError: text("safe_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("orchestration_tool_calls_run_provider_id_unique").on(
      table.runId,
      table.providerCallId,
    ),
    index("orchestration_tool_calls_run_created_idx").on(
      table.runId,
      table.createdAt,
    ),
    check(
      "orchestration_tool_calls_name_check",
      sql`${table.toolName} in ('list_connected_accounts', 'validate_post', 'publish_now')`,
    ),
    check(
      "orchestration_tool_calls_status_check",
      sql`${table.status} in ('pending', 'succeeded', 'failed')`,
    ),
    check(
      "orchestration_tool_calls_attempt_count_check",
      sql`${table.attemptCount} between 1 and 2`,
    ),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  orchestrationConversations: many(orchestrationConversations),
}));

export const orchestrationConversationsRelations = relations(
  orchestrationConversations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [orchestrationConversations.userId],
      references: [users.id],
    }),
    messages: many(orchestrationMessages),
    runs: many(orchestrationRuns),
  }),
);

export const orchestrationMessagesRelations = relations(
  orchestrationMessages,
  ({ one }) => ({
    conversation: one(orchestrationConversations, {
      fields: [orchestrationMessages.conversationId],
      references: [orchestrationConversations.id],
    }),
  }),
);

export const orchestrationRunsRelations = relations(
  orchestrationRuns,
  ({ one, many }) => ({
    conversation: one(orchestrationConversations, {
      fields: [orchestrationRuns.conversationId],
      references: [orchestrationConversations.id],
    }),
    triggerMessage: one(orchestrationMessages, {
      fields: [orchestrationRuns.triggerMessageId],
      references: [orchestrationMessages.id],
    }),
    toolCalls: many(orchestrationToolCalls),
  }),
);

export const orchestrationToolCallsRelations = relations(
  orchestrationToolCalls,
  ({ one }) => ({
    run: one(orchestrationRuns, {
      fields: [orchestrationToolCalls.runId],
      references: [orchestrationRuns.id],
    }),
  }),
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type OrchestrationConversation =
  typeof orchestrationConversations.$inferSelect;
export type OrchestrationMessage = typeof orchestrationMessages.$inferSelect;
export type OrchestrationRun = typeof orchestrationRuns.$inferSelect;
export type OrchestrationToolCall = typeof orchestrationToolCalls.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type NewSession = typeof sessions.$inferInsert;
export type NewDraft = typeof drafts.$inferInsert;
export type NewOrchestrationConversation =
  typeof orchestrationConversations.$inferInsert;
export type NewOrchestrationMessage =
  typeof orchestrationMessages.$inferInsert;
export type NewOrchestrationRun = typeof orchestrationRuns.$inferInsert;
export type NewOrchestrationToolCall =
  typeof orchestrationToolCalls.$inferInsert;

export type DraftPlatform = "threads" | "linkedin" | "instagram";
export type DraftStatus =
  | "draft"
  | "approved"
  | "publish_requested"
  | "published"
  | "failed";
