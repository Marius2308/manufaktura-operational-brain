import { getDb, getLocations } from "@/lib/db";
import { getAnomalies, getLocationStatus, AnomalyRow } from "@/lib/anomalies/run";

/** Read-model queries backing the dashboard pages. */

export interface OverviewLocation {
  id: number;
  name: string;
  status: "red" | "yellow" | "green";
  salesSeries: { date: string; net_sales: number }[];
  last7Avg: number | null;
  changePct: number | null;
  latestChecklist: number | null;
  recentRating: number | null;
  openActions: number;
  activeAnomalies: number;
  hasData: boolean;
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function getOverview(): OverviewLocation[] {
  const db = getDb();
  return getLocations().map((loc) => {
    const sales = db
      .prepare("SELECT date, net_sales FROM daily_sales WHERE location_id = ? ORDER BY date")
      .all(loc.id) as { date: string; net_sales: number }[];
    const last7 = avg(sales.slice(-7).map((s) => s.net_sales));
    const prior7 = avg(sales.slice(-14, -7).map((s) => s.net_sales));
    const checklist = db
      .prepare("SELECT score_pct FROM checklist_scores WHERE location_id = ? ORDER BY date DESC LIMIT 1")
      .get(loc.id) as { score_pct: number } | undefined;
    const rating = db
      .prepare("SELECT AVG(rating) AS r FROM reviews WHERE location_id = ? AND date >= (SELECT date(MAX(date), '-9 days') FROM reviews)")
      .get(loc.id) as { r: number | null };
    const openActions = db
      .prepare("SELECT COUNT(*) AS c FROM action_items WHERE location_id = ? AND status != 'done'")
      .get(loc.id) as { c: number };
    const anomalies = getAnomalies(loc.id).filter((a) => !a.is_one_off && !a.is_resolved && a.severity !== "info");
    return {
      id: loc.id,
      name: loc.name,
      status: getLocationStatus(loc.id),
      salesSeries: sales,
      last7Avg: last7 !== null ? round1(last7) : null,
      changePct: last7 !== null && prior7 ? round1(((last7 - prior7) / prior7) * 100) : null,
      latestChecklist: checklist?.score_pct ?? null,
      recentRating: rating.r !== null ? round1(rating.r) : null,
      openActions: openActions.c,
      activeAnomalies: anomalies.length,
      hasData: sales.length > 0,
    };
  });
}

export interface LocationDetail {
  id: number;
  name: string;
  status: "red" | "yellow" | "green";
  sales: { date: string; net_sales: number }[];
  labor: { week: string; laborPct: number | null; scheduled: number | null; actual: number | null }[];
  checklist: { date: string; score_pct: number }[];
  reviews: { date: string; platform: string | null; rating: number; text: string | null }[];
  notes: { date: string; author: string | null; note: string }[];
  anomalies: AnomalyRow[];
}

export function getLocationDetail(locationId: number): LocationDetail | null {
  const db = getDb();
  const loc = db.prepare("SELECT id, name FROM locations WHERE id = ?").get(locationId) as
    | { id: number; name: string }
    | undefined;
  if (!loc) return null;

  const sales = db
    .prepare("SELECT date, net_sales FROM daily_sales WHERE location_id = ? ORDER BY date")
    .all(locationId) as { date: string; net_sales: number }[];
  const salesByDate = new Map(sales.map((s) => [s.date, s.net_sales]));
  const payroll = db
    .prepare("SELECT week_ending, scheduled_hours, actual_hours, labor_cost FROM payroll_weeks WHERE location_id = ? ORDER BY week_ending")
    .all(locationId) as { week_ending: string; scheduled_hours: number | null; actual_hours: number | null; labor_cost: number }[];
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
      scheduled: w.scheduled_hours,
      actual: w.actual_hours,
    };
  });

  return {
    id: loc.id,
    name: loc.name,
    status: getLocationStatus(locationId),
    sales,
    labor,
    checklist: db
      .prepare("SELECT date, score_pct FROM checklist_scores WHERE location_id = ? ORDER BY date")
      .all(locationId) as LocationDetail["checklist"],
    reviews: db
      .prepare("SELECT date, platform, rating, text FROM reviews WHERE location_id = ? ORDER BY date DESC")
      .all(locationId) as LocationDetail["reviews"],
    notes: db
      .prepare("SELECT date, author, note FROM manager_notes WHERE location_id = ? ORDER BY date DESC")
      .all(locationId) as LocationDetail["notes"],
    anomalies: getAnomalies(locationId),
  };
}

export interface ActionRow {
  id: number;
  location_id: number;
  location_name: string;
  briefing_id: number | null;
  title: string;
  detail: string | null;
  owner: string | null;
  deadline: string | null;
  status: string;
  followup_note: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export function getActions(locationId?: number): ActionRow[] {
  const db = getDb();
  const base = `SELECT a.*, l.name AS location_name FROM action_items a JOIN locations l ON l.id = a.location_id`;
  return (
    locationId
      ? db.prepare(`${base} WHERE a.location_id = ? ORDER BY a.status, a.deadline IS NULL, a.deadline`).all(locationId)
      : db.prepare(`${base} ORDER BY a.status, a.deadline IS NULL, a.deadline`).all()
  ) as ActionRow[];
}

export interface UploadRow {
  id: number;
  filename: string;
  detected_source: string;
  rows_imported: number;
  rows_skipped: number;
  uploaded_at: string;
}

export function getUploads(): UploadRow[] {
  return getDb().prepare("SELECT * FROM uploads ORDER BY id DESC LIMIT 30").all() as UploadRow[];
}
