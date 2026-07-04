import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { importFile, ImportResult } from "@/lib/import/importer";

export const runtime = "nodejs";

/**
 * POST /api/import
 *   multipart/form-data with one or more `files` entries → import uploads
 *   ?sample=1 → import the bundled /sample-data CSVs (one-click demo)
 */
export async function POST(request: NextRequest) {
  const results: ImportResult[] = [];

  if (request.nextUrl.searchParams.get("sample") === "1") {
    const dir = path.join(process.cwd(), "sample-data");
    // Load only the base sample set — files with a numeric batch suffix
    // (e.g. sales_pos_export_2.csv) are reserved for demonstrating incremental
    // uploads manually, and their data does not continue the base "stories".
    const baseFiles = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".csv") && !/_\d+\.csv$/i.test(f));
    for (const f of baseFiles) {
      results.push(importFile(f, fs.readFileSync(path.join(dir, f))));
    }
    return NextResponse.json({ results });
  }

  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    results.push(importFile(file.name, buffer));
  }
  return NextResponse.json({ results });
}
