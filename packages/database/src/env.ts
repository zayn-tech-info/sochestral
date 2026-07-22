import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

let loaded = false;

function loadEnvFiles(): void {
  if (loaded) return;
  loadEnv({ path: resolve(process.cwd(), "../../.env") });
  loadEnv({ path: resolve(process.cwd(), ".env") });
  loadEnv();
  loaded = true;
}

/** Returns DATABASE_URL or throws an error that names the variable. */
export function requireDatabaseUrl(): string {
  loadEnvFiles();
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === "") {
    throw new Error(
      "DATABASE_URL is required (set it in the environment or root .env)",
    );
  }
  return url;
}
