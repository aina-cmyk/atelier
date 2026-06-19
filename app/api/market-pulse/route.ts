import { NextResponse } from 'next/server'

export async function GET() {
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
          content: `You are a supply chain and trade analyst for Atelier, an ANZ contract manufacturer for prestige beauty brands.

Search for the latest global signals from the last 30 days that are relevant to beauty manufacturing and supply chains.

Look for:
- US/China/EU tariff changes affecting beauty or consumer goods manufacturing
- Shipping disruptions, port strikes, or logistics cost changes
- Raw material shortages or price changes (packaging, ingredients, plastics)
- Regulatory changes affecting cosmetics manufacturing (TGA, FDA, EU)
- Currency fluctuations affecting import/export costs for AU brands
- Any major supply chain disruptions affecting global beauty brands

For each signal explain why it creates an outreach opportunity for Atelier as a local ANZ manufacturer.

Return 4 signals as valid JSON only. No preamble, no markdown fences. Begin with [ and end with ].
[
  {
    "title": "string (short headline)",
    "signal_type": "tariff | shipping | materials | regulatory | currency | disruption",
    "summary": "string (2 sentences max explaining what happened)",
    "outreach_angle": "string (one sentence: how Atelier can use this in outreach)",
    "urgency": "high | medium | low",
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
    if (!jsonMatch) return NextResponse.json({ success: true, signals: [] })

    const signals = JSON.parse(jsonMatch[0])
    return NextResponse.json({ success: true, signals })

  } catch (error) {
    console.error('Market pulse error:', error)
    return NextResponse.json({ error: 'Failed to fetch market pulse' }, { status: 500 })
  }
}