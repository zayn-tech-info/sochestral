import { describe, expect, it } from "vitest";

import { ApiError } from "./product-api";
import { isApiErrorCode, userFacingError } from "./user-facing-error";

describe("userFacingError", () => {
  it("maps known schedule codes to plain language", () => {
    expect(userFacingError("SCHEDULE_TIME_MUST_BE_FUTURE")).toMatch(/future/i);
    expect(userFacingError("SCHEDULE_NOT_FOUND")).toMatch(/not found/i);
    expect(userFacingError("SOCIALMCP_UNAVAILABLE")).toMatch(/social account/i);
    expect(userFacingError("SCHEDULE_REACTIVATE_FAILED")).toMatch(/reactivated/i);
  });

  it("reads ApiError.code and never echoes the raw code", () => {
    const message = userFacingError(
      new ApiError(422, "SCHEDULE_TIME_MUST_BE_FUTURE", {}),
    );
    expect(message).not.toContain("SCHEDULE_TIME_MUST_BE_FUTURE");
    expect(message).toMatch(/future/i);
  });

  it("keeps already-friendly prose", () => {
    expect(userFacingError("Publishing mode is unavailable.")).toBe(
      "Publishing mode is unavailable.",
    );
  });

  it("uses details.message when the code is unknown but details are prose", () => {
    expect(
      userFacingError(
        new ApiError(500, "WEIRD_NEW_FAILURE", {
          message: "The media host rejected this file type.",
        }),
      ),
    ).toBe("The media host rejected this file type.");
  });

  it("falls back for unknown codes without leaking them", () => {
    const message = userFacingError("SOME_NEW_CODE_XYZ");
    expect(message).not.toContain("SOME_NEW_CODE_XYZ");
    expect(message).toMatch(/try again/i);
  });

  it("detects API-style codes", () => {
    expect(isApiErrorCode("REQUEST_FAILED")).toBe(true);
    expect(isApiErrorCode("Pick a future time")).toBe(false);
  });
});
