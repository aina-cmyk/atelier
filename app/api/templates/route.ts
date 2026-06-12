import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { initialiseDb } from '@/lib/db'

export async function GET() {
  try {
    await initialiseDb()
    const result = await sql`SELECT * FROM templates ORDER BY created_at DESC`
    return NextResponse.json({ success: true, templates: result.rows })
  } catch (error) {
    console.error('Templates fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await initialiseDb()
    const body = await request.json()
    const { name, role, subject, body: emailBody } = body

    if (!name || !role || !subject || !emailBody) {
      return NextResponse.json({ error: 'name, role, subject, and body are required' }, { status: 400 })
    }

    const result = await sql`
      INSERT INTO templates (name, role, subject, body)
      VALUES (${name}, ${role}, ${subject}, ${emailBody})
      RETURNING id
    `
    return NextResponse.json({ success: true, id: result.rows[0].id })
  } catch (error) {
    console.error('Template save error:', error)
    return NextResponse.json({ error: 'Failed to save template' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    await sql`DELETE FROM templates WHERE id = ${id}`
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Template delete error:', error)
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }
}