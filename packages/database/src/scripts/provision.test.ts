import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createDb, type Database } from "../client.js";
import { requireTestDatabaseUrl } from "../env.js";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const provisionScript = resolve(packageRoot, "src/scripts/provision.ts");
const migrateScript = resolve(packageRoot, "src/scripts/migrate.ts");
const tsxBin = resolve(packageRoot, "node_modules/.bin/tsx");

async function runTsx(
  script: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFileAsync(tsxBin, [script, ...args], {
      cwd: packageRoot,
      env: { ...process.env, ...env },
      encoding: "utf8",
    });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    const err = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      code: typeof err.code === "number" ? err.code : 1,
    };
  }
}

describe("provision CLI (AC-3, AC-4, AC-5)", () => {
  let database: Database;
  const databaseUrl = () => requireTestDatabaseUrl();

  beforeAll(() => {
    database = createDb(databaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.db.execute(sql`delete from drafts`);
    await database.db.execute(sql`delete from users`);
  });

  it("prints JSON user and uses positional email over PROVISION_EMAIL (AC-3)", async () => {
    const { stdout, code } = await runTsx(
      provisionScript,
      ["from.arg@example.com"],
      {
        DATABASE_URL: databaseUrl(),
        PROVISION_EMAIL: "from.env@example.com",
      },
    );
    expect(code).toBe(0);
    const line = stdout.trim().split("\n").at(-1) ?? "";
    const body = JSON.parse(line) as {
      id: string;
      email: string | null;
      createdAt: string;
    };
    expect(body.id).toMatch(/^user_/);
    expect(body.email).toBe("from.arg@example.com");
    expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("uses PROVISION_EMAIL when no positional arg (AC-3)", async () => {
    const { stdout, code } = await runTsx(provisionScript, [], {
      DATABASE_URL: databaseUrl(),
      PROVISION_EMAIL: "only.env@example.com",
    });
    expect(code).toBe(0);
    const body = JSON.parse(stdout.trim().split("\n").at(-1) ?? "") as {
      email: string | null;
    };
    expect(body.email).toBe("only.env@example.com");
  });

  it("prints email null when arg and env are blank (AC-3)", async () => {
    const { stdout, code } = await runTsx(provisionScript, [""], {
      DATABASE_URL: databaseUrl(),
      PROVISION_EMAIL: "   ",
    });
    expect(code).toBe(0);
    const body = JSON.parse(stdout.trim().split("\n").at(-1) ?? "") as {
      email: string | null;
    };
    expect(body.email).toBeNull();
  });

  it("exits with EMAIL_TAKEN on duplicate email (AC-4)", async () => {
    const first = await runTsx(provisionScript, ["dup@example.com"], {
      DATABASE_URL: databaseUrl(),
    });
    expect(first.code).toBe(0);
    const second = await runTsx(provisionScript, [" Dup@Example.com "], {
      DATABASE_URL: databaseUrl(),
    });
    expect(second.code).toBe(1);
    expect(`${second.stdout}${second.stderr}`).toMatch(/EMAIL_TAKEN/);
  });

  it("fails fast when DATABASE_URL is empty (AC-5)", async () => {
    const result = await runTsx(provisionScript, [], {
      DATABASE_URL: "",
    });
    expect(result.code).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toMatch(/DATABASE_URL/);
  });
});

describe("migrate CLI (AC-5)", () => {
  it("fails fast when DATABASE_URL is empty", async () => {
    const result = await runTsx(migrateScript, [], {
      DATABASE_URL: "",
    });
    expect(result.code).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toMatch(/DATABASE_URL/);
  });
});
