import Anthropic from '@anthropic-ai/sdk'
import { getDb, normaliseBrandName } from './db'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const RATE_PER_MILLION_INPUT = 3.00
const RATE_PER_MILLION_OUTPUT = 15.00

export async function researchBrand(brandName: string) {
  const db = getDb()
  const normalised = normaliseBrandName(brandName)

  const cached = db.prepare(
    'SELECT dossier_json FROM dossiers WHERE brand_name_normalised = ?'
  ).get(normalised) as { dossier_json: string } | undefined

  if (cached) {
    return JSON.parse(cached.dossier_json)
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
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  })

  const inputTokens = response.usage.input_tokens
  const outputTokens = response.usage.output_tokens
  const estimatedCost =
    (inputTokens / 1_000_000) * RATE_PER_MILLION_INPUT +
    (outputTokens / 1_000_000) * RATE_PER_MILLION_OUTPUT

  db.prepare(`
    INSERT INTO usage_log
      (brand_name, call_type, input_tokens, output_tokens,
       rate_per_million_input, rate_per_million_output, estimated_cost_usd)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    brandName,
    'research',
    inputTokens,
    outputTokens,
    RATE_PER_MILLION_INPUT,
    RATE_PER_MILLION_OUTPUT,
    estimatedCost
  )

  const rawText = response.content
    .filter(block => block.type === 'text')
    .map(block => (block as { type: 'text'; text: string }).text)
    .join('')

  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Claude returned malformed JSON — research failed')
  }

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

  db.prepare(`
    INSERT INTO dossiers (brand_name, brand_name_normalised, dossier_json)
    VALUES (?, ?, ?)
    ON CONFLICT(brand_name_normalised) DO UPDATE SET
      dossier_json = excluded.dossier_json,
      updated_at = datetime('now')
  `).run(brandName, normalised, JSON.stringify(dossier))

  return dossier
}

function buildResearchPrompt(brandName: string): string {
  return 'You are a sales intelligence analyst specialising in the ANZ consumer packaged goods (CPG) market. Your job is to research a brand and produce a structured qualification dossier used by a contract manufacturer to decide whether to pursue outbound outreach.\n\n' +
    'The company you are researching for is Atelier — an ANZ contract manufacturer specialising in prestige beauty, skincare, haircare, and wellness product manufacturing. Atelier works with prestige and premium brands, not mass market FMCG. Their ideal client is a brand sold through Sephora, Mecca, David Jones, or equivalent prestige retailers globally.\n\n' +
    'Important: Always express revenue estimates in AUD. If the brand reports in USD or another currency, convert to AUD using an approximate current exchange rate and note the conversion. If you cannot find a credible revenue figure from press, filings, or news — return null for revenue_estimate and "low" for revenue_confidence. Never fabricate or guess a revenue number.\n\n' +
    'Use web search to find the most current and accurate information. Search for:\n' +
    '- The brand\'s annual revenue (check recent press, funding announcements, acquisition documents)\n' +
    '- Which prestige retailers stock the brand — specifically check: Mecca, Sephora AU, Sephora globally, David Jones, ADORE Beauty, Net-a-Porter, Harrods, Selfridges, Space NK\n' +
    '- Also check mass market: Coles, Woolworths, Target AU/NZ, Chemist Warehouse\n' +
    '- Recent funding rounds, especially for product development or range expansion\n' +
    '- LinkedIn job postings in innovation, product development, NPD, formulation, or manufacturing\n' +
    '- Recent product launches, SKU expansions, and new category entries\n' +
    '- The brand\'s market presence across ANZ and internationally\n\n' +
    'Brand name: ' + brandName + '\n\n' +
    'CRITICAL REVENUE INSTRUCTION: You must find a credible, sourced revenue figure for this brand. Search for recent news articles, acquisition filings, parent company annual reports, or analyst estimates. For brands owned by large conglomerates (e.g. MAC is owned by Estee Lauder), check the parent company annual report for divisional revenue. If after searching you still cannot find a verifiable figure with a specific source URL or publication, set revenue_estimate to null and revenue_confidence to "low". A null is always better than a fabricated number. Do not estimate based on store count or speculation.\n\n' +
    '---\n\n' +
    'SCORING RUBRIC\n\n' +
    'Score the brand across five criteria in order of importance. Do not exceed the maximum for each criterion.\n\n' +
    '1. Annual Revenue — max 35 points (HIGHEST weight)\n' +
    '   Always convert to AUD. Threshold: AUD $50M+\n' +
    '   Scoring guide:\n' +
    '   - AUD $200M+: 35 points\n' +
    '   - AUD $100M–$199M: 28 points\n' +
    '   - AUD $50M–$99M: 21 points\n' +
    '   - AUD $20M–$49M: 10 points (below threshold — flag)\n' +
    '   - Under AUD $20M or unverifiable: 0 points\n\n' +
    '   Important: If revenue cannot be verified from a credible source (press release, acquisition filing, news coverage, or analyst estimate), return revenue_estimate as null and revenue_confidence as "low". Never guess or fabricate a revenue figure. A null revenue with low confidence is better than an inaccurate number.\n\n' +
    '2. Retail Distribution — max 20 points (SECOND highest weight)\n' +
    '   Atelier serves prestige beauty brands. Prestige retail is the strongest signal. Mass market retail scores lower.\n' +
    '   Scoring guide:\n' +
    '   - Prestige retail (Sephora, Mecca, David Jones, Net-a-Porter, Harrods, Selfridges, Space NK) across 3+ retailers or globally: 20 points\n' +
    '   - Prestige retail across 2 retailers or strong single prestige retailer (e.g. Mecca nationally + online): 14 points\n' +
    '   - Single prestige retailer with limited doors OR mass market only (Coles, Woolworths, Chemist Warehouse, Target): 7 points\n' +
    '   - DTC only or no confirmed retail presence: 0 points\n\n' +
    '3. Order Viability — max 20 points (SECOND highest weight)\n' +
    '   Assesses whether this brand is likely to need significant manufacturing runs. Consider all signals together.\n\n' +
    '   Retail door count and brand scale (up to 8 points):\n' +
    '   - Stocked in 3+ prestige retailers globally with strong door count: 8 points\n' +
    '   - Stocked in 2 prestige retailers or strong single retailer nationally: 5 points\n' +
    '   - Limited retail presence or DTC: 2 points\n' +
    '   - No retail presence: 0 points\n\n' +
    '   Funding and investment signals (up to 7 points):\n' +
    '   - Recent funding (AUD $100M+) for product development or range expansion: 7 points\n' +
    '   - Recent funding (AUD $10M–$99M) or acquisition with growth mandate: 4 points\n' +
    '   - Bootstrapped but strong revenue signals: 2 points\n' +
    '   - No funding signals: 0 points\n\n' +
    '   Product development and innovation signals (up to 5 points):\n' +
    '   - Active LinkedIn hiring in NPD, innovation, formulation, or product development roles: 3 points\n' +
    '   - 3+ new product launches in last 12 months: 2 points\n\n' +
    '4. Product Category Fit — max 15 points (THIRD weight)\n' +
    '   Atelier\'s core manufacturing capabilities: skincare (face + body), haircare, colour cosmetics, wellness supplements, personal care.\n' +
    '   Scoring guide:\n' +
    '   - Core fit: skincare, haircare, colour cosmetics, or body care: 15 points\n' +
    '   - Good fit: wellness supplements, personal care, or fragrance: 10 points\n' +
    '   - Partial fit: adjacent health/wellness Atelier could manufacture: 5 points\n' +
    '   - Poor fit: food, beverage, apparel, or non-Atelier category: 0 points\n\n' +
    '5. Market Presence — max 10 points (LOWEST weight)\n' +
    '   Threshold: operating in AU + NZ minimum\n' +
    '   Scoring guide:\n' +
    '   - AU + NZ + 2+ international markets: 10 points\n' +
    '   - AU + NZ only: 7 points\n' +
    '   - AU only: 4 points\n' +
    '   - No ANZ presence confirmed: 0 points (flag)\n\n' +
    'Total ICP score: sum of all five criteria (max 100).\n' +
    'Score bands: 80–100 Hot, 60–79 Warm, 40–59 Watch, 0–39 Pass\n\n' +
    '---\n\n' +
    'QUALIFYING SIGNALS\n\n' +
    'Identify any of the following if verifiable. Use **double asterisks** around key facts, numbers, retailer names, and metrics:\n' +
    '- Recent funding or acquisition (include amount in AUD and stated purpose)\n' +
    '- SKU count and recent launches\n' +
    '- LinkedIn job postings in product development, NPD, innovation, formulation, or manufacturing\n' +
    '- Retail door count and key prestige retailers\n' +
    '- Market expansion announcements\n' +
    '- No existing contract manufacturer (inferred)\n\n' +
    '---\n\n' +
    'OUTPUT REQUIREMENTS\n\n' +
    'Return valid JSON only. No preamble, no explanation, no markdown fences. Begin with { and end with }.\n\n' +
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
    '  "signals": [{ "type": "string", "description": "string (use **double asterisks** around key facts, numbers, retailer names, and metrics)", "source": "string" }],\n' +
    '  "icp_score": number,\n' +
    '  "score_breakdown": {\n' +
    '    "annual_revenue": number,\n' +
    '    "retail_distribution": number,\n' +
    '    "market_presence": number,\n' +
    '    "product_category": number,\n' +
    '    "order_viability": number\n' +
    '  },\n' +
    '  "score_band": "Hot | Warm | Watch | Pass",\n' +
    '  "data_quality": "sufficient | insufficient"\n' +
    '}'
}
