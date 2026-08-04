import { desc, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { createDraftId } from "./ids.js";
import {
  drafts,
  type Draft,
  type DraftPlatform,
} from "./schema.js";

export type InsertDraftInput = {
  userId: string;
  platform: DraftPlatform;
  body: string;
  mediaUrls?: string[];
};

export async function insertDraft(
  db: Database["db"],
  input: InsertDraftInput,
): Promise<Draft> {
  const id = createDraftId();
  const [row] = await db
    .insert(drafts)
    .values({
      id,
      userId: input.userId,
      platform: input.platform,
      body: input.body,
      mediaUrls: input.mediaUrls ?? [],
    })
    .returning();

  if (!row) {
    throw new Error("insertDraft returned no row");
  }

  return row;
}

export async function listDraftsByUserId(
  db: Database["db"],
  userId: string,
): Promise<Draft[]> {
  return db
    .select()
    .from(drafts)
    .where(eq(drafts.userId, userId))
    .orderBy(desc(drafts.createdAt));
}
