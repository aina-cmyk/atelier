export const isVercel = !!process.env.POSTGRES_URL

export async function initialiseDb() {
  if (isVercel) {
    const { sql } = await import('@vercel/postgres')
    await sql`CREATE TABLE IF NOT EXISTS dossiers (id SERIAL PRIMARY KEY, brand_name TEXT NOT NULL, brand_name_normalised TEXT NOT NULL UNIQUE, dossier_json TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`
    await sql`CREATE TABLE IF NOT EXISTS usage_log (id SERIAL PRIMARY KEY, brand_name TEXT NOT NULL, call_type TEXT NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, rate_per_million_input REAL NOT NULL, rate_per_million_output REAL NOT NULL, estimated_cost_usd REAL NOT NULL, created_at TIMESTAMP DEFAULT NOW())`
    await sql`CREATE TABLE IF NOT EXISTS templates (id SERIAL PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`
    await sql`CREATE TABLE IF NOT EXISTS contact_history (id SERIAL PRIMARY KEY, brand_name TEXT NOT NULL, contact_role TEXT NOT NULL, contact_name TEXT NOT NULL, contact_email TEXT NOT NULL, method TEXT DEFAULT 'email', sent_at TIMESTAMP DEFAULT NOW())`
    await sql`CREATE TABLE IF NOT EXISTS saved_suggestions (id SERIAL PRIMARY KEY, brand_name TEXT NOT NULL UNIQUE, category TEXT NOT NULL, reason TEXT NOT NULL, signal TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW())`
  } else {
    const Database = require('better-sqlite3')
    const path = require('path')
    const db = new Database(path.join(process.cwd(), 'atelier.db'))
    db.pragma('journal_mode = WAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS dossiers (id INTEGER PRIMARY KEY AUTOINCREMENT, brand_name TEXT NOT NULL, brand_name_normalised TEXT NOT NULL UNIQUE, dossier_json TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS usage_log (id INTEGER PRIMARY KEY AUTOINCREMENT, brand_name TEXT NOT NULL, call_type TEXT NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, rate_per_million_input REAL NOT NULL, rate_per_million_output REAL NOT NULL, estimated_cost_usd REAL NOT NULL, created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS templates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS contact_history (id INTEGER PRIMARY KEY AUTOINCREMENT, brand_name TEXT NOT NULL, contact_role TEXT NOT NULL, contact_name TEXT NOT NULL, contact_email TEXT NOT NULL, method TEXT DEFAULT 'email', sent_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS saved_suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT, brand_name TEXT NOT NULL UNIQUE, category TEXT NOT NULL, reason TEXT NOT NULL, signal TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')));
    `)
  }
}

export function getLocalDb() {
  const Database = require('better-sqlite3')
  const path = require('path')
  return new Database(path.join(process.cwd(), 'atelier.db'))
}

export function normaliseBrandName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}