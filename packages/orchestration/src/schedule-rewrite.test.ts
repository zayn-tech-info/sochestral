import { afterEach, describe, expect, it, vi } from "vitest";

import { CalendarError } from "./calendar.js";
import { rewriteScheduleSelection } from "./schedule-rewrite.js";

describe("rewriteScheduleSelection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects empty selection", async () => {
    await expect(
      rewriteScheduleSelection(
        { selection: "", action: "regenerate" },
        { THESEAN_API_KEY: "key" },
      ),
    ).rejects.toMatchObject({ code: "INVALID_REWRITE", status: 422 });
  });

  it("requires instruction for tweak and comment", async () => {
    await expect(
      rewriteScheduleSelection(
        { selection: "hello", action: "tweak", instruction: "" },
        { THESEAN_API_KEY: "key" },
      ),
    ).rejects.toMatchObject({ code: "INVALID_REWRITE", status: 422 });
  });

  it("rejects instructions over 40 words", async () => {
    const instruction = Array.from({ length: 41 }, (_, i) => `w${i}`).join(" ");
    await expect(
      rewriteScheduleSelection(
        { selection: "hello", action: "comment", instruction },
        { THESEAN_API_KEY: "key" },
      ),
    ).rejects.toMatchObject({ code: "INVALID_REWRITE", status: 422 });
  });

  it("soft-fails when Thesean is not configured", async () => {
    await expect(
      rewriteScheduleSelection(
        { selection: "hello", action: "tweak", instruction: "shorter" },
        {},
      ),
    ).rejects.toMatchObject({ code: "REWRITE_UNAVAILABLE", status: 503 });
  });

  it("regenerates without an instruction", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "  Fresh hello  " }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await rewriteScheduleSelection(
      { selection: "hello", action: "regenerate" },
      { THESEAN_API_KEY: "secret", THESEAN_MODEL: "test-model" },
    );

    expect(result).toEqual({ suggestion: "Fresh hello" });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("returns suggestion text from Thesean for tweak", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "  Rewritten hello  " }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await rewriteScheduleSelection(
      {
        selection: "hello",
        action: "tweak",
        instruction: "make it punchy",
      },
      { THESEAN_API_KEY: "secret", THESEAN_MODEL: "test-model" },
    );

    expect(result).toEqual({ suggestion: "Rewritten hello" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.thesean.ai/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret",
        }),
      }),
    );
  });

  it("maps Thesean failures to REWRITE_UNAVAILABLE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    await expect(
      rewriteScheduleSelection(
        { selection: "hello", action: "comment", instruction: "add a wink" },
        { THESEAN_API_KEY: "secret" },
      ),
    ).rejects.toBeInstanceOf(CalendarError);
  });
});
