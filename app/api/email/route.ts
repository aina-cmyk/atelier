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
  },
  'VP Product': {
    focus: 'Scaling product development capacity without building in-house manufacturing',
    proofPoints: 'SKU complexity, NPD pipeline, new category expansion'
  },
  'VP Marketing': {
    focus: 'Speed to market and launch cadence to stay ahead of trends',
    proofPoints: 'Launch cadence, category trends, retail expansion'
  },
  'VP Operations': {
    focus: 'Operational efficiency and supply chain reliability',
    proofPoints: 'Manufacturing capacity, lead times, quality consistency'
  },
  'Head of NPD': {
    focus: 'Bringing new formulations to market faster with expert manufacturing partners',
    proofPoints: 'Formulation capabilities, SKU complexity, NPD support'
  },
  'Head of Marketing': {
    focus: 'Campaign-led product launches and speed to market',
    proofPoints: 'Launch cadence, retail expansion, brand building'
  }
}

function buildEmailPrompt(dossier: Record<string, unknown>, role: string, contactName: string, template?: { subject: string; body: string }, pitchBullet?: string, followUp?: { original_subject?: string; contact_name?: string; date_sent?: string }): string {
  const matrix = MESSAGE_MATRIX[role] ?? MESSAGE_MATRIX['CEO']
  const retailers = (dossier.retailers as { name: string }[])?.map(r => r.name).join(', ') ?? 'Unknown'
  const signals = (dossier.signals as { type: string; description: string }[])
    ?.slice(0, 3)
    .map(s => s.type + ': ' + s.description.replace(/\*\*/g, ''))
    .join('\n') ?? ''

  if (template) {
    return 'You are personalising a saved email template for a specific brand and contact on behalf of Atelier, an ANZ contract manufacturer.\n\n' +
      'SAVED TEMPLATE TO USE AS STYLE GUIDE:\n' +
      'Subject: ' + template.subject + '\n' +
      'Body:\n' + template.body + '\n\n' +
      'RECIPIENT\n' +
      'Name: ' + contactName + '\n' +
      'Role: ' + role + '\n' +
      'Brand: ' + dossier.brand_name + '\n' +
      'Revenue (estimated): ' + (dossier.revenue_estimate ?? 'Unknown') + '\n' +
      'Retail presence: ' + retailers + '\n\n' +
      'BRAND SIGNALS (weave at least two into the email)\n' +
      signals + '\n\n' +
      (pitchBullet ? `PRIORITY TALKING POINT — weave this specific point naturally into the email:\n"${pitchBullet}"\n\n` : '') +
      'INSTRUCTIONS\n' +
      'Rewrite the template above, keeping the same tone, structure, and length. Replace any generic placeholders with real brand-specific facts from the signals above. Keep the subject line style but make it specific to this brand. Address the recipient by first name.\n\n' +
      'OUTPUT FORMAT\n' +
      'Return valid JSON only. No preamble, no markdown fences. Begin with { and end with }.\n' +
      '{ "subject": "string", "body": "string" }'
  }

  return 'You are writing a cold outreach email on behalf of Atelier, an ANZ contract manufacturer serving prestige beauty, skincare, haircare, and wellness brands.\n\n' +
    'RECIPIENT\n' +
    'Name: ' + contactName + '\n' +
    'Role: ' + role + '\n' +
    'Brand: ' + dossier.brand_name + '\n' +
    'Revenue (estimated): ' + (dossier.revenue_estimate ?? 'Unknown') + '\n' +
    'Retail presence: ' + retailers + '\n\n' +
    'BRAND SIGNALS (open with the strongest one)\n' +
    signals + '\n\n' +
    'ROLE-SPECIFIC MESSAGE FOCUS\n' +
    'This executives primary concern is: ' + matrix.focus + '\n' +
    'Key proof points: ' + matrix.proofPoints + '\n\n' +
    (pitchBullet ? `PRIORITY TALKING POINT — weave this specific point naturally into the email:\n"${pitchBullet}"\n\n` : '') +
    (followUp ? `FOLLOW-UP CONTEXT — this is a follow-up email. The original email was sent on ${followUp.date_sent ?? 'a few days ago'} with subject "${followUp.original_subject ?? 'our previous email'}". Do NOT repeat the same pitch. Instead reference the previous outreach briefly and offer a new angle or insight.\n\n` : '') +
    'EMAIL STRUCTURE — follow this exactly, 3 paragraphs, 100 words maximum:\n' +
    'Paragraph 1 (1-2 sentences): Open with a specific buying signal — a recent launch, retail expansion, funding round, or growth indicator. Do NOT open with company stats or "I noticed...". Make it feel like you\'ve done your homework.\n' +
    'Paragraph 2 (2-3 sentences): Connect that signal to why Atelier is relevant. Reference the executives specific responsibility. Introduce Atelier naturally — one prestige credential only.\n' +
    'Paragraph 3 (1 sentence): Soft CTA — offer a brief call, no pressure.\n\n' +
    'TONE: Conversational but professional. Write like a human, not a press release. No bullet points. No jargon. Address recipient by first name.\n' +
    'SUBJECT LINE: Specific and curiosity-driven. Reference the brand or a signal. Under 8 words.\n\n' +
    'OUTPUT FORMAT\n' +
    'Return valid JSON only. No preamble, no markdown fences. Begin with { and end with }.\n' +
    '{ "subject": "string", "body": "string" }'
}

function runTrustGate(body: string, dossier: Record<string, unknown>): boolean {
  const bodyLower = body.toLowerCase()
  const brandName = (dossier.brand_name as string)?.toLowerCase() ?? ''
  const words = brandName.split(' ').filter(w => w.length > 3)
  if (brandName.length <= 2) return true
  return words.some(word => bodyLower.includes(word))
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.pitch_only) {
      const dossier = body.dossier
      const signals = (dossier.signals ?? []).slice(0, 3).map((s: {description: string}) => s.description).join(' ')
      const pitchRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `You are a B2B sales strategist for Atelier, an ANZ contract manufacturer for prestige beauty brands. Based on this brand research, write 2-3 sentences suggesting the best pitch angle for outreach. Be specific — reference actual signals, retailers, and growth indicators. Write in second person as if briefing a sales rep. Brand: ${dossier.brand_name}. ICP Score: ${dossier.icp_score} (${dossier.score_band}). Revenue: ${dossier.revenue_estimate ?? 'unknown'}. Retailers: ${(dossier.retailers ?? []).map((r: {name: string}) => r.name).join(', ')}. Key signals: ${signals}. Write only the pitch angle sentences. No preamble.`
          }]
        })
      })
      const pitchData = await pitchRes.json()
      const pitch = pitchData.content?.[0]?.text ?? ''
      return NextResponse.json({ success: true, pitch_angle: pitch })
    }

    const { dossier, role, contact_name, template, pitch_bullet, follow_up } = body

    if (!dossier || !role || !contact_name) {
      return NextResponse.json(
        { error: 'dossier, role, and contact_name are required' },
        { status: 400 }
      )
    }

    const prompt = buildEmailPrompt(dossier, role, contact_name, template, pitch_bullet, follow_up)

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