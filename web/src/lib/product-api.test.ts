import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiBase, apiRequest, apiStreamTurn } from "./product-api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function ndjsonResponse(events: unknown[], status = 200) {
  const body = events.map((event) => `${JSON.stringify(event)}\n`).join("");
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
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

describe("apiStreamTurn", () => {
  it("parses NDJSON step events and returns the terminal turn", async () => {
    const terminal = {
      conversation: {
        id: "conv_1",
        title: "Draft",
        createdAt: "2026-08-08T00:00:00.000Z",
        updatedAt: "2026-08-08T00:00:01.000Z",
      },
      userMessage: {
        id: "msg_u",
        role: "user",
        content: "Draft on Threads",
        sequence: 1,
        createdAt: "2026-08-08T00:00:00.000Z",
      },
      assistantMessage: {
        id: "msg_a",
        role: "assistant",
        content: "Draft ready",
        sequence: 2,
        createdAt: "2026-08-08T00:00:01.000Z",
      },
      run: {
        id: "run_1",
        status: "completed",
        safeError: null,
        thinkingText: null,
      },
      toolSummaries: [],
      reviewGroups: [],
      turnActivity: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      ndjsonResponse([
        { type: "turn_started", sequence: 1 },
        { type: "step_started", sequence: 2, step: "preparing_draft" },
        { type: "step_completed", sequence: 3, step: "preparing_draft" },
        { type: "turn_completed", sequence: 4, result: terminal },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const seen: Array<{ type: string; step?: string }> = [];

    const result = await apiStreamTurn(
      "/orchestration/conversations/stream",
      {
        message: "Draft on Threads",
        requestId: "20000000-0000-4000-8000-000000000901",
      },
      (event) => {
        seen.push(event);
      },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBase}/orchestration/conversations/stream`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
    expect(
      seen
        .filter((event) => event.type === "step_started")
        .map((event) => event.step),
    ).toEqual(["preparing_draft"]);
    expect(result).toEqual(terminal);
  });

  it("throws a stable API error when the stream ends without a terminal event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjsonResponse([{ type: "turn_started", sequence: 1 }]),
      ),
    );

    await expect(
      apiStreamTurn("/orchestration/conversations/stream", { message: "Hi" }, () => undefined),
    ).rejects.toMatchObject({
      status: 502,
      code: "STREAM_INCOMPLETE",
    });
  });
});

describe("business profile client helpers", () => {
  it("GETs and PATCHes /profile (AC-5)", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: "bprof_1",
          businessName: "Acme",
          businessDescription: "Tools",
          websiteUrl: null,
          targetAudience: null,
          industry: null,
          setupStatus: "in_progress",
          setupStep: "tone",
          competitorsSkipped: false,
          compiledNote: "# Business profile",
          minimumComplete: false,
          sections: {},
          updatedAt: "2026-08-08T00:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: "bprof_1",
          businessName: "Acme Updated",
          businessDescription: "Tools",
          websiteUrl: null,
          targetAudience: null,
          industry: null,
          setupStatus: "in_progress",
          setupStep: "tone",
          competitorsSkipped: true,
          compiledNote: "# Business profile",
          minimumComplete: false,
          sections: {},
          updatedAt: "2026-08-08T00:00:00.000Z",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { getBusinessProfile, patchBusinessProfile } = await import("./product-api");
    const loaded = await getBusinessProfile();
    expect(loaded.businessName).toBe("Acme");
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBase}/profile`,
      expect.objectContaining({ credentials: "include" }),
    );

    const patched = await patchBusinessProfile({
      competitorsSkipped: true,
      redoSetup: true,
    });
    expect(patched.businessName).toBe("Acme Updated");
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBase}/profile`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          competitorsSkipped: true,
          redoSetup: true,
        }),
      }),
    );
  });
});
