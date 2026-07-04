# PLAN — MANUFAKTURA Operational Brain MVP

Written before code, per the build prompt. Full design rationale lives in the approved session plan; this is the working summary.

## Stack

Next.js (App Router, TypeScript) · Tailwind + shadcn-style UI components · Next.js API routes · **SQLite via better-sqlite3** (Supabase/Postgres unavailable in this environment — schema kept Postgres-portable, see README) · papaparse + SheetJS for CSV/Excel · Claude API (`claude-opus-4-8`) with a deterministic rule-based fallback when no API key is configured · Recharts.

## Database schema (`src/lib/db/schema.sql`)

| Table | Purpose |
|---|---|
| `locations` | 5 canonical locations (Baneasa, Militari, Vitan, Cluj, Timisoara) |
| `location_aliases` | messy source name → canonical location mapping |
| `uploads` | one row per imported file (source detected, rows imported/skipped) |
| `daily_sales` | per-location daily net sales / transactions / avg check |
| `payroll_weeks` | weekly scheduled vs actual hours, labor cost, FTE |
| `checklist_scores` | JOLT audit scores per date |
| `reviews` | guest reviews (platform, rating, text) |
| `manager_notes` | free-text notes with author + date |
| `anomalies` | detected anomalies: rule key, severity, value vs baseline, one-off flag |
| `briefings` | cached AI briefings (JSON content, generated_by claude/fallback) |
| `action_items` | owner, deadline, status (pending/in_progress/done), follow-up note |

## Pages / components

- `/login` — simple password gate (`APP_PASSWORD`, cookie + middleware)
- `/` — multi-location overview: status card (red/yellow/green) per location, sales sparkline, key deltas, open actions count
- `/locations/[id]` — charts (sales, labor %, checklist, ratings), daily briefing, anomaly list, manager notes, actions
- `/actions` — cross-location action tracker with inline status/owner/deadline/follow-up editing
- `/import` — file upload + "Load sample data" + import history

## Upload/import flow

1. Upload CSV/XLSX → `POST /api/import`
2. **Detect source** by header signature (sales / payroll / jolt / reviews / notes)
3. **Normalize**: location resolver (strip MANUFAKTURA / MNK / "Manufaktura -" prefixes, alias table); per-source date format (`DD.MM.YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`, `D Mon YYYY`, `DD/MM/YYYY`) → ISO
4. Upsert into clean tables; unresolvable rows counted as skipped
5. Re-run anomaly detection; return per-file summary

## Anomaly rules (rule-based, documented in code — no ML)

1. Sales 7-day avg vs prior 7 days: −15% yellow / −25% red
2. Single-day dip >40% below 14-day avg with stable trend → info "one-off"
3. Labor cost % of sales: >32% yellow / >38% red; 3+ rising weeks flagged
4. Overtime: actual > scheduled hours by >5%
5. Checklist: <85% yellow / <75% red, or −10 pts vs 30-day avg
6. Reviews: 10-day avg <3.5 yellow / <3.0 red, or ≥3 reviews ≤2 stars
7. Location status = worst active non-one-off severity

## AI briefing prompt structure (`src/lib/briefing/prompt.ts`)

Role: experienced multi-unit restaurant operator. Inputs: metric summaries, active anomalies (with trigger values), recent reviews, manager notes. Output (JSON schema enforced): `status`, `headline`, `what_changed[]`, `key_risks[]`, `likely_causes[]`, `recommended_actions[{action, owner_role, triggered_by, check_back}]`. Hard rule: every recommendation must cite the data point that triggered it. Fallback generator produces the same shape from anomalies + notes when no API key is present.

## Assumptions

- SQLite instead of Supabase (environment constraint; prompt-sanctioned fallback)
- Anomaly thresholds tuned to the sample-data stories; each documented at the rule
- "Today" = latest date in the data (2026-07-02), not wall-clock date
- Briefings cached in DB; regenerate on demand
