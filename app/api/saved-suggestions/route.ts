import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()
    const suggestions = db.prepare('SELECT * FROM saved_suggestions ORDER BY created_at DESC').all()
    return NextResponse.json({ success: true, suggestions })
  } catch (error) {
    console.error('Saved suggestions fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch saved suggestions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { brand_name, category, reason, signal } = body

    if (!brand_name || !category || !reason || !signal) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const db = getDb()
    db.prepare(`
      INSERT OR IGNORE INTO saved_suggestions (brand_name, category, reason, signal)
      VALUES (?, ?, ?, ?)
    `).run(brand_name, category, reason, signal)

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

    if (!brand_name) {
      return NextResponse.json({ error: 'brand_name is required' }, { status: 400 })
    }

    const db = getDb()
    db.prepare('DELETE FROM saved_suggestions WHERE brand_name = ?').run(brand_name)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete suggestion error:', error)
    return NextResponse.json({ error: 'Failed to delete suggestion' }, { status: 500 })
  }
}