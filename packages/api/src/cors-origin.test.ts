import { describe, expect, it } from "vitest";
import { allowedCorsOrigins, isAllowedCorsOrigin } from "./cors-origin.js";

describe("cors origin helpers", () => {
  it("defaults to localhost and adds the 127.0.0.1 twin outside production", () => {
    expect(allowedCorsOrigins(undefined, "development")).toEqual([
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);
  });

  it("keeps production origins exact and supports a comma-separated list", () => {
    expect(
      allowedCorsOrigins(
        "https://app.sochestral.shop, https://preview.sochestral.shop",
        "production",
      ),
    ).toEqual([
      "https://app.sochestral.shop",
      "https://preview.sochestral.shop",
    ]);
  });

  it("accepts the localhost twin for trusted origin checks outside production", () => {
    expect(
      isAllowedCorsOrigin(
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "development",
      ),
    ).toBe(true);
    expect(
      isAllowedCorsOrigin(
        "http://192.168.1.174:3000",
        "http://localhost:3000",
        "development",
      ),
    ).toBe(false);
  });
});
