import { getDb, getLocations } from "@/lib/db";
import {
  Anomaly, SalesDay, PayrollWeek, ChecklistDay, ReviewRow,
  salesTrendRule, oneOffDipRule, laborPctRule, overtimeRule,
  checklistRule, reviewsRule, rollUpStatus, shiftDate,
} from "./rules";

/**
 * Runs all anomaly rules for every location and rewrites the anomalies
 * table. Detection is deterministic and cheap, so recomputing from scratch
 * after each import is simpler and safer than incremental updates.
 */
export function runAnomalyDetection(): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO anomalies (location_id, rule_key, severity, detected_for_date, description, metric_value, baseline_value, is_one_off, is_resolved)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const rewrite = db.transaction(() => {
    db.prepare("DELETE FROM anomalies").run();
    for (const loc of getLocations()) {
      for (const a of detectForLocation(loc.id)) {
        insert.run(
          loc.id, a.ruleKey, a.severity, a.detectedForDate, a.description,
          a.metricValue, a.baselineValue, a.isOneOff ? 1 : 0, a.isResolved ? 1 : 0
        );
      }
    }
  });
  rewrite();
}

export function detectForLocation(locationId: number): Anomaly[] {
  const db = getDb();
  const sales = db
    .prepare("SELECT date, net_sales FROM daily_sales WHERE location_id = ? ORDER BY date")
    .all(locationId) as SalesDay[];
  const payroll = db
    .prepare("SELECT week_ending, scheduled_hours, actual_hours, labor_cost FROM payroll_weeks WHERE location_id = ? ORDER BY week_ending")
    .all(locationId) as PayrollWeek[];
  const checklist = db
    .prepare("SELECT date, score_pct FROM checklist_scores WHERE location_id = ? ORDER BY date")
    .all(locationId) as ChecklistDay[];
  const reviews = db
    .prepare("SELECT date, rating FROM reviews WHERE location_id = ? ORDER BY date")
    .all(locationId) as ReviewRow[];

  // Sales total for the 7 days ending on each payroll week_ending,
  // used to compute labor cost as a % of that week's sales.
  // Payroll weeks can extend past the last day of sales data (e.g. the week
  // ending Jul 5 when sales end Jul 2). Comparing a full week's labor cost
  // against a partial week's sales would inflate the percentage, so we
  // extrapolate weekly sales from the days actually present, and skip weeks
  // with fewer than 4 days of sales data entirely.
  const salesByDate = new Map(sales.map((s) => [s.date, s.net_sales]));
  const weekSales = new Map<string, number>();
  for (const w of payroll) {
    let total = 0;
    let daysPresent = 0;
    for (let i = 0; i < 7; i++) {
      const v = salesByDate.get(shiftDate(w.week_ending, -i));
      if (v !== undefined) {
        total += v;
        daysPresent++;
      }
    }
    if (daysPresent >= 4) weekSales.set(w.week_ending, (total * 7) / daysPresent);
  }

  const latestDate =
    [sales.at(-1)?.date, reviews.at(-1)?.date, checklist.at(-1)?.date]
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? new Date().toISOString().slice(0, 10);

  const anomalies: Anomaly[] = [];
  const trend = salesTrendRule(sales);
  if (trend) anomalies.push(trend);
  anomalies.push(...oneOffDipRule(sales));
  anomalies.push(...laborPctRule(payroll, weekSales));
  anomalies.push(...overtimeRule(payroll));
  anomalies.push(...checklistRule(checklist));
  anomalies.push(...reviewsRule(reviews, latestDate));
  return anomalies;
}

export interface AnomalyRow {
  id: number;
  location_id: number;
  rule_key: string;
  severity: string;
  detected_for_date: string;
  description: string;
  metric_value: number | null;
  baseline_value: number | null;
  is_one_off: number;
  is_resolved: number;
}

export function getAnomalies(locationId?: number): AnomalyRow[] {
  const db = getDb();
  return (
    locationId
      ? db.prepare("SELECT * FROM anomalies WHERE location_id = ? ORDER BY detected_for_date DESC").all(locationId)
      : db.prepare("SELECT * FROM anomalies ORDER BY location_id, detected_for_date DESC").all()
  ) as AnomalyRow[];
}

export function getLocationStatus(locationId: number): "red" | "yellow" | "green" {
  const rows = getAnomalies(locationId);
  return rollUpStatus(
    rows.map((r) => ({
      ruleKey: r.rule_key,
      severity: r.severity as Anomaly["severity"],
      detectedForDate: r.detected_for_date,
      description: r.description,
      metricValue: r.metric_value,
      baselineValue: r.baseline_value,
      isOneOff: !!r.is_one_off,
      isResolved: !!r.is_resolved,
    }))
  );
}
