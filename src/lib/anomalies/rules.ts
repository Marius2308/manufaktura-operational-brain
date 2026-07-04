/**
 * Anomaly detection rules — deliberately simple, explainable, and auditable.
 * No ML anywhere. Each rule is a plain function over the location's data,
 * with its logic and thresholds documented right here so a non-technical
 * reader can follow the reasoning.
 *
 * Thresholds are starting assumptions (documented in PLAN.md/README) and are
 * meant to be tuned with the client once real data flows in.
 */

export type Severity = "red" | "yellow" | "info";

export interface Anomaly {
  ruleKey: string;
  severity: Severity;
  detectedForDate: string;
  description: string;
  metricValue: number | null;
  baselineValue: number | null;
  isOneOff?: boolean;   // isolated, explained single event — not an ongoing risk
  isResolved?: boolean; // was a problem earlier in the period but has since normalized
}

export interface SalesDay { date: string; net_sales: number }
export interface PayrollWeek { week_ending: string; scheduled_hours: number | null; actual_hours: number | null; labor_cost: number }
export interface ChecklistDay { date: string; score_pct: number }
export interface ReviewRow { date: string; rating: number }

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * RULE 1 — Sales trend.
 * Compare the average of the most recent 7 days of sales with the 7 days
 * before that. A drop of more than 15% is a warning (yellow); more than 25%
 * is critical (red). Week-over-week comparison cancels out day-of-week
 * seasonality (weekends vs weekdays).
 */
export function salesTrendRule(sales: SalesDay[]): Anomaly | null {
  if (sales.length < 14) return null;
  const sorted = [...sales].sort((a, b) => a.date.localeCompare(b.date));
  const last7 = avg(sorted.slice(-7).map((d) => d.net_sales));
  const prior7 = avg(sorted.slice(-14, -7).map((d) => d.net_sales));
  if (prior7 === 0) return null;
  const changePct = ((last7 - prior7) / prior7) * 100;
  if (changePct < -15) {
    return {
      ruleKey: "sales_trend",
      severity: changePct < -25 ? "red" : "yellow",
      detectedForDate: sorted[sorted.length - 1].date,
      description: `Sales down ${round1(Math.abs(changePct))}% vs. previous week (7-day avg ${round1(last7)} RON vs ${round1(prior7)} RON).`,
      metricValue: round1(last7),
      baselineValue: round1(prior7),
    };
  }
  return null;
}

/**
 * RULE 2 — One-off sales dip.
 * A single day more than 40% below the trailing 14-day average, while the
 * weekly trend (Rule 1) is otherwise stable, is flagged as informational
 * only ("one-off"). This catches things like a storm closing the terrace —
 * real, worth knowing, but not an ongoing risk. One-off anomalies never
 * affect the location's red/yellow/green status.
 */
export function oneOffDipRule(sales: SalesDay[]): Anomaly[] {
  if (sales.length < 15) return [];
  const sorted = [...sales].sort((a, b) => a.date.localeCompare(b.date));
  const trendAnomaly = salesTrendRule(sales);
  if (trendAnomaly) return []; // a declining location's bad days are part of the trend, not one-offs
  const out: Anomaly[] = [];
  for (let i = 14; i < sorted.length; i++) {
    const trailing = avg(sorted.slice(i - 14, i).map((d) => d.net_sales));
    const day = sorted[i];
    if (trailing > 0 && day.net_sales < trailing * 0.6) {
      out.push({
        ruleKey: "one_off_dip",
        severity: "info",
        detectedForDate: day.date,
        description: `Isolated one-day sales dip on ${day.date}: ${round1(day.net_sales)} RON vs ${round1(trailing)} RON 14-day average (−${round1((1 - day.net_sales / trailing) * 100)}%). Weekly trend is stable, so this is treated as a one-off event, not an ongoing risk.`,
        metricValue: round1(day.net_sales),
        baselineValue: round1(trailing),
        isOneOff: true,
      });
    }
  }
  return out;
}

/**
 * RULE 3 — Labor cost percentage.
 * Weekly labor cost divided by that week's sales. In this business,
 * >32% of sales is elevated (yellow) and >38% is critical (red).
 * Additionally, three or more consecutive rising weeks is flagged even if
 * still under the threshold — a steady creep is how problems hide. The creep
 * flag only fires once labor reaches at least 30% of sales: rising labor at
 * low absolute levels is usually deliberate (e.g. staffing up for growth),
 * not a hidden problem.
 */
export function laborPctRule(payroll: PayrollWeek[], weekSales: Map<string, number>): Anomaly[] {
  const sorted = [...payroll].sort((a, b) => a.week_ending.localeCompare(b.week_ending));
  const pcts = sorted
    .map((w) => {
      const sales = weekSales.get(w.week_ending);
      return sales && sales > 0 ? { week: w.week_ending, pct: (w.labor_cost / sales) * 100 } : null;
    })
    .filter((x): x is { week: string; pct: number } => x !== null);
  if (pcts.length === 0) return [];

  const out: Anomaly[] = [];
  const latest = pcts[pcts.length - 1];
  if (latest.pct > 32) {
    out.push({
      ruleKey: "labor_pct",
      severity: latest.pct > 38 ? "red" : "yellow",
      detectedForDate: latest.week,
      description: `Labor cost is ${round1(latest.pct)}% of sales for the week ending ${latest.week} (threshold: 32% warning / 38% critical).`,
      metricValue: round1(latest.pct),
      baselineValue: 32,
    });
  }
  // creep detection: 3+ consecutive increases ending at the latest week
  let rising = 0;
  for (let i = pcts.length - 1; i > 0 && pcts[i].pct > pcts[i - 1].pct; i--) rising++;
  if (rising >= 3 && latest.pct >= 30) {
    out.push({
      ruleKey: "labor_creep",
      severity: "yellow",
      detectedForDate: latest.week,
      description: `Labor cost % has risen ${rising} weeks in a row, from ${round1(pcts[pcts.length - 1 - rising].pct)}% to ${round1(latest.pct)}% of sales. A steady creep like this usually means overtime is covering a staffing gap.`,
      metricValue: round1(latest.pct),
      baselineValue: round1(pcts[pcts.length - 1 - rising].pct),
    });
  }
  return out;
}

