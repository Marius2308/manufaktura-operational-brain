import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const expected = process.env.APP_PASSWORD;
  // Fail closed: an unset APP_PASSWORD must never fall back to a hardcoded
  // default, or a deployment that forgets to configure it would be reachable
  // with a publicly-known password.
  if (!expected || password !== expected) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set("brain_auth", expected, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
