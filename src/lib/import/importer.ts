import Papa from "papaparse";
import * as XLSX from "xlsx";
import { getDb } from "@/lib/db";
import { resolveLocation, parseDate, parseNumber, DateFormat } from "./normalize";
import { runAnomalyDetection } from "@/lib/anomalies/run";

/**
 * Import pipeline: file → rows → source detection → normalization → upsert.
 *
 * Source type is detected from the header signature, so files can be uploaded
 * in any order and with any filename. Each source declares its expected date
 * format (real exports are consistent per system, even if inconsistent
 * across systems).
 */

export type SourceType = "sales" | "payroll" | "checklist" | "reviews" | "notes";

interface SourceSpec {
  type: SourceType;
  label: string;
  // headers that must all be present (case-insensitive) to match this source
  signature: string[];
  dateFormat: DateFormat;
  locationField: string;
  dateField: string;
}

const SOURCES: SourceSpec[] = [
  {
    type: "sales",
    label: "Sales / POS export",
    signature: ["location", "date", "net_sales_ron"],
    dateFormat: "DD.MM.YYYY",
    locationField: "location",
    dateField: "date",
  },
  {
    type: "payroll",
    label: "Payroll / FTE export",
    signature: ["store", "week_ending", "labor_cost_ron"],
    dateFormat: "MM/DD/YYYY",
    locationField: "store",
    dateField: "week_ending",
  },
  {
    type: "checklist",
    label: "JOLT checklist export",
    signature: ["site", "audit_date", "score_percent"],
    dateFormat: "YYYY-MM-DD",
    locationField: "site",
    dateField: "audit_date",
  },
  {
    type: "reviews",
    label: "Guest reviews export",
    signature: ["location", "review_date", "rating"],
    dateFormat: "D Mon YYYY",
    locationField: "location",
    dateField: "review_date",
  },
  {
    type: "notes",
    label: "Manager notes",
    signature: ["location", "note_date", "note"],
    dateFormat: "DD/MM/YYYY",
    locationField: "location",
    dateField: "note_date",
  },
];

type Row = Record<string, string>;

/** Parse CSV or Excel into an array of objects with lowercased header keys. */
export function fileToRows(filename: string, buffer: Buffer): Row[] {
  let rows: Row[];
  if (/\.xlsx?$/i.test(filename)) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<Row>(sheet, { raw: false, defval: "" });
  } else {
    const parsed = Papa.parse<Row>(buffer.toString("utf8"), {
      header: true,
      skipEmptyLines: true,
    });
    rows = parsed.data;
  }
  // normalize header keys to lowercase for signature matching
  return rows.map((r) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(r)) out[k.trim().toLowerCase()] = typeof v === "string" ? v : String(v ?? "");
    return out;
  });
}

export function detectSource(rows: Row[]): SourceSpec | null {
  if (rows.length === 0) return null;
  const headers = Object.keys(rows[0]);
  return SOURCES.find((s) => s.signature.every((h) => headers.includes(h))) ?? null;
}

export interface ImportResult {
  filename: string;
  source: string | null;
  sourceType: SourceType | null;
  imported: number;   // rows written or already present that are attributable to this file
  added: number;      // brand-new rows
  updated: number;    // existing rows overwritten with new values (sales / payroll / checklist)
  unchanged: number;  // duplicate rows already on file, ignored (reviews / notes)
  skipped: number;    // rows that couldn't be read (unknown location, bad date, missing value)
  dateFrom: string | null;
  dateTo: string | null;
  uploadId: number | null;
  error?: string;
}

