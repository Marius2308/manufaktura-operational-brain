-- MANUFAKTURA Operational Brain — schema.
-- Written for SQLite (better-sqlite3) but kept Postgres-portable:
-- plain INTEGER PKs, TEXT dates in ISO 8601, no SQLite-only column types.

CREATE TABLE IF NOT EXISTS locations (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- Maps messy source-system names (e.g. "MANUFAKTURA VITAN", "MNK Vitan")
-- to a canonical location. The resolver also strips brand prefixes, so this
-- table only needs city-level aliases plus any oddballs discovered later.
CREATE TABLE IF NOT EXISTS location_aliases (
  alias       TEXT PRIMARY KEY,          -- stored lowercase
  location_id INTEGER NOT NULL REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS uploads (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  filename        TEXT NOT NULL,
  detected_source TEXT NOT NULL,         -- sales | payroll | checklist | reviews | notes
  rows_imported   INTEGER NOT NULL DEFAULT 0,
  rows_skipped    INTEGER NOT NULL DEFAULT 0,
  uploaded_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_sales (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id  INTEGER NOT NULL REFERENCES locations(id),
  date         TEXT NOT NULL,            -- ISO yyyy-mm-dd
  net_sales    REAL NOT NULL,
  transactions INTEGER,
  avg_check    REAL,
  upload_id    INTEGER REFERENCES uploads(id),
  UNIQUE (location_id, date)
);

CREATE TABLE IF NOT EXISTS payroll_weeks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id     INTEGER NOT NULL REFERENCES locations(id),
  week_ending     TEXT NOT NULL,         -- ISO yyyy-mm-dd
  scheduled_hours REAL,
  actual_hours    REAL,
  labor_cost      REAL NOT NULL,
  fte_count       REAL,
  upload_id       INTEGER REFERENCES uploads(id),
  UNIQUE (location_id, week_ending)
);

CREATE TABLE IF NOT EXISTS checklist_scores (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id    INTEGER NOT NULL REFERENCES locations(id),
  date           TEXT NOT NULL,
  checklist_name TEXT,
  score_pct      REAL NOT NULL,
  items_failed   INTEGER,
  upload_id      INTEGER REFERENCES uploads(id),
  UNIQUE (location_id, date, checklist_name)
);

-- Reviews and notes have no ID in their source exports, so we derive a
-- stable natural key from their content. This lets repeated imports
-- accumulate (new rows added) and stay idempotent (re-importing the same
-- file changes nothing) instead of wiping and replacing. platform/text/author
-- are stored as '' rather than NULL so the UNIQUE constraint dedupes reliably
-- (NULLs are treated as distinct in SQLite unique indexes).
CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  date        TEXT NOT NULL,
  platform    TEXT NOT NULL DEFAULT '',
  rating      REAL NOT NULL,
  text        TEXT NOT NULL DEFAULT '',
  upload_id   INTEGER REFERENCES uploads(id),
  UNIQUE (location_id, date, platform, rating, text)
);

CREATE TABLE IF NOT EXISTS manager_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  date        TEXT NOT NULL,
  author      TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL,
  upload_id   INTEGER REFERENCES uploads(id),
  UNIQUE (location_id, date, author, note)
);

-- Detected anomalies. Recomputed from scratch after every import
-- (rule-based and cheap), so no partial-update logic is needed.
CREATE TABLE IF NOT EXISTS anomalies (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id       INTEGER NOT NULL REFERENCES locations(id),
  rule_key          TEXT NOT NULL,       -- e.g. sales_trend, labor_pct, overtime...
  severity          TEXT NOT NULL,       -- red | yellow | info
  detected_for_date TEXT NOT NULL,       -- the date/week the anomaly refers to
  description       TEXT NOT NULL,
  metric_value      REAL,
  baseline_value    REAL,
  is_one_off        INTEGER NOT NULL DEFAULT 0,  -- 1 = isolated, explained event; excluded from status roll-up
  is_resolved       INTEGER NOT NULL DEFAULT 0,  -- 1 = past anomaly that has since normalized
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS briefings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id   INTEGER NOT NULL REFERENCES locations(id),
  briefing_date TEXT NOT NULL,
  status        TEXT NOT NULL,           -- red | yellow | green
  content_json  TEXT NOT NULL,           -- full structured briefing
  generated_by  TEXT NOT NULL,           -- claude | fallback
  model         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS action_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id   INTEGER NOT NULL REFERENCES locations(id),
  briefing_id   INTEGER REFERENCES briefings(id),
  title         TEXT NOT NULL,
  detail        TEXT,
  owner         TEXT,
  deadline      TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | done
  followup_note TEXT,                    -- manual "did it work?" note
  source        TEXT NOT NULL DEFAULT 'manual',   -- ai | manual
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
