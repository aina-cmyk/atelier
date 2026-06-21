import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 4
        }],
        messages: [{
          role: 'user',
          content: `You are a sales intelligence analyst for Atelier, an ANZ contract manufacturer for prestige beauty brands.

Search for the latest news and signals from the prestige beauty, health and wellness industry from the last 30 days.

Look for:
- Funding rounds or acquisitions in beauty/wellness
- Major new product launches from prestige brands
- New retail partnerships (Sephora, Mecca, David Jones, Ulta etc)
- Brand expansions into AU or US markets
- Leadership changes at major beauty brands
- Emerging trends that signal manufacturing demand
- Celebrity, influencer, or model-founded beauty brand launches or expansions (e.g. Rhode, Rare Beauty, Fenty, Florence by Mills, Flower Beauty)
- Influencer-backed brands gaining retail traction or funding

Return 6-8 of the most relevant signals as valid JSON only. No preamble, no markdown fences. Begin with [ and end with ].
[
  {
    "brand": "string (brand name)",
    "signal_type": "funding | launch | retail | leadership | expansion | trend | celebrity",
    "headline": "string (one line summary of what happened)",
    "why_it_matters": "string (one sentence: why this is relevant for Atelier as a contract manufacturer)",
    "date": "string (approximate month and year)"
  }
]`
        }]
      })
    })

    const data = await res.json()
    const rawText = (data.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')

    const jsonMatch = rawText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({ success: true, signals: [] })
    }

    const signals = JSON.parse(jsonMatch[0])

    signals.sort((a: { date?: string }, b: { date?: string }) => {
      const parse = (d?: string) => {
        if (!d) return null
        const dt = new Date(`1 ${d}`)
        return isNaN(dt.getTime()) ? null : dt
      }
      const da = parse(a.date)
      const db = parse(b.date)
      if (da && db) return db.getTime() - da.getTime()
      if (da) return -1
      if (db) return 1
      return 0
    })

    return NextResponse.json({ success: true, signals })

  } catch (error) {
    console.error('Industry signals error:', error)
    return NextResponse.json({ error: 'Failed to fetch industry signals' }, { status: 500 })
  }
}