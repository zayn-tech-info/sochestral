import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { requireDatabaseUrl } from "./env.js";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString = requireDatabaseUrl()) {
  const client = postgres(connectionString, { max: 5 });
  const db = drizzle(client, { schema });
  return { db, client };
}

let shared: Database | undefined;

/** Shared client for scripts and helpers. Prefer createDb in tests. */
export function getDb(): Database {
  if (!shared) {
    shared = createDb();
  }
  return shared;
}

export async function closeDb(): Promise<void> {
  if (!shared) return;
  await shared.client.end({ timeout: 5 });
  shared = undefined;
}
