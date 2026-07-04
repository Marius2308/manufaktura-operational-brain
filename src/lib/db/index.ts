import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// Singleton SQLite connection. The DB file lives in ./data (gitignored).
// Schema is applied idempotently on first open; canonical locations are seeded.

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "brain.db");

const CANONICAL_LOCATIONS = ["Baneasa", "Militari", "Vitan", "Cluj", "Timisoara"];

declare global {
  // Survive Next.js dev-mode module reloads
  var __brainDb: Database.Database | undefined;
}

function open(): Database.Database {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schema = fs.readFileSync(path.join(process.cwd(), "src", "lib", "db", "schema.sql"), "utf8");
  db.exec(schema);

  const insertLoc = db.prepare("INSERT OR IGNORE INTO locations (name) VALUES (?)");
  const insertAlias = db.prepare(
    "INSERT OR IGNORE INTO location_aliases (alias, location_id) VALUES (?, (SELECT id FROM locations WHERE name = ?))"
  );
  const seed = db.transaction(() => {
    for (const name of CANONICAL_LOCATIONS) {
      insertLoc.run(name);
      // city name itself is an alias; the resolver lowercases + strips brand prefixes
      insertAlias.run(name.toLowerCase(), name);
    }
  });
  seed();
  return db;
}

export function getDb(): Database.Database {
  if (!global.__brainDb) global.__brainDb = open();
  return global.__brainDb;
}

export interface LocationRow {
  id: number;
  name: string;
}

export function getLocations(): LocationRow[] {
  return getDb().prepare("SELECT id, name FROM locations ORDER BY name").all() as LocationRow[];
}
