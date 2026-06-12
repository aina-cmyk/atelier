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
  }
}

function buildEmailPrompt(dossier: Record<string, unknown>, role: string, contactName: string, template?: { subject: string; body: string }): string {
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
      'INSTRUCTIONS\n' +
      'Rewrite the template above, keeping the same tone, structure, and length. Replace any generic placeholders with real brand-specific facts from the signals above. Keep the subject line style but make it specific to this brand. Address the recipient formally by their last name.\n\n' +
      'OUTPUT FORMAT\n' +
      'Return valid JSON only. No preamble, no markdown fences. Begin with { and end with }.\n' +
      '{ "subject": "string", "body": "string" }'
  }

  return 'You are writing a formal cold outreach email on behalf of Atelier, an ANZ contract manufacturer serving beauty, health, and wellness brands.\n\n' +
    'Write a professional, concise outreach email to a senior executive. The tone should be formal and business-appropriate.\n\n' +
    'RECIPIENT\n' +
    'Name: ' + contactName + '\n' +
    'Role: ' + role + '\n' +
    'Brand: ' + dossier.brand_name + '\n' +
    'Revenue (estimated): ' + (dossier.revenue_estimate ?? 'Unknown') + '\n' +
    'Retail presence: ' + retailers + '\n\n' +
    'BRAND SIGNALS (reference at least two in the email)\n' +
    signals + '\n\n' +
    'ROLE-SPECIFIC MESSAGE FOCUS\n' +
    'This executives primary concern is: ' + matrix.focus + '\n' +
    'Key proof points: ' + matrix.proofPoints + '\n\n' +
    'EMAIL GUIDELINES\n' +
    'Tone: formal, professional, and respectful. Address the recipient by their last name.\n' +
    'Length: 4-6 sentences. No bullet points in the body.\n' +
    'Structure:\n' +
    '1. Formal salutation: "Dear [Title] [Last Name],"\n' +
    '2. One sentence referencing a specific verifiable fact about the brand\n' +
    '3. One or two sentences connecting that fact to the executives responsibility\n' +
    '4. One sentence introducing Atelier\n' +
    '5. A professional call to action — a brief call at their convenience\n' +
    '6. Sign off: "Kind regards," then "The Atelier Team"\n\n' +
    'Subject line: formal and specific.\n\n' +
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
    const { dossier, role, contact_name, template } = body

    if (!dossier || !role || !contact_name) {
      return NextResponse.json(
        { error: 'dossier, role, and contact_name are required' },
        { status: 400 }
      )
    }

    const prompt = buildEmailPrompt(dossier, role, contact_name, template)

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