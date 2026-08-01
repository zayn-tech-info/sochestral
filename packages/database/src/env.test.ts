import { afterEach, describe, expect, it } from "vitest";
import { requireTestDatabaseUrl } from "./env.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalTestDatabaseUrl = process.env.TEST_DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;

  if (originalTestDatabaseUrl === undefined) {
    delete process.env.TEST_DATABASE_URL;
  } else {
    process.env.TEST_DATABASE_URL = originalTestDatabaseUrl;
  }
});

describe("requireTestDatabaseUrl", () => {
  it("refuses to run without an explicit test database URL", () => {
    process.env.TEST_DATABASE_URL = "   ";

    expect(() => requireTestDatabaseUrl()).toThrow(/TEST_DATABASE_URL/);
  });

  it("refuses to use the development database even when query values differ", () => {
    process.env.DATABASE_URL =
      "postgresql://app:secret@localhost:5433/sochestral_test";
    process.env.TEST_DATABASE_URL =
      "postgresql://other:secret@localhost:5433/sochestral_test?application_name=vitest";

    expect(() => requireTestDatabaseUrl()).toThrow(
      /must not target DATABASE_URL/,
    );
  });

  it("refuses a database whose name does not identify it as a test database", () => {
    process.env.DATABASE_URL =
      "postgresql://app:secret@localhost:5433/sochestral";
    process.env.TEST_DATABASE_URL =
      "postgresql://app:secret@localhost:5433/sochestral_copy";

    expect(() => requireTestDatabaseUrl()).toThrow(/contains 'test'/);
  });

  it("returns an isolated test database URL", () => {
    process.env.DATABASE_URL =
      "postgresql://app:secret@localhost:5433/sochestral";
    process.env.TEST_DATABASE_URL =
      "postgresql://app:secret@localhost:5433/sochestral_test";

    expect(requireTestDatabaseUrl()).toBe(process.env.TEST_DATABASE_URL);
  });
});