export function importFile(filename: string, buffer: Buffer): ImportResult {
  const empty: ImportResult = {
    filename, source: null, sourceType: null, imported: 0, added: 0, updated: 0,
    unchanged: 0, skipped: 0, dateFrom: null, dateTo: null, uploadId: null,
  };

  const rows = fileToRows(filename, buffer);
  const spec = detectSource(rows);
  if (!spec) {
    return { ...empty, skipped: rows.length, error: "Unrecognized file format — its column headers don't match any known export (sales, payroll, checklist, reviews, or manager notes)." };
  }

  const db = getDb();
  const uploadId = Number(
    db.prepare("INSERT INTO uploads (filename, detected_source) VALUES (?, ?)").run(filename, spec.type).lastInsertRowid
  );

  let added = 0, updated = 0, unchanged = 0, skipped = 0;
  let dateFrom: string | null = null, dateTo: string | null = null;
  const trackDate = (d: string) => {
    if (!dateFrom || d < dateFrom) dateFrom = d;
    if (!dateTo || d > dateTo) dateTo = d;
  };

  // Existing natural keys for this source, so each row can be classified as
  // brand-new vs. an overwrite of / duplicate of something already imported.
  const existing = loadExistingKeys(spec.type);

  const statements = {
    sales: db.prepare(
      `INSERT INTO daily_sales (location_id, date, net_sales, transactions, avg_check, upload_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(location_id, date) DO UPDATE SET
         net_sales = excluded.net_sales, transactions = excluded.transactions,
         avg_check = excluded.avg_check, upload_id = excluded.upload_id`
    ),
    payroll: db.prepare(
      `INSERT INTO payroll_weeks (location_id, week_ending, scheduled_hours, actual_hours, labor_cost, fte_count, upload_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(location_id, week_ending) DO UPDATE SET
         scheduled_hours = excluded.scheduled_hours, actual_hours = excluded.actual_hours,
         labor_cost = excluded.labor_cost, fte_count = excluded.fte_count, upload_id = excluded.upload_id`
    ),
    checklist: db.prepare(
      `INSERT INTO checklist_scores (location_id, date, checklist_name, score_pct, items_failed, upload_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(location_id, date, checklist_name) DO UPDATE SET
         score_pct = excluded.score_pct, items_failed = excluded.items_failed, upload_id = excluded.upload_id`
    ),
    // Reviews and notes accumulate: a matching row already on file is ignored
    // (idempotent re-import), a new one is added. No wipe-and-replace.
    reviews: db.prepare(
      `INSERT INTO reviews (location_id, date, platform, rating, text, upload_id)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`
    ),
    notes: db.prepare(
      `INSERT INTO manager_notes (location_id, date, author, note, upload_id)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`
    ),
  };

  const importAll = db.transaction(() => {
    for (const row of rows) {
      const locationId = resolveLocation(row[spec.locationField]);
      const date = parseDate(row[spec.dateField], spec.dateFormat);
      if (!locationId || !date) { skipped++; continue; }
      try {
        switch (spec.type) {
          case "sales": {
            const net = parseNumber(row["net_sales_ron"]);
            if (net === null) { skipped++; continue; }
            const key = `${locationId}|${date}`;
            statements.sales.run(locationId, date, net, parseNumber(row["transactions"]), parseNumber(row["avg_check_ron"]), uploadId);
            if (seenBefore(existing, key)) updated++; else added++;
            trackDate(date);
            break;
          }
          case "payroll": {
            const cost = parseNumber(row["labor_cost_ron"]);
            if (cost === null) { skipped++; continue; }
            const key = `${locationId}|${date}`;
            statements.payroll.run(locationId, date, parseNumber(row["scheduled_hours"]), parseNumber(row["actual_hours"]), cost, parseNumber(row["fte_count"]), uploadId);
            if (seenBefore(existing, key)) updated++; else added++;
            trackDate(date);
            break;
          }
          case "checklist": {
            const score = parseNumber(row["score_percent"]);
            if (score === null) { skipped++; continue; }
            const name = row["checklist_name"] || "Checklist";
            const key = `${locationId}|${date}|${name}`;
            statements.checklist.run(locationId, date, name, score, parseNumber(row["items_failed"]), uploadId);
            if (seenBefore(existing, key)) updated++; else added++;
            trackDate(date);
            break;
          }
          case "reviews": {
            const rating = parseNumber(row["rating"]);
            if (rating === null) { skipped++; continue; }
            const platform = row["platform"] || "";
            const text = row["review_text"] || "";
            const key = `${locationId}|${date}|${platform}|${rating}|${text}`;
            statements.reviews.run(locationId, date, platform, rating, text, uploadId);
            if (seenBefore(existing, key)) unchanged++; else { added++; trackDate(date); }
            break;
          }
          case "notes": {
            if (!row["note"]) { skipped++; continue; }
            const author = row["author"] || "";
            const key = `${locationId}|${date}|${author}|${row["note"]}`;
            statements.notes.run(locationId, date, author, row["note"], uploadId);
            if (seenBefore(existing, key)) unchanged++; else { added++; trackDate(date); }
            break;
          }
        }
      } catch {
        skipped++;
      }
    }
    // A file that added, overwrote, or skipped nothing (e.g. re-clicking
    // "Load sample data" when reviews/notes are already all on file) has
    // nothing to audit — drop the speculative upload row rather than
    // littering history with no-op records.
    if (added + updated + skipped === 0) {
      db.prepare("DELETE FROM uploads WHERE id = ?").run(uploadId);
    } else {
      db.prepare("UPDATE uploads SET rows_imported = ?, rows_skipped = ? WHERE id = ?").run(added + updated, skipped, uploadId);
    }
  });
  importAll();

  // Re-run anomaly detection after every import (cheap, rule-based).
  runAnomalyDetection();

  const isNoOp = added + updated + skipped === 0;
  return {
    filename, source: spec.label, sourceType: spec.type,
    imported: added + updated, added, updated, unchanged, skipped, dateFrom, dateTo,
    uploadId: isNoOp ? null : uploadId,
  };
}

