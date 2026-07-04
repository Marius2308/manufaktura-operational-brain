import { NextRequest, NextResponse } from "next/server";

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
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    // Branding assets the login page itself renders, before any cookie
    // exists. Without this, a first-time visitor's browser requests for
    // these get redirected to /login and return HTML instead of image
    // bytes, so the logo/favicon silently fail to render pre-login.
    pathname === "/logo.png" ||
    pathname === "/icon.png"
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
