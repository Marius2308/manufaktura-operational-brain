# Handover — MANUFAKTURA Operational Brain MVP (Session 2)

Fresh session. Previous session's context window filled up — this file replaces it. Read this fully before doing anything. Do not re-derive decisions already made below; they're settled.

## What this project is (client context, unchanged)

Internal AI decision-support tool for a 5-location restaurant group. The client's operator currently connects POS, payroll, JOLT/checklist, review, and manager-note data manually in his head. This tool formalizes that: per location, per day, it answers *what is happening, why, what happens if nobody intervenes, and what should be done today*. Full original scope, phasing, and "what NOT to build" list is in `operational_brain_mvp_build_prompt.md` in the project root — that file is still authoritative for scope. This handover is about **current implementation state**, not scope.

## Decisions already made — do not re-ask, do not revisit without a real reason

- **Database: SQLite** via `better-sqlite3`. No Supabase/Postgres/Docker available in this environment. Schema is written Postgres-portable. This was user-approved; don't suggest switching back.
- **AI briefing model: `claude-sonnet-5`** (not Opus) — chosen for cost, since this is a repeated structured-generation task, not one needing top-tier reasoning.
- **Structured output**: uses the real `output_config.format` JSON-schema API feature (confirmed as a real, current Anthropic API capability) — not a hand-rolled "ask nicely for JSON" prompt.
- **Briefing fallback**: when `ANTHROPIC_API_KEY` is unset or the API call fails, a deterministic rule-based template generates the same JSON shape, clearly labeled in the UI as rule-based. This is intentional, not a stopgap to remove.
- **Auth**: single shared password gate via `APP_PASSWORD` env var, no roles. Sufficient for MVP.
- **"Today" for status/briefing purposes = latest date present in the imported data**, not wall-clock date. Keeps the demo deterministic regardless of when it's actually run.

## Current implementation status (verified by direct DB/app inspection at end of last session, not assumed from the plan)

All 8 original checkpoints are done except one partial item:

| Area | Status |
|---|---|
| Schema, import/normalization, `/import` UI | Done, verified |
| Anomaly detection rules | Done, verified against base sample data |
| AI briefing — fallback path | Done, verified (correct causal narrative for Vitan, correct minimal output for green locations) |
| AI briefing — real Claude API path | **Code-complete, never executed.** `ANTHROPIC_API_KEY` is still unset. This is the main open item. |
| Dashboard pages + charts | Done, verified incl. mobile (375px) |
| Action tracker | Done, verified |
| Post-MVP polish (branding, empty states, import undo, delete confirms, accumulate-not-replace imports, per-file import feedback) | Done, verified |

## ⚠️ Do this first, before anything else

**The live database is currently in a broken demo state.** Batch-2 sample data (the `_2` suffixed stress-test files) got imported into the actual running app, not just tested separately, and it inverts the calibrated story: current live statuses are Baneasa/Cluj YELLOW, Timisoara RED, Vitan GREEN — the opposite of the intended "Vitan is the red flagship problem, others are green" narrative that batch-1-only data produces.

**Fix before doing anything else, including any demo:**
```
rm -rf data
```
then use "Load sample data" (which already correctly filters to base-only files via a `!/_\d+\.csv$/i` regex) to reload a clean, calibrated state. Confirm afterward: Vitan RED, Militari/Cluj/Baneasa/Timisoara GREEN, 0 rows skipped.

Batch-2 files remain available for **manual, deliberate** upload via the Import page when someone specifically wants to stress-test generalization (see `/sample-data-batch2/README.md` for what should happen when they're loaded) — they are not meant to be part of the default demo state.

## Priority order for this session

1. **Reset DB to clean base-only state** (above) and confirm the 5 stories are correct again.
2. **Get a real `ANTHROPIC_API_KEY`** (user will provide this directly into `.env.local` themselves — do not ask them to paste it into chat). Once set:
   - Confirm the real Claude call actually executes and returns a parseable briefing (not just that it compiles).
   - Confirm the UI correctly labels AI-generated briefings differently from fallback ones (model name shown, not just "fallback").
   - Temporarily break the key to confirm the fallback path still triggers gracefully on API failure — don't skip this, it's the whole point of having a fallback.
3. **Initialize git.** There is currently no `.git` in the project — confirmed via `git status`. Do this before further changes so work becomes recoverable.
4. **Clean up the uploads table.** 114 rows currently exist, ~19 of which are duplicate no-op "Load sample data" clicks with `rows_imported: 0`. Not user-visible today (History UI caps at 30 rows) but will matter if this table is ever used as a real audit trail. Either dedupe on write (skip inserting an upload record when nothing changed) or add a cleanup script — your call, note the choice in README.
5. **Fix the sample file naming inconsistency.** `sample-data/sales_pos_export.csv` was renamed to `sales_pos_export2.csv` (no underscore) outside the app session, so it no longer matches what README.md's prose describes ("the 5 base CSVs"). Fix the README reference or rename the file back — either is fine, just make them consistent.
6. **Test the tablet breakpoint (768px).** Only mobile (375px) and desktop were checked last session.
7. **Test "+ Track" de-duplication.** Unverified: does pushing the same briefing recommendation to the action tracker twice (e.g. regenerate briefing, then track again) create a duplicate action item, or is it handled?
8. **Note but don't necessarily fix**: `deleteUpload()` (undo import) has a known incomplete case, documented in its own code comment — undoing an import doesn't correctly restore state if a later import already overwrote some of its rows. Fine for the common case (undoing the most recent import). Only worth fixing now if it's cheap; otherwise leave the comment as-is and mention it in README.

## Reference: sample data

Two independent batches exist, both already in `/sample-data` and `/sample-data-batch2`:

- **Batch 1** (`2026-06-03` to `2026-07-02`, no `_2` suffix): the calibrated demo dataset. Vitan declining → red; Militari resolved staffing blip; Cluj growth; Baneasa one clean one-off storm dip; Timisoara boring control. This is what "Load sample data" loads.
- **Batch 2** (`2026-07-03` to `2026-08-01`, `_2` suffix): a generalization/stress test with reversed stories (Vitan recovers, Baneasa develops a new problem, Cluj has a labor-efficiency issue despite good sales, Timisoara gets one sharp compound one-off) plus deliberate bad rows (duplicate, malformed date, unresolvable location, blank rating) to test the import pipeline's error handling. **Do not merge into the default one-click loader** — it's meant for deliberate, separate testing, not the default demo state. See its own README for the full expected-outcome checklist.

Do not regenerate or modify either sample dataset without a specific reason — they're the calibration reference for anomaly thresholds and briefing correctness.

## Things not to do

- Don't switch off SQLite, don't switch the briefing model off Sonnet 5, without the user explicitly asking.
- Don't build anything from the original build prompt's "out of scope" list (live API integrations, camera intelligence, predictive modeling, real-time pipelines, closed-loop ML learning, multi-role auth, microservices).
- Don't ask the user to paste an API key into chat — they set it directly in `.env.local`.
