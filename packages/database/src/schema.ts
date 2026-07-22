import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
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

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Draft = typeof drafts.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type NewSession = typeof sessions.$inferInsert;
export type NewDraft = typeof drafts.$inferInsert;

export type DraftPlatform = "threads" | "linkedin" | "instagram";
export type DraftStatus =
  | "draft"
  | "approved"
  | "publish_requested"
  | "published"
  | "failed";
