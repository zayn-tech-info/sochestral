import { closeDb, getDb } from "../client.js";
import { requireDatabaseUrl } from "../env.js";
import { provisionUser } from "../users.js";

function resolveEmail(argv: string[]): string | null {
  const positional = argv[2];
  if (positional !== undefined) {
    const trimmed = positional.trim();
    return trimmed === "" ? null : positional;
  }
  const fromEnv = process.env.PROVISION_EMAIL;
  if (fromEnv === undefined) return null;
  const trimmed = fromEnv.trim();
  return trimmed === "" ? null : fromEnv;
}

async function main(): Promise<void> {
  requireDatabaseUrl();
  const email = resolveEmail(process.argv);
  const { db } = getDb();

  try {
    const user = await provisionUser(db, email);
    console.log(
      JSON.stringify({
        id: user.id,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      }),
    );
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "EMAIL_TAKEN"
  ) {
    console.error("EMAIL_TAKEN");
    process.exit(1);
  }
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
