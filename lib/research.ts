import Anthropic from '@anthropic-ai/sdk'
import { normaliseBrandName, isVercel, getLocalDb } from './db'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const RATE_PER_MILLION_INPUT = 3.00
const RATE_PER_MILLION_OUTPUT = 15.00

export async function researchBrand(brandName: string) {
  const normalised = normaliseBrandName(brandName)

  if (isVercel) {
    const { sql } = await import('@vercel/postgres')
    const cached = await sql`SELECT dossier_json FROM dossiers WHERE brand_name_normalised = ${normalised}`
    if (cached.rows.length > 0) return JSON.parse(cached.rows[0].dossier_json)
  } else {
    const db = getLocalDb()
    const cached = db.prepare('SELECT dossier_json FROM dossiers WHERE brand_name_normalised = ?').get(normalised) as { dossier_json: string } | undefined
    if (cached) return JSON.parse(cached.dossier_json)
  }

  const prompt = buildResearchPrompt(brandName)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search'
      } as Parameters<typeof client.messages.create>[0]['tools'] extends Array<infer T> ? T : never
    ],
    messages: [{ role: 'user', content: prompt }]
  })

  const inputTokens = response.usage.input_tokens
  const outputTokens = response.usage.output_tokens
  const estimatedCost =
    (inputTokens / 1_000_000) * RATE_PER_MILLION_INPUT +
    (outputTokens / 1_000_000) * RATE_PER_MILLION_OUTPUT

  if (isVercel) {
    const { sql } = await import('@vercel/postgres')
    await sql`INSERT INTO usage_log (brand_name, call_type, input_tokens, output_tokens, rate_per_million_input, rate_per_million_output, estimated_cost_usd) VALUES (${brandName}, 'research', ${inputTokens}, ${outputTokens}, ${RATE_PER_MILLION_INPUT}, ${RATE_PER_MILLION_OUTPUT}, ${estimatedCost})`
  } else {
    const db = getLocalDb()
    db.prepare('INSERT INTO usage_log (brand_name, call_type, input_tokens, output_tokens, rate_per_million_input, rate_per_million_output, estimated_cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?)').run(brandName, 'research', inputTokens, outputTokens, RATE_PER_MILLION_INPUT, RATE_PER_MILLION_OUTPUT, estimatedCost)
  }

  const rawText = response.content
    .filter(block => block.type === 'text')
    .map(block => (block as { type: 'text'; text: string }).text)
    .join('')

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude returned malformed JSON — research failed')

  let dossier
  try {
    dossier = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error('Claude returned malformed JSON — research failed')
  }

  const maxScores: Record<string, number> = {
    annual_revenue: 35,
    retail_distribution: 20,
    order_viability: 20,
    product_category: 15,
    market_presence: 10
  }

  if (dossier.score_breakdown) {
    let total = 0
    for (const key of Object.keys(maxScores)) {
      dossier.score_breakdown[key] = Math.min(dossier.score_breakdown[key] ?? 0, maxScores[key])
      total += dossier.score_breakdown[key]
    }
    dossier.icp_score = total
    if (total >= 80) dossier.score_band = 'Hot'
    else if (total >= 60) dossier.score_band = 'Warm'
    else if (total >= 40) dossier.score_band = 'Watch'
    else dossier.score_band = 'Pass'
  }

  if (isVercel) {
    const { sql } = await import('@vercel/postgres')
    await sql`INSERT INTO dossiers (brand_name, brand_name_normalised, dossier_json) VALUES (${brandName}, ${normalised}, ${JSON.stringify(dossier)}) ON CONFLICT(brand_name_normalised) DO UPDATE SET dossier_json = ${JSON.stringify(dossier)}, updated_at = NOW()`
  } else {
    const db = getLocalDb()
    db.prepare('INSERT INTO dossiers (brand_name, brand_name_normalised, dossier_json) VALUES (?, ?, ?) ON CONFLICT(brand_name_normalised) DO UPDATE SET dossier_json = excluded.dossier_json, updated_at = datetime(\'now\')').run(brandName, normalised, JSON.stringify(dossier))
  }

  return dossier
}

