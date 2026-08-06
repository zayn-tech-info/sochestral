import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Product host — marketing stays on apex. */
const APP_HOSTS = new Set([
  "app.sochestral.shop",
  "app.localhost",
]);

/** Must match product API cookie name (`packages/auth` SESSION_COOKIE_NAME). */
const SESSION_COOKIE = "sochestral_session";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  if (!APP_HOSTS.has(host)) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Root of app host is the marketing page in this monorepo — never serve it here.
  if (pathname === "/" || pathname === "") {
    const url = request.nextUrl.clone();
    const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
    // Cookie presence only: full auth is still enforced inside /app via /auth/me.
    url.pathname = hasSession ? "/app" : "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
