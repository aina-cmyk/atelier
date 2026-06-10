'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Dossier {
  brand_name: string
  website: string | null
  revenue_estimate: string | null
  revenue_confidence: string
  retailers: { name: string; confidence: string }[]
  markets: string[]
  category: string
  sku_count_estimate: string | null
  signals: { type: string; description: string; source: string }[]
  icp_score: number
  score_breakdown: {
    annual_revenue: number
    retail_distribution: number
    market_presence: number
    product_category: number
    order_viability: number
  }
  score_band: string
  data_quality: string
}

const CRITERIA = [
  { key: 'annual_revenue', label: 'Annual revenue', max: 25, weight: 'high', threshold: '$50M+' },
  { key: 'retail_distribution', label: 'Retail distribution', max: 15, weight: 'medium', threshold: 'Sephora · Mecca · major ANZ/global retailers' },
  { key: 'market_presence', label: 'Market presence', max: 15, weight: 'medium', threshold: 'Multi-market (AU + NZ min.)' },
  { key: 'product_category', label: 'Product category', max: 15, weight: 'low', threshold: 'Beauty, health or wellness' },
  { key: 'order_viability', label: 'Order viability', max: 30, weight: 'high', threshold: '5,000+ unit capacity signal' },
]

function BrandLogo({ name, domain }: { name: string; domain: string | null }) {
  const [failed, setFailed] = useState(false)
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  if (!domain || failed) {
    return (
      <div style={{
        width: 44, height: 44, borderRadius: 8,
        background: 'var(--brand-100)', border: '1px solid var(--brand-200)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 600, color: 'var(--brand-400)', flexShrink: 0
      }}>
        {initials}
      </div>
    )
  }

  return (
    <img
      src={`https://img.logo.dev/${domain}?token=pk_devtoken`}
      alt={name}
      style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'contain', border: '1px solid var(--black-100)', background: '#fff', padding: 4, flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  )
}

