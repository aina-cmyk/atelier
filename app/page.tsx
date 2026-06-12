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

interface Suggestion {
  brand_name: string
  category: string
  reason: string
  signal: string
  reengage?: boolean
  last_contacted?: string
}

export default function Dashboard() {
  const [brandName, setBrandName] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [error, setError] = useState('')
  const [searchedBrand, setSearchedBrand] = useState('')
  const [leads, setLeads] = useState<Lead[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [savedSuggestions, setSavedSuggestions] = useState<Suggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false)
  const [reengageSuggestions, setReengageSuggestions] = useState<Suggestion[]>([])
  const [savingBrand, setSavingBrand] = useState<string | null>(null)
  const [savedBrands, setSavedBrands] = useState<Set<string>>(new Set())
  const router = useRouter()

  useEffect(() => {
    async function init() {
      try {
        const [pipelineRes, savedRes] = await Promise.all([
          fetch('/api/pipeline'),
          fetch('/api/saved-suggestions')
        ])
        const pipelineData = await pipelineRes.json()
        const savedData = await savedRes.json()
        if (pipelineData.success) setLeads(pipelineData.leads)
        if (savedData.success) {
          setSavedSuggestions(savedData.suggestions)
          setSavedBrands(new Set(savedData.suggestions.map((s: Suggestion) => s.brand_name)))
        }
      } catch {
        // silent fail
      }
    }
    init()
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

  async function fetchSuggestions() {
    setLoadingSuggestions(true)
    setSuggestionsLoaded(false)
    try {
      const excludeBrands = leads.map(l => l.brand_name)
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludeBrands })
      })
      const data = await res.json()
      if (data.success) {
        setSuggestions(data.suggestions)
        setReengageSuggestions(data.reengageSuggestions ?? [])
        setSuggestionsLoaded(true)
      }
    } catch {
      console.error('Failed to fetch suggestions')
    } finally {
      setLoadingSuggestions(false)
    }
  }

  async function handleSaveSuggestion(s: Suggestion) {
    setSavingBrand(s.brand_name)
    try {
      const res = await fetch('/api/saved-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s)
      })
      if (res.ok) {
        setSavedBrands(prev => new Set([...prev, s.brand_name]))
        setSavedSuggestions(prev => [s, ...prev.filter(x => x.brand_name !== s.brand_name)])
      }
    } catch {
      console.error('Failed to save suggestion')
    } finally {
      setSavingBrand(null)
    }
  }

  async function handleUnsaveSuggestion(brandName: string) {
    try {
      await fetch(`/api/saved-suggestions?brand_name=${encodeURIComponent(brandName)}`, { method: 'DELETE' })
      setSavedBrands(prev => { const n = new Set(prev); n.delete(brandName); return n })
      setSavedSuggestions(prev => prev.filter(s => s.brand_name !== brandName))
    } catch {
      console.error('Failed to unsave suggestion')
    }
  }

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

  async function handleLeadClick(lead: Lead) {
    localStorage.removeItem('selected_contact')
    localStorage.removeItem('email_template')
    localStorage.removeItem('lead_source')

    const cached = localStorage.getItem('current_dossier')
    if (cached) {
      const d = JSON.parse(cached)
      if (d.brand_name?.toLowerCase() === lead.brand_name?.toLowerCase()) {
        router.push('/dossier')
        return
      }
    }

    setLoading(true)
    setSearchedBrand(lead.brand_name)

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_name: lead.brand_name })
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem('current_dossier', JSON.stringify(data.dossier))
        router.push('/dossier')
      }
    } catch {
      setError('Failed to load dossier.')
      setLoading(false)
    }
  }

  async function handleSuggestionClick(suggestion: Suggestion) {
    setLoading(true)
    setSearchedBrand(suggestion.brand_name)
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_name: suggestion.brand_name })
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem('current_dossier', JSON.stringify(data.dossier))
        router.push('/dossier')
      }
    } catch {
      setError('Failed to load dossier.')
      setLoading(false)
    }
  }

  function getBandClass(band: string) {
    const normalised = band.trim().charAt(0).toUpperCase() + band.trim().slice(1).toLowerCase()
    const classes: Record<string, string> = {
      Hot: 'band band-hot',
      Warm: 'band band-warm',
      Watch: 'band band-watch',
      Pass: 'band band-pass',
    }
    return classes[normalised] ?? 'band band-watch'
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
          className="btn btn-primary"
          style={{ height: 52, padding: '0 28px', fontSize: 15, flexShrink: 0 }}
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

      <div style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="section-label" style={{ marginBottom: 0 }}>Suggested Brands</div>
          <button
            onClick={fetchSuggestions}
            disabled={loadingSuggestions}
            className="btn btn-secondary btn-sm"
          >
            {loadingSuggestions ? 'Finding brands...' : suggestionsLoaded ? 'Refresh' : 'Get suggestions'}
          </button>
        </div>

        {loadingSuggestions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--slate-400)', fontSize: 13, padding: '16px 0' }}>
            <div className="spinner" />
            Searching for brands that match your ICP...
          </div>
        )}

        {!loadingSuggestions && !suggestionsLoaded && savedSuggestions.length === 0 && (
          <div className="card-hair" style={{ padding: '24px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--slate-400)', marginBottom: 12 }}>
              Get AI-powered brand suggestions based on your ICP criteria.
            </div>
            <button onClick={fetchSuggestions} className="btn btn-primary btn-sm">
              Get suggestions
            </button>
          </div>
        )}

        {savedSuggestions.length > 0 && !suggestionsLoaded && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--slate-400)', marginBottom: 10 }}>Saved for later</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {savedSuggestions.map((s, i) => (
                <SuggestionCard
                  key={i}
                  suggestion={s}
                  saved={true}
                  saving={savingBrand === s.brand_name}
                  onResearch={() => handleSuggestionClick(s)}
                  onSave={() => handleUnsaveSuggestion(s.brand_name)}
                  saveLabel="Unsave"
                />
              ))}
            </div>
          </div>
        )}
        {suggestionsLoaded && reengageSuggestions.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--orange-400)', marginBottom: 10 }}>
              ↻ Due for re-engagement ({reengageSuggestions.length})
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {reengageSuggestions.map((s, i) => (
                <SuggestionCard
                  key={i}
                  suggestion={s}
                  saved={savedBrands.has(s.brand_name)}
                  saving={savingBrand === s.brand_name}
                  onResearch={() => handleSuggestionClick(s)}
                  onSave={() => savedBrands.has(s.brand_name) ? handleUnsaveSuggestion(s.brand_name) : handleSaveSuggestion(s)}
                  saveLabel={savedBrands.has(s.brand_name) ? 'Saved ✓' : 'Save'}
                  reengage
                />
              ))}
            </div>
          </div>
        )}
        {suggestionsLoaded && suggestions.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {suggestions.map((s, i) => (
              <SuggestionCard
                key={i}
                suggestion={s}
                saved={savedBrands.has(s.brand_name)}
                saving={savingBrand === s.brand_name}
                onResearch={() => handleSuggestionClick(s)}
                onSave={() => savedBrands.has(s.brand_name) ? handleUnsaveSuggestion(s.brand_name) : handleSaveSuggestion(s)}
                saveLabel={savedBrands.has(s.brand_name) ? 'Saved ✓' : 'Save'}
              />
            ))}
          </div>
        )}
      </div>

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
                <tr key={i} className="clickable" onClick={() => handleLeadClick(lead)}>
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

