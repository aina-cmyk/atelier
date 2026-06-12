import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { initialiseDb } from '@/lib/db'

export async function GET() {
  try {
    await initialiseDb()
    const result = await sql`SELECT * FROM saved_suggestions ORDER BY created_at DESC`
    return NextResponse.json({ success: true, suggestions: result.rows })
  } catch (error) {
    console.error('Saved suggestions fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch saved suggestions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await initialiseDb()
    const body = await request.json()
    const { brand_name, category, reason, signal } = body
    if (!brand_name || !category || !reason || !signal) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    await sql`
      INSERT INTO saved_suggestions (brand_name, category, reason, signal)
      VALUES (${brand_name}, ${category}, ${reason}, ${signal})
      ON CONFLICT (brand_name) DO NOTHING
    `
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Save suggestion error:', error)
    return NextResponse.json({ error: 'Failed to save suggestion' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const brand_name = searchParams.get('brand_name')
    if (!brand_name) return NextResponse.json({ error: 'brand_name is required' }, { status: 400 })
    await sql`DELETE FROM saved_suggestions WHERE brand_name = ${brand_name}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete suggestion error:', error)
    return NextResponse.json({ error: 'Failed to delete suggestion' }, { status: 500 })
  }
}