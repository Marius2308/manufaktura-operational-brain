import { getDb } from "@/lib/db";
import { getAnomalies, getLocationStatus } from "@/lib/anomalies/run";

/**
 * Assembles everything the briefing generator (Claude or fallback) needs to
 * know about one location: metric summaries, active anomalies, recent
 * reviews, and manager notes. This is the single source of truth for
 * briefing inputs, so both generators see exactly the same data.
 */

export interface BriefingContext {
  locationName: string;
  asOfDate: string; // latest date present in the data
  status: "red" | "yellow" | "green";
  sales: {
    last7Avg: number | null;
    prior7Avg: number | null;
    changePct: number | null;
  };
  labor: { week: string; laborPct: number | null; overtimePct: number | null }[];
  checklist: { latestScore: number | null; latestDate: string | null; periodAvg: number | null };
  reviews: { date: string; platform: string | null; rating: number; text: string | null }[];
  notes: { date: string; author: string | null; note: string }[];
  anomalies: {
    rule: string;
    severity: string;
    date: string;
    description: string;
    oneOff: boolean;
    resolved: boolean;
  }[];
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function buildBriefingContext(locationId: number): BriefingContext {
  const db = getDb();
  const loc = db.prepare("SELECT name FROM locations WHERE id = ?").get(locationId) as { name: string };

  const sales = db
    .prepare("SELECT date, net_sales FROM daily_sales WHERE location_id = ? ORDER BY date")
    .all(locationId) as { date: string; net_sales: number }[];
  const asOfDate = sales.at(-1)?.date ?? new Date().toISOString().slice(0, 10);

  const last7 = avg(sales.slice(-7).map((s) => s.net_sales));
  const prior7 = avg(sales.slice(-14, -7).map((s) => s.net_sales));
  const changePct = last7 !== null && prior7 ? round1(((last7 - prior7) / prior7) * 100) : null;

  const payroll = db
    .prepare("SELECT week_ending, scheduled_hours, actual_hours, labor_cost FROM payroll_weeks WHERE location_id = ? ORDER BY week_ending")
    .all(locationId) as { week_ending: string; scheduled_hours: number | null; actual_hours: number | null; labor_cost: number }[];
  const salesByDate = new Map(sales.map((s) => [s.date, s.net_sales]));
  const labor = payroll.map((w) => {
    let total = 0, days = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(w.week_ending + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - i);
      const v = salesByDate.get(d.toISOString().slice(0, 10));
      if (v !== undefined) { total += v; days++; }
    }
    const weekly = days >= 4 ? (total * 7) / days : null;
    return {
      week: w.week_ending,
      laborPct: weekly ? round1((w.labor_cost / weekly) * 100) : null,
      overtimePct:
        w.scheduled_hours && w.actual_hours
          ? round1(((w.actual_hours - w.scheduled_hours) / w.scheduled_hours) * 100)
          : null,
    };
  });

  const checklist = db
    .prepare("SELECT date, score_pct FROM checklist_scores WHERE location_id = ? ORDER BY date")
    .all(locationId) as { date: string; score_pct: number }[];

  const reviews = db
    .prepare("SELECT date, platform, rating, text FROM reviews WHERE location_id = ? ORDER BY date DESC LIMIT 10")
    .all(locationId) as BriefingContext["reviews"];

  const notes = db
    .prepare("SELECT date, author, note FROM manager_notes WHERE location_id = ? ORDER BY date DESC")
    .all(locationId) as BriefingContext["notes"];

  return {
    locationName: loc.name,
    asOfDate,
    status: getLocationStatus(locationId),
    sales: {
      last7Avg: last7 !== null ? round1(last7) : null,
      prior7Avg: prior7 !== null ? round1(prior7) : null,
      changePct,
    },
    labor,
    checklist: {
      latestScore: checklist.at(-1)?.score_pct ?? null,
      latestDate: checklist.at(-1)?.date ?? null,
      periodAvg: avg(checklist.map((c) => c.score_pct)) !== null ? round1(avg(checklist.map((c) => c.score_pct))!) : null,
    },
    reviews,
    notes,
    anomalies: getAnomalies(locationId).map((a) => ({
      rule: a.rule_key,
      severity: a.severity,
      date: a.detected_for_date,
      description: a.description,
      oneOff: !!a.is_one_off,
      resolved: !!a.is_resolved,
    })),
  };
}
