import { migrate } from "drizzle-orm/postgres-js/migrator";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, createDb } from "../client.js";
import { requireDatabaseUrl } from "../env.js";

async function main(): Promise<void> {
  requireDatabaseUrl();
  const { db, client } = createDb();
  const migrationsFolder = resolve(
    fileURLToPath(new URL("../..", import.meta.url)),
    "drizzle",
  );

  try {
    await migrate(db, { migrationsFolder });
    console.log("Migrations applied");
  } finally {
    await client.end({ timeout: 5 });
    await closeDb();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
