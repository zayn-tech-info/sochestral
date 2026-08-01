import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  createDb,
  provisionUser,
  requireTestDatabaseUrl,
  type Database,
} from "@sochestral/database";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const setPasswordScript = resolve(packageRoot, "src/scripts/set-password.ts");
const tsxBin = resolve(packageRoot, "node_modules/.bin/tsx");

async function runTsx(
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFileAsync(tsxBin, [setPasswordScript, ...args], {
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

describe("set-password CLI (AC-2)", () => {
  let database: Database;
  const databaseUrl = () => requireTestDatabaseUrl();

  beforeAll(() => {
    database = createDb(databaseUrl());
  });

  afterAll(async () => {
    if (database) await database.client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await database.db.execute(sql`delete from sessions`);
    await database.db.execute(sql`delete from drafts`);
    await database.db.execute(sql`delete from users`);
  });

  it("prints JSON with passwordSet true for a known email", async () => {
    const user = await provisionUser(database.db, "setpw@example.com");
    const { stdout, code } = await runTsx(
      ["setpw@example.com", "password123"],
      { DATABASE_URL: databaseUrl() },
    );
    expect(code).toBe(0);
    const body = JSON.parse(stdout.trim().split("\n").at(-1) ?? "") as {
      id: string;
      email: string | null;
      passwordSet: boolean;
    };
    expect(body.id).toBe(user.id);
    expect(body.email).toBe("setpw@example.com");
    expect(body.passwordSet).toBe(true);
  });

  it("exits USER_NOT_FOUND for an unknown email", async () => {
    const result = await runTsx(["missing@example.com", "password123"], {
      DATABASE_URL: databaseUrl(),
    });
    expect(result.code).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toMatch(/USER_NOT_FOUND/);
  });

  it("exits PASSWORD_TOO_SHORT for a short password", async () => {
    await provisionUser(database.db, "shortpw@example.com");
    const result = await runTsx(["shortpw@example.com", "short"], {
      DATABASE_URL: databaseUrl(),
    });
    expect(result.code).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toMatch(/PASSWORD_TOO_SHORT/);
  });
});