/**
 * Was this key already on file (before this import)? Returns true if so.
 * Either way the key is now marked seen, so duplicate rows within the same
 * file are also recognized. For sales/payroll/checklist a "true" means the
 * row overwrote an existing one; for reviews/notes it means an ignored
 * duplicate.
 */
function seenBefore(existing: Set<string>, key: string): boolean {
  if (existing.has(key)) return true;
  existing.add(key);
  return false;
}

/**
 * Whether an upload can be safely undone: only the most recent upload of its
 * detected_source qualifies. An older one may have had some of its rows
 * overwritten by a later import of the same type (sales/payroll/checklist
 * upserts reassign upload_id on conflict), so undoing it would silently only
 * remove the rows it still owns rather than fully reverting — a partial,
 * misleading undo. Reviews/notes never reassign upload_id, but the same
 * most-recent-only rule is applied uniformly rather than special-cased.
 */
export function isUploadUndoable(uploadId: number): boolean {
  const db = getDb();
  const upload = db.prepare("SELECT id, detected_source FROM uploads WHERE id = ?").get(uploadId) as
    | { id: number; detected_source: string }
    | undefined;
  if (!upload) return false;
  const latest = db
    .prepare("SELECT id FROM uploads WHERE detected_source = ? ORDER BY id DESC LIMIT 1")
    .get(upload.detected_source) as { id: number } | undefined;
  return latest?.id === upload.id;
}

/**
 * Undo an import: remove every row attributable to it, then re-run anomaly
 * detection. Refuses to run on anything but the most recent upload of its
 * source type — see isUploadUndoable().
 */
export function deleteUpload(uploadId: number): { removed: number } | { error: string } | null {
  const db = getDb();
  const upload = db.prepare("SELECT id, filename, detected_source FROM uploads WHERE id = ?").get(uploadId) as
    | { id: number; filename: string; detected_source: string }
    | undefined;
  if (!upload) return null;
  if (!isUploadUndoable(uploadId)) {
    return {
      error: `Can't undo "${upload.filename}" — a later ${upload.detected_source} import may have overwritten some of its rows. Only the most recent ${upload.detected_source} import can be undone.`,
    };
  }
  const tables = ["daily_sales", "payroll_weeks", "checklist_scores", "reviews", "manager_notes"];
  let removed = 0;
  const tx = db.transaction(() => {
    for (const t of tables) {
      removed += db.prepare(`DELETE FROM ${t} WHERE upload_id = ?`).run(uploadId).changes;
    }
    db.prepare("DELETE FROM uploads WHERE id = ?").run(uploadId);
  });
  tx();
  runAnomalyDetection();
  return { removed };
}

function loadExistingKeys(source: SourceType): Set<string> {
  const db = getDb();
  const set = new Set<string>();
  switch (source) {
    case "sales":
      for (const r of db.prepare("SELECT location_id, date FROM daily_sales").all() as { location_id: number; date: string }[])
        set.add(`${r.location_id}|${r.date}`);
      break;
    case "payroll":
      for (const r of db.prepare("SELECT location_id, week_ending FROM payroll_weeks").all() as { location_id: number; week_ending: string }[])
        set.add(`${r.location_id}|${r.week_ending}`);
      break;
    case "checklist":
      for (const r of db.prepare("SELECT location_id, date, checklist_name FROM checklist_scores").all() as { location_id: number; date: string; checklist_name: string }[])
        set.add(`${r.location_id}|${r.date}|${r.checklist_name}`);
      break;
    case "reviews":
      for (const r of db.prepare("SELECT location_id, date, platform, rating, text FROM reviews").all() as { location_id: number; date: string; platform: string; rating: number; text: string }[])
        set.add(`${r.location_id}|${r.date}|${r.platform}|${r.rating}|${r.text}`);
      break;
    case "notes":
      for (const r of db.prepare("SELECT location_id, date, author, note FROM manager_notes").all() as { location_id: number; date: string; author: string; note: string }[])
        set.add(`${r.location_id}|${r.date}|${r.author}|${r.note}`);
      break;
  }
  return set;
}
