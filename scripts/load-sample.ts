/**
 * Loads the bundled /sample-data CSVs through the real import pipeline and
 * prints anomaly results per location — used to verify normalization and
 * anomaly detection against the stories described in sample-data/README.md.
 * Run: npx tsx scripts/load-sample.ts
 */
import fs from "fs";
import path from "path";
import { importFile } from "@/lib/import/importer";
import { getAnomalies, getLocationStatus } from "@/lib/anomalies/run";
import { getLocations } from "@/lib/db";

const dir = path.join(process.cwd(), "sample-data");
// Base files only (mirrors the "Load sample data" button) — batch-suffixed
// files like *_2.csv are independent data and would break the base stories.
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".csv") && !/_\d+\.csv$/i.test(f))) {
  const result = importFile(f, fs.readFileSync(path.join(dir, f)));
  console.log(`${f}: source=${result.source} imported=${result.imported} skipped=${result.skipped}${result.error ? " ERROR=" + result.error : ""}`);
}

console.log("\n--- Location status & anomalies ---");
for (const loc of getLocations()) {
  console.log(`\n${loc.name}: ${getLocationStatus(loc.id).toUpperCase()}`);
  for (const a of getAnomalies(loc.id)) {
    const tags = [a.is_one_off ? "one-off" : "", a.is_resolved ? "resolved" : ""].filter(Boolean).join(",");
    console.log(`  [${a.severity}${tags ? " " + tags : ""}] ${a.rule_key} (${a.detected_for_date}): ${a.description}`);
  }
}
