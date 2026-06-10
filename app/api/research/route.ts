import { NextRequest, NextResponse } from 'next/server'
import { researchBrand } from '@/lib/research'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { brand_name } = body

    if (!brand_name || typeof brand_name !== 'string' || brand_name.trim() === '') {
      return NextResponse.json(
        { error: 'brand_name is required' },
        { status: 400 }
      )
    }

    const dossier = await researchBrand(brand_name.trim())

    return NextResponse.json({ success: true, dossier })

  } catch (error) {
    console.error('Research route error:', error)
    return NextResponse.json(
      { error: 'Research failed. Check server logs.' },
      { status: 500 }
    )
  }
}