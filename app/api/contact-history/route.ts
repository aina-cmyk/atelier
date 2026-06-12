import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const brandName = searchParams.get('brand_name')

    if (!brandName) {
      return NextResponse.json({ error: 'brand_name is required' }, { status: 400 })
    }

    const db = getDb()
    const history = db.prepare(
      'SELECT * FROM contact_history WHERE brand_name = ? ORDER BY sent_at DESC'
    ).all(brandName)

    return NextResponse.json({ success: true, history })
  } catch (error) {
    console.error('Contact history error:', error)
    return NextResponse.json({ error: 'Failed to fetch contact history' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { brand_name, contact_role, contact_name, contact_email, method = 'email' } = body

    const db = getDb()
    db.prepare(`
      INSERT INTO contact_history (brand_name, contact_role, contact_name, contact_email, method)
      VALUES (?, ?, ?, ?, ?)
    `).run(brand_name, contact_role, contact_name, contact_email, method)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Contact history POST error:', error)
    return NextResponse.json({ error: 'Failed to save contact history' }, { status: 500 })
  }
}