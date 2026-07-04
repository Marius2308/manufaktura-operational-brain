import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const expected = process.env.APP_PASSWORD ?? "manufaktura";
  if (password !== expected) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set("brain_auth", expected, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
