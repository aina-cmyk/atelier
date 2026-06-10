'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const STEPS = [
  'Scanning web & news presence',
  'Matching against your ICP',
  'Detecting buying signals',
  'Estimating revenue & retail footprint',
  'Locating decision-maker contacts',
]

interface Lead {
  brand_name: string
  icp_score: string
  score_band: string
  lead_source: string
  status: string
  date_added: string
}

export default function Dashboard() {
  const [brandName, setBrandName] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [error, setError] = useState('')
  const [searchedBrand, setSearchedBrand] = useState('')
  const [leads, setLeads] = useState<Lead[]>([])
  const router = useRouter()

  useEffect(() => {
    async function fetchLeads() {
      try {
        const res = await fetch('/api/pipeline')
        const data = await res.json()
        if (data.success) setLeads(data.leads)
      } catch {
        // silent fail
      }
    }
    fetchLeads()
  }, [])

  useEffect(() => {
    if (!loading) return
    setCurrentStep(0)
    const timings = [0, 4000, 9000, 14000, 19000]
    const timers = timings.map((delay, i) =>
      setTimeout(() => setCurrentStep(i), delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [loading])

  async function handleResearch() {
    if (!brandName.trim()) return
    setLoading(true)
    setError('')
    setSearchedBrand(brandName.trim())

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_name: brandName.trim() })
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        setError('Research failed. Please try again.')
        setLoading(false)
        return
      }

      localStorage.setItem('current_dossier', JSON.stringify(data.dossier))
      router.push('/dossier')

    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  function getBandClass(band: string) {
    const classes: Record<string, string> = {
      Hot: 'band band-hot',
      Warm: 'band band-warm',
      Watch: 'band band-watch',
      Pass: 'band band-pass',
    }
    return classes[band] ?? 'band band-watch'
  }

  function getScoreColour(score: string) {
    const n = parseInt(score)
    if (n >= 80) return 'var(--green-400)'
    if (n >= 60) return 'var(--orange-400)'
    return 'var(--red-500)'
  }

  function getStatusDot(status: string) {
    const dots: Record<string, string> = {
      Sent: 'dot-sent',
      Researched: 'dot-researched',
      Qualified: 'dot-qualified',
      Passed: 'dot-passed',
      Skipped: 'dot-researched',
    }
    return dots[status] ?? 'dot-researched'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 60 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div className="page-eyebrow">Research</div>
          <h1 style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.5px', margin: '0 0 8px' }}>
            Researching {searchedBrand}…
          </h1>
          <p className="page-sub">Building a fresh dossier from public signals.</p>
        </div>

        <div className="card" style={{ width: '100%', maxWidth: 520 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {STEPS.map((step, i) => {
              const done = i < currentStep
              const active = i === currentStep
              const pending = i > currentStep

              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {done && (
                      <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--green-400)' }}>
                        <polyline points="20,6 9,17 4,12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    {active && <div className="spinner" />}
                    {pending && (
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--slate-300)' }} />
                    )}
                  </div>
                  <div style={{
                    fontSize: 15,
                    fontWeight: active ? 500 : 400,
                    color: done ? 'var(--text-default)' : active ? 'var(--text-default)' : 'var(--slate-400)',
                    transition: 'color 0.3s ease'
                  }}>
                    {step}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-eyebrow">Dashboard</div>
      <h1 className="page-title">Research a prospect brand</h1>
      <p className="page-sub">Score any ANZ consumer brand against your ICP, surface buying signals, and find the right contact.</p>

      <div style={{ height: 32 }} />

      <div className="search-row" style={{ marginBottom: 40 }}>
        <div className="search-input-wrap">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" strokeWidth="2"/>
            <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            value={brandName}
            onChange={e => setBrandName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleResearch()}
            placeholder="Enter brand name to research..."
            className="search-input"
          />
        </div>
        <button
          onClick={handleResearch}
          disabled={loading || !brandName.trim()}
          className="btn btn-primary search-btn"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" strokeWidth="2"/>
            <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          Search
        </button>
      </div>

      {error && (
        <div className="data-warning" style={{ marginBottom: 24 }}>
          {error}
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="section-label" style={{ marginBottom: 0 }}>Recent Leads</div>
          <div style={{ fontSize: 13, color: 'var(--slate-400)' }}>{leads.length} {leads.length === 1 ? 'brand' : 'brands'}</div>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Brand Name</th>
                <th>ICP Score</th>
                <th>Score Band</th>
                <th>Lead Source</th>
                <th>Status</th>
                <th>Date Added</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px 13px', color: 'var(--slate-400)', fontSize: 13 }}>
                    No leads yet. Search for a brand above to get started.
                  </td>
                </tr>
              )}
              {leads.map((lead, i) => (
                <tr key={i} className="clickable" onClick={() => router.push('/pipeline')}>
                  <td className="cell-brand">{lead.brand_name}</td>
                  <td className="cell-score" style={{ color: getScoreColour(lead.icp_score) }}>
                    {lead.icp_score}
                  </td>
                  <td>
                    <span className={getBandClass(lead.score_band)}>{lead.score_band}</span>
                  </td>
                  <td style={{ color: 'var(--slate-500)', fontSize: 13 }}>{lead.lead_source}</td>
                  <td>
                    <div className="status">
                      <span className={`dot ${getStatusDot(lead.status)}`} />
                      {lead.status}
                    </div>
                  </td>
                  <td style={{ color: 'var(--slate-500)', fontSize: 13 }}>{lead.date_added}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}