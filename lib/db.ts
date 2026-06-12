import { sql } from '@vercel/postgres'

export async function initialiseDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS dossiers (
      id SERIAL PRIMARY KEY,
      brand_name TEXT NOT NULL,
      brand_name_normalised TEXT NOT NULL UNIQUE,
      dossier_json TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS usage_log (
      id SERIAL PRIMARY KEY,
      brand_name TEXT NOT NULL,
      call_type TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      rate_per_million_input REAL NOT NULL,
      rate_per_million_output REAL NOT NULL,
      estimated_cost_usd REAL NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS contact_history (
      id SERIAL PRIMARY KEY,
      brand_name TEXT NOT NULL,
      contact_role TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      method TEXT DEFAULT 'email',
      sent_at TIMESTAMP DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS saved_suggestions (
      id SERIAL PRIMARY KEY,
      brand_name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      reason TEXT NOT NULL,
      signal TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `
}

export function normaliseBrandName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}