import { NextRequest, NextResponse } from "next/server";
import { generateBriefing } from "@/lib/briefing/generate";

export const runtime = "nodejs";

/** POST /api/briefings/generate?locationId=N — (re)generate the daily briefing. */
export async function POST(request: NextRequest) {
  const locationId = Number(request.nextUrl.searchParams.get("locationId"));
  if (!locationId) {
    return NextResponse.json({ error: "locationId required" }, { status: 400 });
  }
  const briefing = await generateBriefing(locationId);
  return NextResponse.json(briefing);
}
