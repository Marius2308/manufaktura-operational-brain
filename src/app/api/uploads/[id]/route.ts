import { NextRequest, NextResponse } from "next/server";
import { deleteUpload } from "@/lib/import/importer";

export const runtime = "nodejs";

/** DELETE /api/uploads/:id — undo an import (remove its rows + re-run detection). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = deleteUpload(Number(id));
  if (!result) return NextResponse.json({ error: "Import not found" }, { status: 404 });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json(result);
}
