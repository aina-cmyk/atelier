import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()
    const templates = db.prepare('SELECT * FROM templates ORDER BY created_at DESC').all()
    return NextResponse.json({ success: true, templates })
  } catch (error) {
    console.error('Templates fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, role, subject, body: emailBody } = body

    if (!name || !role || !subject || !emailBody) {
      return NextResponse.json({ error: 'name, role, subject, and body are required' }, { status: 400 })
    }

    const db = getDb()
    const result = db.prepare(`
      INSERT INTO templates (name, role, subject, body)
      VALUES (?, ?, ?, ?)
    `).run(name, role, subject, emailBody)

    return NextResponse.json({ success: true, id: result.lastInsertRowid })
  } catch (error) {
    console.error('Template save error:', error)
    return NextResponse.json({ error: 'Failed to save template' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const db = getDb()
    db.prepare('DELETE FROM templates WHERE id = ?').run(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Template delete error:', error)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}