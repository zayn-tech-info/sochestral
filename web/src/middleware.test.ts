import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function requestFor(host: string, pathname = "/") {
  const url = new URL(pathname, "http://example.test");
  return new NextRequest(url, {
    headers: { host },
  });
}

describe("app host middleware", () => {
  it("redirects app host root to /app without reading the API session cookie", () => {
    const response = middleware(requestFor("app.sochestral.shop", "/"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://example.test/app");
  });

  it("redirects local app host root to /app", () => {
    const response = middleware(requestFor("app.localhost", "/"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/app");
  });

  it("leaves non-app hosts unchanged", () => {
    const response = middleware(requestFor("sochestral.shop", "/"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("leaves non-root app paths unchanged", () => {
    const response = middleware(requestFor("app.sochestral.shop", "/login"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