export default function DossierPage() {
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('current_dossier')
    if (!stored) { router.push('/'); return }
    setDossier(JSON.parse(stored))
  }, [router])

  if (!dossier) return null

  const bandClass = {
    Hot: 'band band-hot',
    Warm: 'band band-warm',
    Watch: 'band band-watch',
    Pass: 'band band-pass',
  }[dossier.score_band] ?? 'band band-watch'

  const scoreColour = dossier.icp_score >= 80
    ? 'var(--green-400)'
    : dossier.icp_score >= 60
    ? 'var(--orange-400)'
    : 'var(--red-500)'

  const revenueShort = dossier.revenue_estimate
    ? dossier.revenue_estimate.match(/\$[\d,.]+[MB]?[\s–\-~]+\$?[\d,.]+[MB]?|\$[\d,.]+[MB]+/)?.[0]
      ?? dossier.revenue_estimate.split(' ')[0]
    : 'Unknown'

  const domain = dossier.website
    ? dossier.website.replace('https://', '').replace('http://', '').split('/')[0]
    : null

  return (
    <div>
      <div className="page-eyebrow">Research</div>

      {dossier.data_quality === 'insufficient' && (
        <div className="data-warning" style={{ marginBottom: 20 }}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeWidth="2"/>
            <line x1="12" y1="9" x2="12" y2="13" strokeWidth="2" strokeLinecap="round"/>
            <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Limited ANZ data found. Verify before outreach.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <BrandLogo name={dossier.brand_name} domain={domain} />
          <h1 style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.5px', margin: 0 }}>{dossier.brand_name}</h1>
          <span className={bandClass}>{dossier.score_band}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="kv-label">Category</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{dossier.category}</div>
        </div>
      </div>

      {dossier.website && (
        <a href={dossier.website} target="_blank" rel="noreferrer"
          style={{ fontSize: 13, color: 'var(--slate-400)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 28 }}>
          {dossier.website.replace('https://', '')}
          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeWidth="2" strokeLinecap="round"/>
            <polyline points="15,3 21,3 21,9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="10" y1="14" x2="21" y2="3" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </a>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 48 }}>
          <div style={{ width: 160, flexShrink: 0 }}>
            <div className="kv-label">ICP Score</div>
            <div className="score-big" style={{ color: scoreColour }}>{dossier.icp_score}</div>
            <div style={{ fontSize: 16, color: 'var(--slate-400)' }}>/ 100</div>
            <div style={{ display: 'flex', gap: 3, marginTop: 12, marginBottom: 6 }}>
              {CRITERIA.map(c => {
                const val = dossier.score_breakdown[c.key as keyof typeof dossier.score_breakdown]
                const pct = val / c.max
                const bg = pct >= 0.8 ? 'var(--green-400)' : pct >= 0.5 ? 'var(--orange-400)' : 'var(--slate-300)'
                return <div key={c.key} style={{ height: 4, flex: 1, borderRadius: 2, background: bg }} />
              })}
            </div>
            <div style={{ fontSize: 11, color: 'var(--slate-400)' }}>{dossier.icp_score} of 100 across 5 criteria</div>
          </div>

          <div style={{ flex: 1 }}>
            <table className="crit-table">
              <thead>
                <tr>
                  <th>Criterion</th>
                  <th style={{ width: 110 }}>Score</th>
                  <th style={{ width: 80 }}>Achieved</th>
                  <th style={{ width: 80 }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {CRITERIA.map(c => {
                  const val = dossier.score_breakdown[c.key as keyof typeof dossier.score_breakdown]
                  const pct = (val / c.max) * 100
                  const valColour = pct >= 80 ? 'var(--green-400)' : pct >= 50 ? 'var(--orange-400)' : 'var(--red-500)'
                  return (
                    <tr key={c.key}>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{c.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--slate-400)', marginTop: 2 }}>{c.threshold}</div>
                      </td>
                      <td>
                        <div className="crit-bar">
                          <span style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td style={{ color: valColour, fontWeight: 500, fontSize: 13 }}>{val} / {c.max}</td>
                      <td><span className={`weight-pill weight-${c.weight}`}>{c.weight}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div className="section-label">Key Signals</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {dossier.signals.map((s, i) => (
            <div key={i} className="card-hair" style={{ padding: '14px 16px' }}>
              <div style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11, fontWeight: 500, color: 'var(--slate-400)', marginBottom: 6 }}>
                {s.type.replace(/_/g, ' ')}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.5 }}>
                {s.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-label">Brand Details</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32 }}>
          <div>
            <div className="kv-label">Revenue Estimate</div>
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>{revenueShort}</div>
            <div className={`confidence conf-${dossier.revenue_confidence}`}>
              <span className="dot" />
              {dossier.revenue_confidence.charAt(0).toUpperCase() + dossier.revenue_confidence.slice(1)} confidence
            </div>
          </div>
          <div>
            <div className="kv-label">Retailers</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {dossier.retailers.map((r, i) => (
                <span key={i} className="tag" style={{ fontSize: 12 }}>{r.name}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="kv-label">Markets</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {dossier.markets.slice(0, 4).map((m, i) => (
                <span key={i} className="tag" style={{ fontSize: 12 }}>{m}</span>
              ))}
              {dossier.markets.length > 4 && (
                <span className="tag" style={{ fontSize: 12, color: 'var(--slate-400)' }}>+{dossier.markets.length - 4}</span>
              )}
            </div>
          </div>
          <div>
            <div className="kv-label">SKU Count</div>
            <div style={{ fontSize: 13, color: 'var(--text-default)' }}>{dossier.sku_count_estimate ?? 'Unknown'}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => router.push('/contacts')} className="btn btn-primary" style={{ flex: 1 }}>
          Find contacts
        </button>
        <button onClick={() => router.push('/')} className="btn btn-secondary" style={{ flex: 1 }}>
          Pass — back to search
        </button>
      </div>
    </div>
  )
}