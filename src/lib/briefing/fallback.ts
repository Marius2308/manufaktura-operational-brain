import { BriefingContext } from "./context";
import { Briefing, RecommendedAction } from "./schema";

/**
 * Rule-based briefing generator — used when no Claude API key is configured
 * (or the API call fails), so the whole system stays demoable offline.
 * It assembles the same structured Briefing shape from the detected
 * anomalies and manager notes. Deterministic and fully explainable; the UI
 * labels its output "rule-based briefing".
 */
export function generateFallbackBriefing(ctx: BriefingContext): Briefing {
  // One entry per rule: when the same rule fires for several weeks, keep the
  // most recent occurrence so risks and actions don't repeat.
  const activeAll = ctx.anomalies.filter((a) => !a.oneOff && !a.resolved && a.severity !== "info");
  const active = [...new Map(activeAll.slice().sort((x, y) => x.date.localeCompare(y.date)).map((a) => [a.rule, a])).values()];
  const oneOffs = ctx.anomalies.filter((a) => a.oneOff);
  const resolved = ctx.anomalies.filter((a) => a.resolved);

  const what_changed: string[] = [];
  if (ctx.sales.changePct !== null) {
    what_changed.push(
      ctx.sales.changePct < -2
        ? `Sales are down ${Math.abs(ctx.sales.changePct)}% week-over-week (${ctx.sales.last7Avg} vs ${ctx.sales.prior7Avg} RON/day).`
        : ctx.sales.changePct > 2
          ? `Sales are up ${ctx.sales.changePct}% week-over-week (${ctx.sales.last7Avg} vs ${ctx.sales.prior7Avg} RON/day).`
          : `Sales are stable week-over-week (${ctx.sales.last7Avg} RON/day).`
    );
  }
  const latestLabor = [...ctx.labor].reverse().find((w) => w.laborPct !== null);
  if (latestLabor) what_changed.push(`Labor cost is ${latestLabor.laborPct}% of sales for the week ending ${latestLabor.week}.`);
  if (ctx.checklist.latestScore !== null)
    what_changed.push(`Latest checklist score: ${ctx.checklist.latestScore}% (period average ${ctx.checklist.periodAvg}%).`);
  for (const o of oneOffs) what_changed.push(`One-off event: ${o.description}`);
  for (const r of resolved.slice(0, 1)) what_changed.push(`Earlier issue now resolved: ${r.description}`);

  // Risks: what happens if nobody intervenes, straight from active anomalies.
  const key_risks = active.map((a) => riskFor(a.rule, a.description));
  if (key_risks.length === 0) key_risks.push("No active risks detected — metrics are within normal ranges.");

  // Causes: manager notes are the best causal signal we have without an LLM.
  const likely_causes: string[] = ctx.notes.slice(0, 4).map((n) => `Manager note (${n.date}, ${n.author ?? "unknown"}): "${n.note}"`);
  if (likely_causes.length === 0 && active.length > 0)
    likely_causes.push("No manager notes on file — causes must be confirmed on site.");
  if (active.length === 0 && likely_causes.length === 0) likely_causes.push("Nothing to explain — location is operating normally.");

  const recommended_actions: RecommendedAction[] = active.map((a) => actionFor(a.rule, a.description));
  if (recommended_actions.length === 0) {
    recommended_actions.push({
      action: "No intervention needed — continue routine monitoring.",
      owner_role: "Location Manager",
      triggered_by: "All metrics within normal ranges as of " + ctx.asOfDate,
      check_back: "Next daily briefing.",
    });
  }

  const headline =
    ctx.status === "red"
      ? `${ctx.locationName} needs intervention today: ${active.filter((a) => a.severity === "red").length} critical and ${active.filter((a) => a.severity === "yellow").length} warning signals are active.`
      : ctx.status === "yellow"
        ? `${ctx.locationName} has ${active.length} warning signal(s) worth attention this week.`
        : `${ctx.locationName} is operating normally — no active risks.`;

  return { status: ctx.status, headline, what_changed, key_risks, likely_causes, recommended_actions };
}

function riskFor(rule: string, description: string): string {
  const map: Record<string, string> = {
    sales_trend: "If the sales decline continues unaddressed, the location compounds roughly this weekly loss into next month.",
    labor_pct: "Labor running this far above target erodes the location's margin every week it persists.",
    labor_creep: "A multi-week labor creep usually means overtime is masking a staffing gap — costs keep rising until the gap is filled.",
    overtime: "Sustained overtime burns out the remaining team and typically precedes more resignations.",
    checklist_low: "Low operational standards visible to guests translate into negative reviews and lost repeat visits within weeks.",
    checklist_drop: "A fast slide in checklist scores means routines are breaking down; left alone it reaches guests.",
    reviews_low_avg: "Poor recent ratings suppress new-guest traffic from review platforms and compound the sales decline.",
    reviews_negative_spike: "A burst of very negative reviews damages the location's rating quickly and is hard to recover.",
  };
  return `${map[rule] ?? "Unmonitored, this signal typically worsens."} (Trigger: ${description})`;
}

function actionFor(rule: string, description: string): RecommendedAction {
  const map: Record<string, Omit<RecommendedAction, "triggered_by">> = {
    sales_trend: {
      action: "Review the last two weeks day-by-day with the location manager today; identify which dayparts/channels are losing sales and agree one countermeasure.",
      owner_role: "Ops Director",
      check_back: "Compare next week's 7-day sales average against this week's in the next briefing.",
    },
    labor_pct: {
      action: "Rebuild this week's schedule against forecasted sales; cut or reassign shifts where labor exceeds the 32% target.",
      owner_role: "Location Manager",
      check_back: "Labor % for the next payroll week should be back under 32%.",
    },
    labor_creep: {
      action: "Identify why hours keep rising (unfilled position? training overlap?) and address the root cause rather than the schedule.",
      owner_role: "Location Manager",
      check_back: "Labor % stops rising in the next weekly payroll export.",
    },
    overtime: {
      action: "Fill the staffing gap driving overtime: accelerate hiring or borrow staff from a green location for the coming week.",
      owner_role: "Location Manager",
      check_back: "Actual vs scheduled hours within 5% in the next payroll week.",
    },
    checklist_low: {
      action: "Walk the failed checklist items with the shift leads today and re-train the specific routines that failed.",
      owner_role: "Location Manager",
      check_back: "Next JOLT audit score back above 85%.",
    },
    checklist_drop: {
      action: "Review the latest audit with shift leads to catch the slipping routines before they reach guests.",
      owner_role: "Location Manager",
      check_back: "Next JOLT audit score back near the location's average.",
    },
    reviews_low_avg: {
      action: "Read the recent negative reviews with the team, respond to each publicly, and fix the specific complaint theme (e.g. wait times) on today's shifts.",
      owner_role: "Location Manager",
      check_back: "10-day average rating trending back above 4.0 within two weeks.",
    },
    reviews_negative_spike: {
      action: "Treat as an incident: identify the shifts behind the negative reviews, brief the team today, and respond to every review.",
      owner_role: "Ops Director",
      check_back: "No new ≤2-star reviews over the next 7 days.",
    },
  };
  const base = map[rule] ?? {
    action: "Investigate this signal with the location manager today.",
    owner_role: "Ops Director",
    check_back: "Re-check in the next daily briefing.",
  };
  return { ...base, triggered_by: description };
}
