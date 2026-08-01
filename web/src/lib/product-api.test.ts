import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiBase, apiRequest } from "./product-api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("sends credentials and JSON headers with request bodies (AC 1)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/example", {
      method: "POST",
      body: JSON.stringify({ message: "Hello" }),
    });

    expect(fetchMock).toHaveBeenCalledWith(`${apiBase}/example`, {
      method: "POST",
      body: JSON.stringify({ message: "Hello" }),
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("does not add a content type when there is no body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiRequest("/example");

    expect(fetchMock).toHaveBeenCalledWith(`${apiBase}/example`, {
      credentials: "include",
      headers: {},
    });
  });

  it("returns undefined for an empty successful response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(apiRequest<void>("/example")).resolves.toBeUndefined();
  });

  it("throws a stable API error with response details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ error: "RUN_IN_PROGRESS", recovery: "retry later" }, 409),
      ),
    );

    await expect(apiRequest("/example")).rejects.toEqual(
      new ApiError(409, "RUN_IN_PROGRESS", {
        error: "RUN_IN_PROGRESS",
        recovery: "retry later",
      }),
    );
  });

  it("uses a safe fallback when an error response is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("broken", { status: 500 })),
    );

    await expect(apiRequest("/example")).rejects.toMatchObject({
      status: 500,
      code: "REQUEST_FAILED",
      details: {},
    });
  });
});
