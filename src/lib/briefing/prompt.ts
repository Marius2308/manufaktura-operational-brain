import { BriefingContext } from "./context";

/**
 * The daily-briefing prompt template — kept in its own file, per the build
 * spec, so it can be read and tuned by a non-developer.
 *
 * Design notes:
 * - The system prompt encodes HOW a good operator thinks: check the anomaly
 *   list first, cross-reference manager notes for causes, distinguish
 *   one-off events from trends, and always answer the four daily questions.
 * - Every recommendation MUST cite the data point that triggered it
 *   (the `triggered_by` field) — no black-box advice.
 * - Output shape is enforced with a JSON schema (see schema.ts), so the
 *   response always parses.
 */

export const BRIEFING_SYSTEM_PROMPT = `You are the operations brain for MANUFAKTURA, a multi-location restaurant group. You think like an experienced multi-unit operator reviewing one location's day.

Your briefing must answer four questions, in this order of thought:
1. What is happening? (headline + what_changed)
2. Why is it happening? (likely_causes — cross-reference metrics with manager notes; the notes usually contain the real story)
3. What happens if nobody intervenes? (key_risks)
4. What should be done today? (recommended_actions)

Rules you must follow:
- Every recommended action must name the specific data point that triggered it in "triggered_by" (e.g. "Checklist score 69% on 2026-06-30"). Never recommend something you cannot tie to the data.
- Distinguish one-off, explained events (marked one-off in the anomaly list) from ongoing trends. Do not raise risks about resolved or one-off anomalies; mention them only as context.
- If the location is healthy, say so plainly and keep the briefing short — do not invent problems. A green location may have zero or one recommended actions ("keep monitoring" is acceptable).
- Assign each action an owner_role (e.g. "Location Manager", "Ops Director", "Kitchen Lead") and a concrete check_back (when and what to look at to confirm it worked).
- Use plain language a restaurant manager reads in 60 seconds. Reference concrete numbers.`;

export function buildBriefingUserPrompt(ctx: BriefingContext): string {
  const laborLines = ctx.labor
    .map((w) => `  week ending ${w.week}: labor ${w.laborPct ?? "n/a"}% of sales, overtime ${w.overtimePct ?? "n/a"}%`)
    .join("\n");
  const reviewLines = ctx.reviews
    .map((r) => `  ${r.date} [${r.platform ?? "?"}] ${r.rating}/5 — "${r.text ?? ""}"`)
    .join("\n");
  const noteLines = ctx.notes.map((n) => `  ${n.date} (${n.author ?? "unknown"}): ${n.note}`).join("\n");
  const anomalyLines = ctx.anomalies
    .map(
      (a) =>
        `  [${a.severity}${a.oneOff ? ", one-off" : ""}${a.resolved ? ", resolved" : ""}] ${a.rule} (${a.date}): ${a.description}`
    )
    .join("\n");

  return `Location: ${ctx.locationName}
Data as of: ${ctx.asOfDate}
Rule-based status roll-up: ${ctx.status.toUpperCase()}

SALES
  Last 7-day average: ${ctx.sales.last7Avg ?? "n/a"} RON/day
  Prior 7-day average: ${ctx.sales.prior7Avg ?? "n/a"} RON/day
  Week-over-week change: ${ctx.sales.changePct ?? "n/a"}%

LABOR (weekly)
${laborLines || "  no data"}

CHECKLIST (JOLT)
  Latest score: ${ctx.checklist.latestScore ?? "n/a"}% on ${ctx.checklist.latestDate ?? "n/a"} (period average ${ctx.checklist.periodAvg ?? "n/a"}%)

DETECTED ANOMALIES (rule-based, already vetted)
${anomalyLines || "  none — all metrics within normal ranges"}

RECENT GUEST REVIEWS (newest first)
${reviewLines || "  none"}

MANAGER NOTES (newest first)
${noteLines || "  none"}

Produce today's briefing for this location as JSON.`;
}
