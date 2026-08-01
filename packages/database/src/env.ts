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

/** Returns a clearly isolated test database URL or refuses to continue. */
export function requireTestDatabaseUrl(): string {
  loadEnvFiles();
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  if (!testUrl) {
    throw new Error(
      "TEST_DATABASE_URL is required for tests that reset database tables",
    );
  }

  const testTarget = parseDatabaseTarget(testUrl, "TEST_DATABASE_URL");
  const developmentUrl = process.env.DATABASE_URL?.trim();
  if (developmentUrl) {
    const developmentTarget = parseDatabaseTarget(
      developmentUrl,
      "DATABASE_URL",
    );
    if (testTarget.identity === developmentTarget.identity) {
      throw new Error("TEST_DATABASE_URL must not target DATABASE_URL");
    }
  }

  if (!testTarget.databaseName.includes("test")) {
    throw new Error(
      "TEST_DATABASE_URL must name a database that contains 'test'",
    );
  }

  return testUrl;
}

function parseDatabaseTarget(
  value: string,
  variableName: string,
): { databaseName: string; identity: string } {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      throw new Error("unsupported protocol");
    }
    const databaseName = decodeURIComponent(parsed.pathname)
      .replace(/^\//, "")
      .toLowerCase();
    if (!databaseName) throw new Error("missing database name");
    return {
      databaseName,
      identity: `${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}/${databaseName}`,
    };
  } catch {
    throw new Error(`${variableName} must be a valid Postgres database URL`);
  }
}
