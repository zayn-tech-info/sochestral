import { listActiveProfileEntries } from "./profile.js";
import { listBrandAssets } from "./image.js";
import { createHash } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { voiceBibles, type VoiceBible } from "./schema.js";
import type { Database } from "./client.js";

type Db = Database["db"];

const VOICE_CATEGORIES = new Set([
  "tone",
  "audience",
  "do_not",
  "brand_fact",
]);

export function computeVoiceSourceHash(input: {
  entries: Array<{ id: string; category: string; body: string }>;
  colors: Array<{ id: string; value: string }>;
  notes: Array<{ id: string; text: string }>;
}): string {
  const lines = [
    ...input.entries
      .filter((entry) => VOICE_CATEGORIES.has(entry.category))
      .map((entry) => `entry:${entry.id}:${entry.category}:${entry.body}`),
    ...input.colors.map((color) => `color:${color.id}:${color.value}`),
    ...input.notes.map((note) => `note:${note.id}:${note.text}`),
  ].sort();
  return createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
}

export async function getVoiceBible(
  db: Db,
  userId: string,
): Promise<VoiceBible | null> {
  const [row] = await db
    .select()
    .from(voiceBibles)
    .where(eq(voiceBibles.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function scheduleVoiceBibleCompile(
  db: Db,
  input: { userId: string; sourceHash: string },
): Promise<VoiceBible> {
  const existing = await getVoiceBible(db, input.userId);
  if (
    existing &&
    existing.sourceHash === input.sourceHash &&
    existing.status === "current"
  ) {
    return existing;
  }
  const now = new Date();
  if (existing) {
    const [updated] = await db
      .update(voiceBibles)
      .set({
        sourceHash: input.sourceHash,
        status: "compiling",
        pendingAt: now,
        compileHash: input.sourceHash,
        updatedAt: now,
      })
      .where(eq(voiceBibles.userId, input.userId))
      .returning();
    return updated!;
  }
  const [created] = await db
    .insert(voiceBibles)
    .values({
      userId: input.userId,
      sourceHash: input.sourceHash,
      status: "compiling",
      pendingAt: now,
      compileHash: input.sourceHash,
    })
    .returning();
  return created!;
}

export async function claimDueVoiceBibleCompile(
  db: Db,
  debounceMs: number,
): Promise<VoiceBible | null> {
  const cutoff = new Date(Date.now() - debounceMs);
  const [due] = await db
    .select()
    .from(voiceBibles)
    .where(
      and(
        eq(voiceBibles.status, "compiling"),
        lt(voiceBibles.pendingAt, cutoff),
      ),
    )
    .orderBy(voiceBibles.pendingAt)
    .limit(1);
  return due ?? null;
}

export async function markVoiceBibleCurrent(
  db: Db,
  input: { userId: string; compileHash: string; briefText: string },
): Promise<VoiceBible | null> {
  const [row] = await db
    .update(voiceBibles)
    .set({
      briefText: input.briefText.slice(0, 4000),
      status: "current",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(voiceBibles.userId, input.userId),
        eq(voiceBibles.sourceHash, input.compileHash),
        sql`${voiceBibles.compileHash} = ${input.compileHash}`,
      ),
    )
    .returning();
  return row ?? null;
}

export async function markVoiceBibleFailed(
  db: Db,
  input: { userId: string; compileHash: string },
): Promise<void> {
  await db
    .update(voiceBibles)
    .set({ status: "failed", updatedAt: new Date() })
    .where(
      and(
        eq(voiceBibles.userId, input.userId),
        eq(voiceBibles.compileHash, input.compileHash),
      ),
    );
}

export async function refreshVoiceBibleHash(
  db: Db,
  userId: string,
): Promise<VoiceBible> {
  const entries = await listActiveProfileEntries(db, userId);
  const assets = await listBrandAssets(db, { userId });
  const sourceHash = computeVoiceSourceHash({
    entries: entries.map((entry) => ({
      id: entry.id,
      category: entry.category,
      body: entry.body,
    })),
    colors: assets
      .filter((asset) => asset.kind === "color" && asset.colorValue)
      .map((asset) => ({ id: asset.id, value: asset.colorValue! })),
    notes: assets
      .filter((asset) => asset.noteText?.trim())
      .map((asset) => ({ id: asset.id, text: asset.noteText!.trim() })),
  });
  return scheduleVoiceBibleCompile(db, { userId, sourceHash });
}