function SuggestionCard({ suggestion, saved, saving, onResearch, onSave, saveLabel, reengage }: {
  suggestion: Suggestion
  saved: boolean
  saving: boolean
  onResearch: () => void
  onSave: () => void
  saveLabel: string
  reengage?: boolean
}) {
  return (
    <div
      className="card-hair"
      style={{
        padding: '16px', display: 'flex', flexDirection: 'column', gap: 8,
        borderColor: reengage ? 'var(--orange-300)' : undefined,
        background: reengage ? 'var(--orange-100)' : undefined
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-default)', marginBottom: 2 }}>{suggestion.brand_name}</div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--slate-400)' }}>{suggestion.category}</div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onSave() }}
          disabled={saving}
          style={{
            background: saved ? 'var(--green-100)' : 'var(--slate-100)',
            border: saved ? '1px solid var(--green-300)' : '1px solid var(--black-100)',
            color: saved ? 'var(--green-400)' : 'var(--slate-500)',
            borderRadius: 'var(--radius-xs)',
            fontSize: 11, fontWeight: 500,
            padding: '3px 8px', cursor: 'pointer',
            flexShrink: 0, whiteSpace: 'nowrap'
          }}
        >
          {saving ? '...' : saveLabel}
        </button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--slate-500)', lineHeight: 1.4 }}>{suggestion.reason}</div>
      <div style={{ fontSize: 11, color: 'var(--brand-400)', fontWeight: 500, background: 'var(--brand-100)', padding: '3px 8px', borderRadius: 4, display: 'inline-block' }}>
        {suggestion.signal}
      </div>
      <button
        onClick={onResearch}
        className="btn btn-primary btn-sm"
        style={{ width: '100%', marginTop: 4 }}
      >
        Research brand
      </button>
    </div>
  )
}