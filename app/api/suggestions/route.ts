import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { sql } from '@vercel/postgres'
import { initialiseDb } from '@/lib/db'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const REENGAGE_MONTHS = 6

export async function POST(request: Request) {
  try {
    await initialiseDb()
    const body = await request.json()
    const { excludeBrands = [] } = body

    const cutoffDate = new Date()
    cutoffDate.setMonth(cutoffDate.getMonth() - REENGAGE_MONTHS)

    const reengageRows = await sql`
      SELECT DISTINCT brand_name, MAX(sent_at) as last_contacted
      FROM contact_history
      WHERE sent_at <= ${cutoffDate.toISOString()}
      GROUP BY brand_name
    `

    const reengageBrands = reengageRows.rows.filter(
      r => !excludeBrands.includes(r.brand_name)
    )

    const excludeList = excludeBrands.length > 0
      ? 'Exclude these brands as they are already in the active pipeline: ' + excludeBrands.join(', ') + '.'
      : ''

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: 'You are a sales intelligence analyst for Atelier, an ANZ contract manufacturer specialising in prestige beauty, skincare, haircare, and wellness products.\n\n' +
            'Suggest 8 ANZ and global beauty/wellness brands that would be strong prospects for Atelier. Focus on:\n' +
            '- Prestige beauty, skincare, haircare, or wellness brands\n' +
            '- Revenue of AUD $50M+ or showing strong growth signals\n' +
            '- Sold through Sephora, Mecca, David Jones, or equivalent prestige retailers\n' +
            '- Active product development (recent launches, NPD hiring, funding)\n' +
            '- Available in ANZ markets or expanding into ANZ\n\n' +
            excludeList + '\n\n' +
            'Return exactly 8 brand suggestions.\n\n' +
            'Return valid JSON only. No preamble, no markdown fences. Begin with [ and end with ].\n' +
            '[\n' +
            '  {\n' +
            '    "brand_name": "string",\n' +
            '    "category": "string",\n' +
            '    "reason": "string (one sentence why this brand is a good Atelier prospect)",\n' +
            '    "signal": "string (one key signal e.g. Recently launched at Mecca AU)"\n' +
            '  }\n' +
            ']'
        }
      ]
    })

    const rawText = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('')

    const jsonMatch = rawText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 })
    }

    const newSuggestions = JSON.parse(jsonMatch[0])

    const reengageSuggestions = reengageBrands.map(r => ({
      brand_name: r.brand_name,
      category: 'Re-engagement',
      reason: `Last contacted ${Math.floor((Date.now() - new Date(r.last_contacted).getTime()) / (1000 * 60 * 60 * 24 * 30))} months ago — worth reaching out again.`,
      signal: 'Previously contacted · Due for follow-up',
      reengage: true,
      last_contacted: r.last_contacted
    }))

    return NextResponse.json({
      success: true,
      suggestions: newSuggestions,
      reengageSuggestions
    })

  } catch (error) {
    console.error('Suggestions error:', error)
    return NextResponse.json({ error: 'Failed to generate suggestions' }, { status: 500 })
  }
}