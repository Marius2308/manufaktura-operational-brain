# MANUFAKTURA Operational Brain — MVP

An AI decision-support tool for multi-location restaurant operations. Not a dashboard: for every location, every day, it answers the four operator questions — **what is happening, why, what happens if nobody intervenes, and what should be done today** — following the pipeline *Data → Information → Insights → Decisions → Actions → Results*.

## How to run

```bash
npm install
npm run dev          # http://localhost:3000
```

- Log in with the team password (set via `APP_PASSWORD` in `.env.local` — required, there is no default; the app fails closed and rejects every password if it's unset).
- Go to **Import** → click **“Load sample data”** — this imports the 5 base CSVs from `/sample-data` through the real normalization pipeline and runs anomaly detection.
- Open any location and click **Generate briefing**.

**Import behavior worth knowing:**
- Each import shows a plain-language summary: how many records were **added** vs. **updated** (overwritten), which **date range** it covered, duplicates skipped, and any rows that couldn't be read.
- **Sales, payroll, and checklist** imports merge by location + date — re-importing a corrected file updates the matching rows.
- **Reviews and manager notes** now **accumulate**: uploading a new batch adds its new rows and ignores duplicates, so you can import incremental exports without losing history.
- Every import can be **undone** from the Import history table (removes its rows and re-runs detection) — but only the **most recent** import of each source type (sales / payroll / checklist / reviews / notes). An older import of a type that's since been re-imported shows "Can't undo" instead of a button, because a later import of the same type may have overwritten some of its rows (upsert reassigns `upload_id` on conflict), and undoing it would otherwise silently remove only the rows it still owns rather than fully reverting. This is enforced both in the UI (button hidden) and server-side (`DELETE /api/uploads/:id` returns 409 for a non-latest upload) — see `isUploadUndoable()` in `src/lib/import/importer.ts`.
- **“Load sample data” loads only the base 5 files.** Any file with a numeric batch suffix (e.g. `sales_pos_export_2.csv`) is left out of the one-click loader and reserved for demonstrating an incremental upload manually — note that such batch data is independent synthetic data and does not continue the base "stories" below.
- **No-op imports don't clutter history.** If re-importing a file adds nothing, overwrites nothing, and skips nothing (e.g. clicking "Load sample data" again when reviews/notes are already fully on file — those two sources accumulate and dedupe by content), its upload record is dropped rather than left as a `rows_imported: 0` row.
- **Tracking a recommendation is idempotent.** Briefing recommendations are re-derived from the same signals on every "Regenerate", so clicking **+ Track** on the same recommendation after a regenerate (or from two tabs) won't create a second action item — the server matches on location + title among not-yet-done items and returns the existing one.

To enable real AI briefings, add `ANTHROPIC_API_KEY=sk-ant-...` to `.env.local` and restart. Without a key, briefings are produced by a deterministic rule-based generator (clearly labeled in the UI) so the whole demo works offline.

## Deploying to Render (free tier, guided demo)

This app is built to run on Render's free web service tier as-is — no Postgres, no persistent disk, no Docker needed.

- **Port binding**: `next start` reads the `PORT` env var natively and binds to `0.0.0.0` by default, which is exactly what Render's proxy requires. Nothing to configure.
- **No persistent disk**: SQLite lives at `./data/brain.db`, created fresh (`fs.mkdirSync(..., { recursive: true })`) on first boot of each running instance. Render's free tier has an ephemeral filesystem — **all data (imports, briefings, action items) is wiped on every restart, redeploy, or spin-down-from-inactivity.** That's expected and by design for this use case: click **"Load sample data"** again after any cold start to get back to the calibrated demo state.
- **Build command**: `npm install && npm run build`
- **Start command**: `npm run start`
- **Node version**: pinned via `.node-version` / the `engines` field in `package.json` (Next.js 16 requires Node ≥20.9.0).
- A `render.yaml` Blueprint is included — connect the repo and Render will pick up the service config automatically. It declares `APP_PASSWORD` and `ANTHROPIC_API_KEY` as required-but-unset (`sync: false`), so Render will prompt for them in the dashboard rather than silently deploying without them.

**Required env vars on Render** (set in the dashboard, not via `.env.local` — that file isn't deployed):
- `APP_PASSWORD` — **required**. Unlike local dev there's no hardcoded fallback: if this is left unset, the login route rejects every password and the app is fully inaccessible rather than silently exposed. Set it before the first deploy.
- `ANTHROPIC_API_KEY` — optional; omit to run on the rule-based fallback briefing generator.
- `BRIEFING_MODEL` — optional, defaults to `claude-sonnet-5`.

**Not indexed**: `public/robots.txt` disallows all crawling (`Disallow: /`), since this is an internal client demo, not a public site.

Optional CLI: `npx tsx scripts/load-sample.ts` loads the sample data and prints anomaly results per location — useful for verifying the detection rules.

## What was built

| Layer | Where | Notes |
|---|---|---|
| Data model | `src/lib/db/schema.sql` | Locations, aliases, daily sales, payroll weeks, checklist scores, reviews, manager notes, uploads, anomalies, briefings, action items |
| Import & normalization | `src/lib/import/` | Source auto-detected from headers; messy location names (`MANUFAKTURA VITAN`, `MNK Vitan`, `Manufaktura - Vitan`) and 5 different date formats normalized to a clean schema; unresolvable rows are skipped and counted, never guessed; per-file added/updated/skipped feedback; imports are undoable |
| Anomaly detection | `src/lib/anomalies/rules.ts` | 7 explainable rules (sales trend, one-off dips, labor %, labor creep, overtime, checklist, reviews) — each documented in code comments with its thresholds; no ML |
| AI daily briefing | `src/lib/briefing/` | Prompt template in its own file (`prompt.ts`); Claude API (model configurable via `BRIEFING_MODEL`, default `claude-sonnet-5`) with JSON-schema-enforced output; rule-based fallback (`fallback.ts`); every recommendation cites the data point that triggered it (`triggered_by`) |
| Dashboard | `src/app/` | Multi-location overview (status at a glance), location detail (charts, briefing, anomalies, notes), action tracker, import page |
| Action tracker | `/actions` | Owner, deadline, status (pending / in progress / done), and a manual follow-up note ("did it work?"); AI recommendations push into it with one click |
| Login gate | `src/proxy.ts` | Single shared password, cookie-based; one internal user type, no roles |

### Verified against the sample-data stories

The five intentional stories in `/sample-data` are the acceptance test, and all pass:

- **Vitan** → RED, with sales decline, labor % blowout + creep, overtime, low checklist score, and bad reviews all firing; the briefing's likely causes surface the manager notes (shift-lead resignation → short-staffing → 45-minute waits).
- **Militari** → GREEN, with the week-2/3 overtime blip flagged but marked **resolved** (latest week normal).
- **Cluj** → GREEN, growth (+28% over the month) with rising-but-healthy staffing not flagged (the labor-creep rule has a 30% floor precisely for this case).
- **Baneasa** → GREEN, with the June 18 storm day flagged as an informational **one-off** that does not affect status.
- **Timisoara** → GREEN with zero anomalies (false-positive control).

## What's mocked vs. real-data-ready

| Component | Status |
|---|---|
| Sample data | Mock (provided in `/sample-data`); the import pipeline itself is real and accepts any CSV/Excel matching the source header signatures |
| Database | **SQLite** (`data/brain.db` via better-sqlite3) — Supabase/Postgres was not available in the build environment. The schema is Postgres-portable (ISO text dates, no SQLite-only types); moving to Supabase means swapping `src/lib/db/index.ts` for a Postgres client and translating `INSERT ... ON CONFLICT` upserts (already Postgres-compatible syntax) |
| AI briefings | Real Claude API integration, exercised only in fallback mode in this environment (no API key). Add `ANTHROPIC_API_KEY` to switch — no code changes needed |
| Auth | Simple shared-password gate (per scope). A real deployment needs proper sessions, hashed credentials, and per-user accounts |
| Anomaly thresholds | Assumptions tuned to the sample data (documented at each rule in `rules.ts`); tune with the client on real data |
| "Today" | Defined as the latest date present in the data, not wall-clock date |

### To plug in real data

1. Export CSVs from the real systems (POS, payroll, JOLT, review platform) — if their headers differ, add a `SourceSpec` in `src/lib/import/importer.ts`.
2. Add real location-name variants to `location_aliases` as they appear.
3. Review thresholds in `src/lib/anomalies/rules.ts` against a few weeks of real numbers.
4. Set `ANTHROPIC_API_KEY` for AI briefings.

## What Phase 4/5 would require (deliberately out of scope now)

- **Live API integrations** with POS, payroll, JOLT, Beekeeper, and review platforms (current: CSV/manual upload only)
- **Camera/video intelligence**
- **Predictive risk modeling / forecasting** (current anomaly detection is descriptive, rule-based, and auditable by design)
- **Real-time pipelines / websockets** (current: refresh on import)
- **Closed-loop learning from action outcomes** — the follow-up field is human-entered; a later phase could mine it to score which interventions actually work
- **Roles & permissions** (location manager vs. ops director views), proper auth, audit logs
- **Multi-service infrastructure** — everything is a single deployable Next.js app on purpose
