import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'atelier.db')

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    initialiseSchema(db)
  }
  return db
}

function initialiseSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dossiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_name TEXT NOT NULL UNIQUE,
      brand_name_normalised TEXT NOT NULL UNIQUE,
      dossier_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand_name TEXT NOT NULL,
      call_type TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      rate_per_million_input REAL NOT NULL,
      rate_per_million_output REAL NOT NULL,
      estimated_cost_usd REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
}

export function normaliseBrandName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}
