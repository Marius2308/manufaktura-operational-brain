import { NextRequest, NextResponse } from "next/server";

// Static image/icon assets (logo, favicon, app-router icon/apple-icon/
// opengraph-image convention files, anything in /public, etc.) are public
// branding, never sensitive data, and some — like the login page's own logo
// — are requested by a browser that has no auth cookie yet. Gating them
// behind the login redirect just returns HTML instead of image bytes,
// silently breaking pre-login rendering. Matched by extension instead of an
// enumerated path list so a future icon file doesn't need its own line here.
const PUBLIC_ASSET_PATTERN = /\.(png|jpe?g|svg|ico|webp|gif)$/i;

/**
 * Simple login gate (per spec: one internal user type, no roles).
 * A cookie set by /api/login must match APP_PASSWORD. Not production-grade
 * auth — see README for what a real deployment would need.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/_next") ||
    pathname === "/robots.txt" ||
    PUBLIC_ASSET_PATTERN.test(pathname)
  ) {
    return NextResponse.next();
  }
  const expected = process.env.APP_PASSWORD;
  const cookie = request.cookies.get("brain_auth")?.value;
  // Fail closed: no hardcoded fallback. If APP_PASSWORD isn't configured,
  // every request is treated as unauthenticated rather than risking an
  // `undefined === undefined` false match against an unset cookie.
  if (!expected || cookie !== expected) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
