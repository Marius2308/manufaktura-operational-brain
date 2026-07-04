import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getActions } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get("locationId");
  return NextResponse.json({ actions: getActions(locationId ? Number(locationId) : undefined) });
}

/**
 * Create an action item (manual, or pushed from an AI briefing recommendation).
 * Recommendations are re-derived from the same underlying signals on every
 * "Regenerate", so the same title can be tracked more than once per location
 * (e.g. regenerate briefing, then "+ Track" the same recommendation again).
 * If an open (not-done) item with the same location + title already exists,
 * return it instead of inserting a duplicate.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { location_id, briefing_id, title, detail, owner, deadline, source } = body;
  if (!location_id || !title) {
    return NextResponse.json({ error: "location_id and title are required" }, { status: 400 });
  }
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id FROM action_items WHERE location_id = ? AND title = ? AND status != 'done'
       ORDER BY id DESC LIMIT 1`
    )
    .get(location_id, title) as { id: number } | undefined;
  if (existing) {
    return NextResponse.json({ id: existing.id, duplicate: true });
  }
  const result = db
    .prepare(
      `INSERT INTO action_items (location_id, briefing_id, title, detail, owner, deadline, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(location_id, briefing_id ?? null, title, detail ?? null, owner ?? null, deadline ?? null, source === "ai" ? "ai" : "manual");
  return NextResponse.json({ id: Number(result.lastInsertRowid) });
}
