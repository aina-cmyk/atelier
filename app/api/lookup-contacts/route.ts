import { NextRequest, NextResponse } from 'next/server'

const LUSHA_API_KEY = process.env.LUSHA_API_KEY
const ROLES = ['CFO', 'COO', 'CMO', 'CEO']

async function lookupContact(companyName: string, role: string) {
  try {
    const response = await fetch('https://api.lusha.com/prospecting/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_key': LUSHA_API_KEY ?? ''
      },
      body: JSON.stringify({
        company: { name: companyName },
        jobTitles: [role]
      })
    })

    if (response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      const retry = await fetch('https://api.lusha.com/prospecting/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api_key': LUSHA_API_KEY ?? ''
        },
        body: JSON.stringify({
          company: { name: companyName },
          jobTitles: [role]
        })
      })
      if (!retry.ok) {
        return { role, lookup_failed: true, retry_available: true }
      }
      const retryData = await retry.json()
      return { role, ...retryData }
    }

    if (!response.ok) {
      return { role, lookup_failed: true, retry_available: true }
    }

    const data = await response.json()
    return { role, ...data }

  } catch {
    return { role, lookup_failed: true, retry_available: true }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { brand_name } = body

    if (!brand_name || typeof brand_name !== 'string') {
      return NextResponse.json(
        { error: 'brand_name is required' },
        { status: 400 }
      )
    }

    const results = await Promise.all(
      ROLES.map(role => lookupContact(brand_name, role))
    )

    return NextResponse.json({ success: true, contacts: results })

  } catch (error) {
    console.error('Lookup contacts error:', error)
    return NextResponse.json(
      { error: 'Contact lookup failed' },
      { status: 500 }
    )
  }
}