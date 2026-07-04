import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const EDITABLE = ["title", "detail", "owner", "deadline", "status", "followup_note"] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const field of EDITABLE) {
    if (field in body) {
      sets.push(`${field} = ?`);
      values.push(body[field] === "" ? null : body[field]);
    }
  }
  if (sets.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  sets.push("updated_at = datetime('now')");
  const result = getDb()
    .prepare(`UPDATE action_items SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values, Number(id));
  if (result.changes === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  getDb().prepare("DELETE FROM action_items WHERE id = ?").run(Number(id));
  return NextResponse.json({ ok: true });
}
