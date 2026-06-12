import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { initialiseDb } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    await initialiseDb()
    const { searchParams } = new URL(request.url)
    const brandName = searchParams.get('brand_name')
    if (!brandName) return NextResponse.json({ error: 'brand_name is required' }, { status: 400 })
    const result = await sql`
      SELECT * FROM contact_history WHERE brand_name = ${brandName} ORDER BY sent_at DESC
    `
    return NextResponse.json({ success: true, history: result.rows })
  } catch (error) {
    console.error('Contact history error:', error)
    return NextResponse.json({ error: 'Failed to fetch contact history' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await initialiseDb()
    const body = await request.json()
    const { brand_name, contact_role, contact_name, contact_email, method = 'email' } = body
    await sql`
      INSERT INTO contact_history (brand_name, contact_role, contact_name, contact_email, method)
      VALUES (${brand_name}, ${contact_role}, ${contact_name}, ${contact_email}, ${method})
    `
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Contact history POST error:', error)
    return NextResponse.json({ error: 'Failed to save contact history' }, { status: 500 })
  }
}