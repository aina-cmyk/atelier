import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const RATE_PER_MILLION_INPUT = 3.00
const RATE_PER_MILLION_OUTPUT = 15.00

const MESSAGE_MATRIX: Record<string, { focus: string; proofPoints: string }> = {
  CFO: {
    focus: 'Operating margin uplift and cost efficiency of outsourced manufacturing',
    proofPoints: 'Revenue scale, capital deployed in product development'
  },
  COO: {
    focus: 'Capacity without headcount and operational scale',
    proofPoints: 'SKU complexity, portfolio breadth, growth trajectory'
  },
  CMO: {
    focus: 'Speed to market — moving at the speed of culture',
    proofPoints: 'Launch cadence, category trends, competitive context'
  },
  CEO: {
    focus: 'More products to market faster and topline revenue growth',
    proofPoints: 'Funding, retail expansion, acquisition activity'
  }
}

function buildEmailPrompt(dossier: Record<string, unknown>, role: string, contactName: string): string {
  const matrix = MESSAGE_MATRIX[role]
  const retailers = (dossier.retailers as { name: string }[])?.map(r => r.name).join(', ') ?? 'Unknown'
  const signals = (dossier.signals as { type: string; description: string }[])
    ?.slice(0, 3)
    .map(s => s.type + ': ' + s.description)
    .join('\n') ?? ''

  return 'You are writing a cold outreach email on behalf of Atelier, an ANZ contract manufacturer serving beauty, health, and wellness brands. Atelier helps brands get more products to market faster by providing outsourced manufacturing capacity.\n\n' +
    'Write a short, direct, personalised cold outreach email to a senior executive at a brand Atelier is considering approaching.\n\n' +
    'RECIPIENT\n' +
    'Name: ' + contactName + '\n' +
    'Role: ' + role + '\n' +
    'Brand: ' + dossier.brand_name + '\n' +
    'Revenue (estimated): ' + (dossier.revenue_estimate ?? 'Unknown') + '\n' +
    'Retail presence: ' + retailers + '\n\n' +
    'BRAND SIGNALS (reference at least two in the email body)\n' +
    signals + '\n\n' +
    'ROLE-SPECIFIC MESSAGE FOCUS\n' +
    'This executives primary concern is: ' + matrix.focus + '\n' +
    'The most relevant proof points for this role are: ' + matrix.proofPoints + '\n\n' +
    'EMAIL GUIDELINES\n' +
    'Tone: direct, peer-to-peer, confident but not pushy.\n' +
    'Length: 4-6 sentences maximum. No bullet points in the email body.\n' +
    'Structure:\n' +
    '1. One opening sentence referencing something specific and real about the brand\n' +
    '2. One or two sentences connecting that signal to the roles primary concern\n' +
    '3. One sentence positioning Atelier as the solution\n' +
    '4. One clear call to action — a 15-minute call\n\n' +
    'Signature: sign off as "The Atelier team"\n' +
    'Subject line: short and specific, reference the brand or signal\n\n' +
    'OUTPUT FORMAT\n' +
    'Return valid JSON only. No preamble, no markdown fences. Begin with { and end with }.\n' +
    '{ "subject": "string", "body": "string" }'
}

function runTrustGate(body: string, dossier: Record<string, unknown>): boolean {
  const bodyLower = body.toLowerCase()
  const brandName = (dossier.brand_name as string)?.toLowerCase() ?? ''
  return brandName.length > 2 && bodyLower.includes(brandName)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { dossier, role, contact_name } = body

    if (!dossier || !role || !contact_name) {
      return NextResponse.json(
        { error: 'dossier, role, and contact_name are required' },
        { status: 400 }
      )
    }

    const prompt = buildEmailPrompt(dossier, role, contact_name)

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })

    const inputTokens = response.usage.input_tokens
    const outputTokens = response.usage.output_tokens
    const estimatedCost =
      (inputTokens / 1_000_000) * RATE_PER_MILLION_INPUT +
      (outputTokens / 1_000_000) * RATE_PER_MILLION_OUTPUT

    console.log('Email generation cost: $' + estimatedCost.toFixed(6) + ' USD')

    const rawText = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('')

    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Email generation failed — malformed response' },
        { status: 500 }
      )
    }

    let email
    try {
      email = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json(
        { error: 'Email generation failed — could not parse response' },
        { status: 500 }
      )
    }

    const passed = runTrustGate(email.body, dossier)
    if (!passed) {
      return NextResponse.json({
        success: false,
        warning: 'Insufficient brand data to personalise — verify research and retry.'
      })
    }

    return NextResponse.json({ success: true, email })

  } catch (error) {
    console.error('Email route error:', error)
    return NextResponse.json(
      { error: 'Email generation failed' },
      { status: 500 }
    )
  }
}