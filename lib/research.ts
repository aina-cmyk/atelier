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
  return 'You are a sales intelligence analyst specialising in the ANZ consumer packaged goods (CPG) market. Your job is to research a brand and produce a structured qualification dossier used by a contract manufacturing company to decide whether to pursue outbound outreach.\n\n' +
    'The company you are researching for is Atelier — an ANZ contract manufacturer serving beauty, health, and wellness brands. Atelier\'s ideal customer is a brand with $50M+ revenue, distribution in major retailers, multi-market presence, and signals of active product development.\n\n' +
    'Use web search to find the most current and accurate information about this brand. Search for:\n' +
    '- The brand\'s annual revenue (check recent press, funding announcements, and news articles)\n' +
    '- Which retailers stock the brand (check Mecca, Sephora AU, David Jones, ADORE Beauty, Coles, Woolworths, Target AU/NZ)\n' +
    '- Recent news, launches, funding rounds, and expansion announcements\n' +
    '- The brand\'s market presence and which countries they operate in\n' +
    '- Job postings and team size signals\n\n' +
    'Brand name: ' + brandName + '\n\n' +
    '---\n\n' +
    'SCORING RUBRIC\n\n' +
    'Score the brand across five hard criteria. Each criterion has a maximum score and a weight. Return numeric scores only — do not round up to be generous. If you cannot verify a criterion, score it 0 and flag it.\n\n' +
    'Hard criteria:\n\n' +
    '1. Annual Revenue — max 25 points (weight: high)\n' +
    '   Threshold: $50M+ AUD/NZD annual revenue\n' +
    '   Scoring guide:\n' +
    '   - $100M+: 25 points\n' +
    '   - $75M–$99M: 20 points\n' +
    '   - $50M–$74M: 15 points\n' +
    '   - $20M–$49M: 8 points (below threshold — flag)\n' +
    '   - Under $20M or unverifiable: 0 points\n\n' +
    '2. Retail Distribution — max 15 points (weight: medium)\n' +
    '   Threshold: stocked at Sephora, Mecca, or major ANZ/global retailers\n' +
    '   Scoring guide:\n' +
    '   - 3+ qualifying retailers (including global): 15 points\n' +
    '   - 2 qualifying retailers: 10 points\n' +
    '   - 1 qualifying retailer: 5 points\n' +
    '   - No qualifying retailers found: 0 points (flag)\n\n' +
    '3. Market Presence — max 15 points (weight: medium)\n' +
    '   Threshold: operating in AU + NZ minimum\n' +
    '   Scoring guide:\n' +
    '   - AU + NZ + at least one international market: 15 points\n' +
    '   - AU + NZ only: 10 points\n' +
    '   - AU only: 5 points\n' +
    '   - No ANZ presence confirmed: 0 points (flag)\n\n' +
    '4. Product Category — max 15 points (weight: low)\n' +
    '   Threshold: beauty, health, or wellness\n' +
    '   Scoring guide:\n' +
    '   - Core beauty/health/wellness: 15 points\n' +
    '   - Adjacent category: 8 points\n' +
    '   - Outside category: 0 points (flag)\n\n' +
    '5. Order Viability — max 30 points (weight: high)\n' +
    '   Threshold: signals of 5,000+ unit capacity\n' +
    '   Scoring guide:\n' +
    '   - Strong signals (10+ SKUs, 50+ employees, or explicit manufacturing mentions): 30 points\n' +
    '   - Moderate signals (5–9 SKUs or 20–49 employees): 20 points\n' +
    '   - Weak signals: 8 points\n' +
    '   - No signals found: 0 points\n\n' +
    'Total ICP score: sum of all five criteria (max 100).\n' +
    'Score bands: 80–100 Hot, 60–79 Warm, 40–59 Watch, 0–39 Pass\n\n' +
    '---\n\n' +
    'QUALIFYING SIGNALS\n\n' +
    'Identify any of the following if verifiable with a source:\n' +
    '- Recent funding ($100M+ round)\n' +
    '- SKU count / portfolio breadth\n' +
    '- Recent news: product launches, acquisitions, market expansion\n' +
    '- Job postings in product development, manufacturing, or supply chain\n' +
    '- Recent range reviews or new listings at key ANZ retailers\n' +
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
    '  "signals": [{ "type": "string", "description": "string", "source": "string" }],\n' +
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