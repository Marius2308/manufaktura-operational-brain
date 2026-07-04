# STATUS — MANUFAKTURA Operational Brain

Written at end of session, from direct inspection of the running app and database (not from memory of what was planned). Timestamps below are from `data/brain.db`, current as of this writing.

## 1. Checkpoint status vs. PLAN.md

| # | Checkpoint | Status |
|---|---|---|
| 1 | PLAN.md | **Done** |
| 2 | Schema + import/normalization pipeline | **Done** |
| 3 | Import pipeline + `/import` UI | **Done** |
| 4 | Anomaly detection rules | **Done** |
| 5 | AI briefing generation (prompt + Claude call + fallback) | **Partial** — fallback path fully built and verified; Claude API call path is written and code-complete but has **never executed against the real API** (no key configured, see §5) |
| 6 | Dashboard pages + charts | **Done** |
| 7 | Action tracker | **Done** |
| 8 | README.md | **Done** |

Post-MVP polish round (client-requested, not in original PLAN.md numbering) — also done: branding/logo/favicon, empty states, import undo, delete confirmations, reviews/notes accumulate-instead-of-replace, per-file import feedback (added/updated/skipped counts + date range).

Nothing is unstarted. The one open item is exercising the real Claude API call (see §5).

## 2. What was verified vs. only built, per completed checkpoint

