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
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }
  const cookie = request.cookies.get("brain_auth")?.value;
  if (cookie !== (process.env.APP_PASSWORD ?? "manufaktura")) {
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
