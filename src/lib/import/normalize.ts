import { getDb } from "@/lib/db";

/**
 * Normalization layer.
 *
 * Each source system names locations and formats dates differently:
 *   sales:    "MANUFAKTURA VITAN"    + DD.MM.YYYY
 *   payroll:  "Vitan"                + MM/DD/YYYY
 *   jolt:     "Manufaktura - Vitan"  + YYYY-MM-DD
 *   reviews:  "MNK Vitan"            + D Mon YYYY
 *   notes:    "Vitan"                + DD/MM/YYYY
 *
 * Location resolution: lowercase, strip known brand prefixes and separators,
 * then look up the remainder in location_aliases. Unresolvable rows are
 * skipped (and counted) rather than guessed at.
 */

const BRAND_PREFIXES = /^(manufaktura|mnk)[\s\-–:]*/i;

export function resolveLocation(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(BRAND_PREFIXES, "").trim().toLowerCase();
  if (!cleaned) return null;
  const row = getDb()
    .prepare("SELECT location_id FROM location_aliases WHERE alias = ?")
    .get(cleaned) as { location_id: number } | undefined;
  return row?.location_id ?? null;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

export type DateFormat = "DD.MM.YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD" | "D Mon YYYY" | "DD/MM/YYYY";

/**
 * Parse a date string in the given source format to ISO yyyy-mm-dd.
 * Returns null (row skipped) when the value doesn't match the expected shape —
 * we prefer skipping a row over silently mis-reading day/month order.
 */
export function parseDate(raw: string, format: DateFormat): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m: RegExpMatchArray | null;
  switch (format) {
    case "YYYY-MM-DD":
      m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
    case "DD.MM.YYYY":
      m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
    case "DD/MM/YYYY":
      m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
    case "MM/DD/YYYY":
      m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
    case "D Mon YYYY": {
      m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
      if (!m) return null;
      const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
      return month ? `${m[3]}-${month}-${m[1].padStart(2, "0")}` : null;
    }
  }
}

export function parseNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