function buildResearchPrompt(brandName: string): string {
  return 'You are a sales intelligence analyst specialising in the ANZ consumer packaged goods (CPG) market. Your job is to research a brand and produce a structured qualification dossier used by a contract manufacturer to decide whether to pursue outbound outreach.\n\n' +
    'The company you are researching for is Atelier — an ANZ contract manufacturer specialising in prestige beauty, skincare, haircare, and wellness product manufacturing. Atelier works with prestige and premium brands, not mass market FMCG. Their ideal client is a brand sold through Sephora, Mecca, David Jones, or equivalent prestige retailers globally.\n\n' +
    'Important: Always express revenue estimates in AUD. If the brand reports in USD or another currency, convert to AUD using an approximate current exchange rate and note the conversion. If you cannot find a credible revenue figure from press, filings, or news — return null for revenue_estimate and "low" for revenue_confidence. Never fabricate or guess a revenue number.\n\n' +
    'CRITICAL REVENUE INSTRUCTION: You must find a credible, sourced revenue figure for this brand. Search for recent news articles, acquisition filings, parent company annual reports, or analyst estimates. For brands owned by large conglomerates, check the parent company annual report for divisional revenue. If after searching you still cannot find a verifiable figure, set revenue_estimate to null and revenue_confidence to "low".\n\n' +
    'Use web search to find the most current and accurate information. Search for:\n' +
    '- The brand\'s annual revenue\n' +
    '- Which prestige retailers stock the brand — specifically: Mecca, Sephora AU, Sephora globally, David Jones, ADORE Beauty, Net-a-Porter, Harrods, Selfridges, Space NK\n' +
    '- Also check: Coles, Woolworths, Target AU/NZ, Chemist Warehouse\n' +
    '- Recent funding rounds\n' +
    '- LinkedIn job postings in NPD, innovation, formulation\n' +
    '- Recent product launches and SKU expansions\n' +
    '- Market presence across ANZ and internationally\n\n' +
    'Brand name: ' + brandName + '\n\n' +
    '---\n\n' +
    'SCORING RUBRIC\n\n' +
    '1. Annual Revenue — max 35 points\n' +
    '   - AUD $200M+: 35 | $100M–$199M: 28 | $50M–$99M: 21 | $20M–$49M: 10 | Under $20M: 0\n\n' +
    '2. Retail Distribution — max 20 points\n' +
    '   - 3+ prestige retailers globally: 20 | 2 prestige retailers: 14 | 1 prestige retailer or mass market only: 7 | DTC only: 0\n\n' +
    '3. Order Viability — max 20 points\n' +
    '   - Door count (8pts) + Funding signals (7pts) + NPD hiring/launches (5pts)\n\n' +
    '4. Product Category Fit — max 15 points\n' +
    '   - Core (skincare/haircare/colour/body): 15 | Good (wellness/fragrance): 10 | Partial: 5 | Poor: 0\n\n' +
    '5. Market Presence — max 10 points\n' +
    '   - AU+NZ+2 international: 10 | AU+NZ: 7 | AU only: 4 | No ANZ: 0\n\n' +
    'Score bands: 80–100 Hot, 60–79 Warm, 40–59 Watch, 0–39 Pass\n\n' +
    '---\n\n' +
    'OUTPUT: Valid JSON only. No preamble, no markdown fences.\n\n' +
    '{\n' +
    '  "brand_name": "string",\n' +
    '  "website": "string | null",\n' +
    '  "revenue_estimate": "string | null",\n' +
    '  "revenue_confidence": "high | medium | low",\n' +
    '  "revenue_source": "string | null",\n' +
    '  "retailers": [{ "name": "string", "confidence": "high | medium | low", "source": "string" }],\n' +
    '  "markets": ["string"],\n' +
    '  "category": "string",\n' +
    '  "sku_count_estimate": "string | null",\n' +
    '  "signals": [{ "type": "string", "description": "string (use **double asterisks** around key facts)", "source": "string" }],\n' +
    '  "icp_score": number,\n' +
    '  "score_breakdown": {\n' +
    '    "annual_revenue": number,\n' +
    '    "retail_distribution": number,\n' +
    '    "market_presence": number,\n' +
    '    "product_category": number,\n' +
    '    "order_viability": number\n' +
    '  },\n' +
    '  "score_explanations": {\n' +
    '    "annual_revenue": "string",\n' +
    '    "retail_distribution": "string",\n' +
    '    "market_presence": "string",\n' +
    '    "product_category": "string",\n' +
    '    "order_viability": "string"\n' +
    '  },\n' +
    '  "score_band": "Hot | Warm | Watch | Pass",\n' +
    '  "data_quality": "sufficient | insufficient"\n' +
    '}'
}