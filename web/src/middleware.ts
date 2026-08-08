import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Product host — marketing stays on apex. */
const APP_HOSTS = new Set([
  "app.sochestral.shop",
  "app.localhost",
]);

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  if (!APP_HOSTS.has(host)) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Root of app host is the marketing page in this monorepo — never serve it here.
  // Do not read `sochestral_session` here: that cookie is host-only on the product
  // API (spec 0002 AC-3, no Domain), so it is never visible on this app host.
  // Full auth stays enforced inside /app via GET /auth/me.
  if (pathname === "/" || pathname === "") {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
