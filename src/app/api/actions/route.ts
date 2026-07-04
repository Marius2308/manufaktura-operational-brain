import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getActions } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get("locationId");
  return NextResponse.json({ actions: getActions(locationId ? Number(locationId) : undefined) });
}

/** Create an action item (manual, or pushed from an AI briefing recommendation). */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { location_id, briefing_id, title, detail, owner, deadline, source } = body;
  if (!location_id || !title) {
    return NextResponse.json({ error: "location_id and title are required" }, { status: 400 });
  }
  const result = getDb()
    .prepare(
      `INSERT INTO action_items (location_id, briefing_id, title, detail, owner, deadline, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(location_id, briefing_id ?? null, title, detail ?? null, owner ?? null, deadline ?? null, source === "ai" ? "ai" : "manual");
  return NextResponse.json({ id: Number(result.lastInsertRowid) });
}