**Import pipeline (#2, #3)**
- Verified: base 5 CSVs (`sales_pos_export2.csv`, `payroll_fte_export.csv`, `jolt_checklist_export.csv`, `guest_reviews_export.csv`, `manager_notes.csv`) import with 0 unresolved locations and correct date parsing for all 5 source date formats.
- Verified: idempotent re-import — re-uploading the same base files a second time produces `added: 0` for reviews/notes (confirmed via live upload log, upload IDs 15, 20, 25... all show `rows_imported: 0` for `guest_reviews_export.csv` and `manager_notes.csv` on repeat imports) and `updated: N` for sales/payroll/checklist (upsert-by-date, e.g. upload ID 11 shows `jolt_checklist_export.csv` re-imported as 40 updates, not 40 new rows).
- Verified: incremental batch-2 files (`sales_pos_export_2.csv`, `payroll_fte_export_2.csv`, `jolt_checklist_export_2.csv`, `guest_reviews_export_2.csv`, `manager_notes_2.csv`) import cleanly on top of batch 1 — upload ID 110-114, `guest_reviews_export_2.csv` added 38 new + skipped 1 (a row with an empty rating, correctly rejected), `sales_pos_export_2.csv` added 151 + skipped 2 (one row has `Date="not-a-date"`, correctly rejected). Reviews/notes accumulated (did not wipe batch-1 data) — this was the specific fix requested last session, and it is now confirmed working under real usage, not just my own test script.
- Not verified: undo-import in a scenario where a later import has already overwritten some of an earlier import's rows (the "partial undo" edge case noted in the code comment in `deleteUpload()`).

**Anomaly detection (#4)**
- Verified against base-only data (the 5 non-suffixed CSVs): Vitan RED, Militari/Cluj/Baneasa/Timisoara GREEN — matches all 5 stories in `sample-data/README.md`.
- Verified — and this is a live finding, not a hypothetical — that loading batch-2 data on top of batch-1 **breaks the stories**: current DB state (both batches loaded) shows Baneasa YELLOW (4 active anomalies), Cluj YELLOW (5 active anomalies), Timisoara RED (1 active anomaly), Vitan GREEN (0 active anomalies), Militari GREEN. Baneasa, Cluj, and Timisoara are supposed to be green controls/growth stories; Vitan is supposed to be the red flagship case. This is why "Load sample data" was restricted to base files only — but a manual upload of the `_2` files (which a user can do from the Import page) still produces this breakage, by design, since batch 2 is independent synthetic data layered on top.

**AI briefing (#5)**
- Verified: fallback generator produces the correct causal narrative for Vitan (surfaces the 3 manager notes: shift-lead resignation → short-staffing → 45-min wait complaint) and correctly produces a minimal "no intervention needed" briefing for green locations.
- Verified: briefing generation re-ran against the batch-2-loaded state — current DB has 2 briefings on file (location_id 4 = Cluj, location_id 1 = Baneasa), both `generated_by: "fallback"`, both `briefing_date: "2026-08-01"` (the "as of" date shifted to August because batch-2 sales data extends into August), both status `yellow`. This is consistent with the story-breakage above, not a bug in the briefing logic itself.
- **Not verified: the actual Claude API call path.** `output_config.format` JSON-schema enforcement, error handling on API failure, and the real AI-narrated prose have never run — see §5.

**Dashboard / action tracker (#6, #7)**
- Verified via browser automation: overview cards, sparkline, status badges, all 4 location-detail charts (with threshold reference lines), anomaly list (active vs. one-off/resolved separation), manager notes timeline, "+ Track" pushing a briefing recommendation into the action tracker, action status/owner/deadline/follow-up editing, delete-with-confirm.
- Verified at 375px mobile width (overview + location detail): zero horizontal overflow.
- Not verified: tablet breakpoint (768px) specifically — only mobile and desktop were checked.

## 3. Deviations from the original plan

- **Database is SQLite, not Supabase/Postgres** — environment had no Supabase project, no local Postgres, no Docker. This was a pre-approved fallback (user confirmed via AskUserQuestion before implementation), documented in both PLAN.md and README.md.
- **"Load sample data" loads only 5 of the 10 files now in `/sample-data`** — the folder grew a second batch (`_2` suffixed files) after the original plan was written; loading all 10 breaks the calibrated stories (see §2). The one-click loader now filters to base files by regex (`!/_\d+\.csv$/i`); batch-2 files require a manual upload.
- **`src/middleware.ts` was renamed to `src/proxy.ts`** mid-session — Next.js 16 deprecated the `middleware.ts` convention in favor of `proxy.ts` with an exported `proxy()` function instead of `middleware()`. Functionally identical, just relocated/renamed to match the framework version actually installed.
- **Reviews and manager notes now use a derived natural key** (`location_id + date + platform/author + rating/note` etc., stored as SQL `UNIQUE` constraints) instead of the original "wipe and re-insert on every import" approach. This was a client-requested fix, not in the original PLAN.md, but changes the schema (`reviews` and `manager_notes` tables gained `UNIQUE` constraints and default-`''` instead of nullable text columns).
- **`next/image` is called with `unoptimized`** on the two logo `<Image>` usages — the Next.js image optimizer was rejecting the PNG (`"isn't a valid image"`, page hung). Bypassing the optimizer for a small static logo asset is a reasonable permanent choice, not a workaround to revisit.

## 4. Known bugs, TODOs, "good enough for now"

- **Uploads table grows unbounded, including no-op imports.** Every click of "Load sample data" or re-upload of an unchanged file writes a new row to the `uploads` table even when 0 records were added or updated. Current DB has **114 upload records** from repeated testing, the large majority of which are duplicate no-op imports (e.g. IDs 15–109 are ~19 repeats of the same 5-file batch load, each showing `rows_imported: 0` for reviews/notes). The Import History UI caps display at 30 rows (`LIMIT 30` in `getUploads()`), so this isn't currently visible to a user, but nothing prunes or dedupes the underlying table. Not a functional bug, but worth revisiting before this table is used for any real audit trail.
- **`deleteUpload()` (undo import) has a known incomplete case**, documented in its own code comment: if a later import overwrote rows that an earlier import first inserted, undoing the *earlier* import will not correctly restore state (it deletes by `upload_id`, and overwritten rows now belong to the later upload). Fine for the common case (undo the most recent import), not verified for the general case.
- **Sample file naming is inconsistent.** `sample-data/sales_pos_export.csv` was renamed to `sample-data/sales_pos_export2.csv` (no underscore) at some point outside this session. It still matches the "base file" filter correctly (regex requires an underscore before the digit), so nothing is broken, but it no longer matches the filename referenced in prose in README.md ("the 5 base CSVs") and could confuse someone editing the import logic later expecting the original name.
- **No version control.** The project directory has no `.git` — confirmed via `git status` returning "not a git repository." Worth setting up before handing this off, so changes are tracked and recoverable.
- **Tablet breakpoint (768px) untested** — only mobile (375px) and desktop were checked this session.
- **"+ Track" button de-dupe**: pushing the same briefing recommendation to the action tracker twice (e.g. regenerate + track again) was not tested — unclear if it creates a duplicate action item or is otherwise handled.

## 5. Exact state of the two open questions

**Is `ANTHROPIC_API_KEY` set?** No. `.env.local` currently contains:
```
APP_PASSWORD=manufaktura
# ANTHROPIC_API_KEY=sk-ant-...
```
The key line is commented out. Every briefing generated so far — all of them, including the 2 currently stored in the `briefings` table — has `generated_by: "fallback"` and `model: null`. The Claude API code path (`src/lib/briefing/generate.ts`, the `client.messages.create(...)` call with `output_config.format`) has not executed even once. It compiles and passed `npm run build`, but is otherwise unverified.

**Has batch-2 data been imported and tested?** Yes. The current live database (not a test script — the actual app, evidenced by the upload timestamps and the sequential ID pattern of a real UI session) has all 5 batch-2 files imported (upload IDs 110–114, timestamped 2026-07-03 19:08:08), on top of the base batch. This confirms in a real-use setting what I found in testing last session: batch-2 changes the location statuses away from the calibrated stories (current live statuses: Baneasa YELLOW, Cluj YELLOW, Timisoara RED, Vitan GREEN, Militari GREEN — see §2 for the full breakdown). Two briefings were also regenerated against this mixed-batch state and are sitting in the `briefings` table dated `2026-08-01`.

## 6. Next step if continuing

Reset the database to a clean base-only state (`rm -rf data`, then load only the 5 base sample files) before any client-facing demo, since it currently reflects the batch-2 mixed-in state with broken stories and stale August-dated briefings. After that, the next substantive piece of unfinished work is obtaining and testing a real `ANTHROPIC_API_KEY` — confirm the `output_config.format` JSON-schema call actually returns a parseable `Briefing` object from Claude (not just the fallback), verify the UI's "AI-narrated by Claude" label and model name display correctly, and confirm the error-handling path (falls back gracefully) still works by temporarily using an invalid key.
