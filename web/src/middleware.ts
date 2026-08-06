import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Product host — marketing stays on apex; this host should land in the app. */
const APP_HOSTS = new Set([
  "app.sochestral.shop",
  // local product host if you use /etc/hosts or similar
  "app.localhost",
]);

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  if (!APP_HOSTS.has(host)) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // app. subdomain: `/` is marketing in the same Next app — send to product shell
  if (pathname === "/" || pathname === "") {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Skip static assets and Next internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
