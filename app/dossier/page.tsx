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
  score_explanations?: {
    annual_revenue?: string
    retail_distribution?: string
    market_presence?: string
    product_category?: string
    order_viability?: string
  }
  score_band: string
  data_quality: string
}

const CRITERIA = [
  { key: 'annual_revenue', label: 'Annual revenue', max: 35, weight: 'high', threshold: 'AUD $50M+' },
  { key: 'retail_distribution', label: 'Retail distribution', max: 20, weight: 'high', threshold: 'Prestige retail · Sephora · Mecca · David Jones' },
  { key: 'order_viability', label: 'Order viability', max: 20, weight: 'high', threshold: 'Doors · funding · NPD hiring · launches' },
  { key: 'product_category', label: 'Product category fit', max: 15, weight: 'medium', threshold: 'Skincare · haircare · colour · body care' },
  { key: 'market_presence', label: 'Market presence', max: 10, weight: 'medium', threshold: 'AU + NZ minimum' },
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
  const [leadSource, setLeadSource] = useState<string>('Outbound')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
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
    ? dossier.revenue_estimate.split('(')[0].split('.')[0].trim()
    : 'Unknown'

  const domain = dossier.website
    ? dossier.website.replace('https://', '').replace('http://', '').split('/')[0]
    : null

  function handleProceed() {
    localStorage.setItem('lead_source', leadSource)
    router.push('/contacts')
  }

  function handlePass() {
    localStorage.setItem('lead_source', leadSource)
    router.push('/')
  }

  async function handleSave() {
    if (!dossier) return
    setSaving(true)
    try {
      await fetch('/api/save-to-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_name: dossier.brand_name,
          website: dossier.website,
          lead_source: leadSource,
          revenue_estimate: dossier.revenue_estimate,
          retailers: dossier.retailers,
          category: dossier.category,
          icp_score: dossier.icp_score,
          score_band: dossier.score_band,
          signals: dossier.signals,
          target_role: '',
          contact_name: '',
          email_subject: '',
          email_body: '',
          status: 'Researched'
        })
      })
      setSaved(true)
    } catch {
      console.error('Save failed')
    } finally {
      setSaving(false)
    }
  }

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
        <div style={{ textAlign: 'right', width: 220, flexShrink: 0 }}>
          <div className="kv-label">Category</div>
          <div style={{ fontSize: 13, color: 'var(--text-default)', lineHeight: 1.4 }}>
            {dossier.category.split(/[,(]/)[0].trim().replace(/\.$/, '')}
          </div>
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
                  const explanation = dossier.score_explanations?.[c.key as keyof typeof dossier.score_explanations]
                  return (
                    <CriteriaRow
                      key={c.key}
                      label={c.label}
                      threshold={c.threshold}
                      val={val}
                      max={c.max}
                      pct={pct}
                      valColour={valColour}
                      weight={c.weight}
                      explanation={explanation}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
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
                <span key={i} className="tag" style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name.split('(')[0].trim()}
                </span>
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
            <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>
              {dossier.sku_count_estimate
                ? dossier.sku_count_estimate.match(/[\d,]+\+?/)?.[0] ?? dossier.sku_count_estimate.split(' ').slice(0, 3).join(' ')
                : 'Unknown'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--slate-400)' }}>active SKUs</div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div className="section-label">Key Signals</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {dossier.signals.map((s, i) => {
            const bullets = s.description.split(/\.\s+(?=[A-Z])/).filter(b => b.trim().length > 0).slice(0, 3)
            return (
              <div key={i} className="card-hair" style={{ padding: '14px 16px' }}>
                <div style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11, fontWeight: 700, color: 'var(--brand-400)', marginBottom: 8 }}>
                  {s.type.replace(/_/g, ' ')}
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {bullets.map((bullet, j) => (
                    <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-default)', lineHeight: 1.4 }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--slate-400)', flexShrink: 0, marginTop: 6 }} />
                      <span dangerouslySetInnerHTML={{ __html: bullet.trim().replace(/\.$/, '').replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600;color:var(--text-default)">$1</strong>') }} />
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card-hair" style={{ padding: '20px 24px', marginBottom: 16 }}>
        <div className="kv-label" style={{ marginBottom: 12 }}>Lead Source</div>
        <div className="role-row">
          {['Outbound', 'Inbound', 'Referral'].map(source => (
            <button
              key={source}
              onClick={() => setLeadSource(source)}
              className={`role-btn ${leadSource === source ? 'active' : ''}`}
            >
              {source}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={handleProceed} className="btn btn-primary" style={{ flex: 1 }}>
          Find contacts
        </button>
        <button onClick={handleSave} disabled={saving} className="btn btn-secondary" style={{ flex: 1 }}>
          {saving ? 'Saving...' : 'Save to pipeline'}
        </button>
        <button onClick={handlePass} className="btn btn-secondary" style={{ flex: 1 }}>
          Pass
        </button>
      </div>

      {saved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: 'var(--green-400)', fontSize: 13, fontWeight: 500 }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polyline points="20,6 9,17 4,12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Saved to pipeline as {leadSource}
        </div>
      )}
    </div>
  )
  function CriteriaRow({ label, threshold, val, max, pct, valColour, weight, explanation }: {
  label: string
  threshold: string
  val: number
  max: number
  pct: number
  valColour: string
  weight: string
  explanation?: string
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr
        onClick={() => explanation && setExpanded(!expanded)}
        style={{ cursor: explanation ? 'pointer' : 'default' }}
      >
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{label}</div>
              <div style={{ fontSize: 11, color: 'var(--slate-400)', marginTop: 2 }}>{threshold}</div>
            </div>
            {explanation && (
              <svg
                width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                style={{ color: 'var(--slate-400)', flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
              >
                <polyline points="6,9 12,15 18,9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        </td>
        <td>
          <div className="crit-bar">
            <span style={{ width: `${pct}%` }} />
          </div>
        </td>
        <td style={{ color: valColour, fontWeight: 500, fontSize: 13 }}>{val} / {max}</td>
        <td><span className={`weight-pill weight-${weight}`}>{weight}</span></td>
      </tr>
      {expanded && explanation && (
        <tr>
          <td colSpan={4} style={{ paddingTop: 0, paddingBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--slate-500)', background: 'var(--slate-100)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', lineHeight: 1.5 }}>
              {explanation}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
}