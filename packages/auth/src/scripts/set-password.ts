import { closeDb, getDb, requireDatabaseUrl } from "@sochestral/database";
import {
  findUserByIdOrEmail,
  MIN_PASSWORD_LENGTH,
  setPasswordForUser,
} from "../index.js";

async function main(): Promise<void> {
  requireDatabaseUrl();
  const idOrEmail = process.argv[2];
  const password = process.argv[3];

  if (!idOrEmail || password === undefined) {
    console.error("Usage: pnpm set-password <userId|email> <password>");
    process.exit(1);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error("PASSWORD_TOO_SHORT");
    process.exit(1);
  }

  const { db } = getDb();
  try {
    const user = await findUserByIdOrEmail(db, idOrEmail);
    if (!user) {
      console.error("USER_NOT_FOUND");
      process.exit(1);
    }
    await setPasswordForUser(db, user, password);
    console.log(
      JSON.stringify({ id: user.id, email: user.email, passwordSet: true }),
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
    (error as { code: unknown }).code === "PASSWORD_TOO_SHORT"
  ) {
    console.error("PASSWORD_TOO_SHORT");
    process.exit(1);
  }
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