/**
 * RULE 4 — Overtime.
 * Actual hours more than 5% above scheduled hours in a week means the team
 * is covering gaps with overtime. If the most recent week is back under the
 * threshold, earlier flags are marked "resolved" — still visible for
 * context, but not counted against the location's current status.
 */
export function overtimeRule(payroll: PayrollWeek[]): Anomaly[] {
  const sorted = [...payroll].sort((a, b) => a.week_ending.localeCompare(b.week_ending));
  const flagged = sorted.filter(
    (w) => w.scheduled_hours && w.actual_hours && w.actual_hours > w.scheduled_hours * 1.05
  );
  if (flagged.length === 0) return [];
  const latestWeek = sorted[sorted.length - 1];
  const latestIsOk = !flagged.includes(latestWeek);
  return flagged.map((w) => {
    const overPct = ((w.actual_hours! - w.scheduled_hours!) / w.scheduled_hours!) * 100;
    return {
      ruleKey: "overtime",
      severity: "yellow" as Severity,
      detectedForDate: w.week_ending,
      description: `Overtime in week ending ${w.week_ending}: ${round1(w.actual_hours!)} actual vs ${round1(w.scheduled_hours!)} scheduled hours (+${round1(overPct)}%).${latestIsOk ? " Latest week is back to normal — treated as resolved." : ""}`,
      metricValue: round1(w.actual_hours!),
      baselineValue: round1(w.scheduled_hours!),
      isResolved: latestIsOk,
    };
  });
}

/**
 * RULE 5 — Checklist / JOLT score.
 * The latest audit score below 85% is a warning; below 75% is critical.
 * Independently, a latest score more than 10 points below the location's
 * own 30-day average is a warning — a well-run store slipping fast matters
 * even if it's still above the absolute floor.
 */
export function checklistRule(scores: ChecklistDay[]): Anomaly[] {
  if (scores.length === 0) return [];
  const sorted = [...scores].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const periodAvg = avg(sorted.map((s) => s.score_pct));
  const out: Anomaly[] = [];
  if (latest.score_pct < 85) {
    out.push({
      ruleKey: "checklist_low",
      severity: latest.score_pct < 75 ? "red" : "yellow",
      detectedForDate: latest.date,
      description: `Latest checklist score is ${round1(latest.score_pct)}% (threshold: 85% warning / 75% critical).`,
      metricValue: round1(latest.score_pct),
      baselineValue: 85,
    });
  } else if (latest.score_pct < periodAvg - 10) {
    out.push({
      ruleKey: "checklist_drop",
      severity: "yellow",
      detectedForDate: latest.date,
      description: `Checklist score dropped to ${round1(latest.score_pct)}%, more than 10 points below this location's ${round1(periodAvg)}% average.`,
      metricValue: round1(latest.score_pct),
      baselineValue: round1(periodAvg),
    });
  }
  return out;
}

/**
 * RULE 6 — Guest review sentiment.
 * Average rating over the last 10 days of data below 3.5 is a warning;
 * below 3.0 is critical. Independently, 3 or more reviews of 2 stars or
 * less in that window is critical regardless of the average — a burst of
 * very unhappy guests is a stronger signal than a slightly lowered mean.
 */
export function reviewsRule(reviews: ReviewRow[], latestDate: string): Anomaly[] {
  if (reviews.length === 0) return [];
  const windowStart = shiftDate(latestDate, -9);
  const recent = reviews.filter((r) => r.date >= windowStart);
  if (recent.length === 0) return [];
  const mean = avg(recent.map((r) => r.rating));
  const badCount = recent.filter((r) => r.rating <= 2).length;
  const out: Anomaly[] = [];
  if (badCount >= 3) {
    out.push({
      ruleKey: "reviews_negative_spike",
      severity: "red",
      detectedForDate: latestDate,
      description: `${badCount} reviews of 2 stars or less in the last 10 days (avg rating ${round1(mean)} across ${recent.length} recent reviews).`,
      metricValue: badCount,
      baselineValue: 3,
    });
  } else if (mean < 3.5) {
    out.push({
      ruleKey: "reviews_low_avg",
      severity: mean < 3.0 ? "red" : "yellow",
      detectedForDate: latestDate,
      description: `Average guest rating over the last 10 days is ${round1(mean)} (${recent.length} reviews; threshold: 3.5 warning / 3.0 critical).`,
      metricValue: round1(mean),
      baselineValue: 3.5,
    });
  }
  return out;
}

/**
 * Status roll-up: a location's status is the worst severity among its
 * active anomalies — excluding one-offs and resolved anomalies, which are
 * informational context, not current risk.
 */
export function rollUpStatus(anomalies: Anomaly[]): "red" | "yellow" | "green" {
  const active = anomalies.filter((a) => !a.isOneOff && !a.isResolved && a.severity !== "info");
  if (active.some((a) => a.severity === "red")) return "red";
  if (active.some((a) => a.severity === "yellow")) return "yellow";
  return "green";
}

export function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
