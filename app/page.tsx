'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

function getGreeting(name: string): string {
  const hour = parseInt(new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    hour12: false
  }).format(new Date()), 10)
  const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const firstName = name.split(' ')[0]
  return `Good ${period}, ${firstName}`
}

const CACHE_TTL = 24 * 60 * 60 * 1000

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, timestamp } = JSON.parse(raw) as { data: T; timestamp: number }
    if (Date.now() - timestamp > CACHE_TTL) return null
    return data
  } catch {
    return null
  }
}

function writeCache(key: string, data: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }))
  } catch {}
}

function relativeDate(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('/')
  if (parts.length !== 3) return dateStr
  const date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
  if (isNaN(date.getTime())) return dateStr
  const days = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return dateStr
}

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
  contact_name: string
  target_role: string
  email_subject: string
}

interface Suggestion {
  brand_name: string
  category: string
  reason: string
  signal: string
  reengage?: boolean
  last_contacted?: string
}

interface ActivityItem {
  text: string
  brand: string
  date: string
  icon: string
}

export default function Dashboard() {
  const [brandName, setBrandName] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [error, setError] = useState('')
  const [searchedBrand, setSearchedBrand] = useState('')
  const [leads, setLeads] = useState<Lead[]>([])
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [savedSuggestions, setSavedSuggestions] = useState<Suggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false)
  const [reengageSuggestions, setReengageSuggestions] = useState<Suggestion[]>([])
  const [savingBrand, setSavingBrand] = useState<string | null>(null)
  const [savedBrands, setSavedBrands] = useState<Set<string>>(new Set())
  const [competitorSignals, setCompetitorSignals] = useState<{brand?: string; competitor?: string; pipeline_brand?: string; signal_type: string; headline: string; why_it_matters: string; date: string}[]>([])
  const [loadingCompetitorSignals, setLoadingCompetitorSignals] = useState(false)
  const [competitorSignalsLoaded, setCompetitorSignalsLoaded] = useState(false)
  const [overdueLeads, setOverdueLeads] = useState<Lead[]>([])
  const [leadTimings, setLeadTimings] = useState<Record<string, {urgency: string; urgency_reason: string; recommended_day: string; signal_context: string | null}>>({})
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [marketPulse, setMarketPulse] = useState<{title: string; signal_type: string; summary: string; outreach_angle: string; urgency: string; date: string}[]>([])
  const [loadingMarketPulse, setLoadingMarketPulse] = useState(false)
  const [marketPulseLoaded, setMarketPulseLoaded] = useState(false)
  const [activeIntelTab, setActiveIntelTab] = useState<'industry' | 'market' | 'trends'>('industry')
  const [trendMatches, setTrendMatches] = useState<{trend: string; trend_summary: string; brand: string; match_reason: string; outreach_angle: string; momentum: string}[]>([])
  const [loadingTrends, setLoadingTrends] = useState(false)
  const [trendsLoaded, setTrendsLoaded] = useState(false)
  const [draftingBrand, setDraftingBrand] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([])
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [scheduledEmails, setScheduledEmails] = useState<{id: number; to_email: string; subject: string; brand_name: string; contact_name: string; scheduled_at: string; timezone?: string}[]>([])
  const router = useRouter()

  // Full-height layout: override .main overflow while on dashboard
  useEffect(() => {
    document.body.classList.add('dashboard-page')
    return () => document.body.classList.remove('dashboard-page')
  }, [])

  useEffect(() => {
    document.title = 'Dashboard — Atelier'
    fetch('/api/me').then(r => r.json()).then(data => {
      if (data.user?.name) setUserName(data.user.name)
    }).catch(() => {})
    async function init() {
      try {
        const [pipelineRes, savedRes, scheduledRes] = await Promise.all([
          fetch('/api/pipeline'),
          fetch('/api/saved-suggestions'),
          fetch('/api/schedule-email'),
        ])
        const pipelineData = await pipelineRes.json()
        const savedData = await savedRes.json()
        const scheduledData = await scheduledRes.json()
        if (scheduledData.success) setScheduledEmails(scheduledData.emails ?? [])
        if (pipelineData.success) {
          setLeads(pipelineData.leads)
          if (pipelineData.leads.length === 0) setShowOnboarding(true)
        }
        if (savedData.success) {
          setSavedSuggestions(savedData.suggestions)
          setSavedBrands(new Set(savedData.suggestions.map((s: Suggestion) => s.brand_name)))
        }
      } catch {
        // silent fail
      }
      // Auto-load industry signals (from cache if fresh)
      const cachedSignals = readCache<typeof competitorSignals>('cache_competitor_signals')
      if (cachedSignals) {
        setCompetitorSignals(cachedSignals)
        setCompetitorSignalsLoaded(true)
      } else {
        try {
          setLoadingCompetitorSignals(true)
          const signalsRes = await fetch('/api/competitor-signals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          })
          const signalsData = await signalsRes.json()
          if (signalsData.success) {
            setCompetitorSignals(signalsData.signals)
            setCompetitorSignalsLoaded(true)
            writeCache('cache_competitor_signals', signalsData.signals)
          }
        } catch {
          // silent fail
        } finally {
          setLoadingCompetitorSignals(false)
        }
      }
    }
    init()
    // Fetch team activity
    setLoadingActivity(true)
    fetch('/api/activity')
      .then(r => r.json())
      .then(data => { if (data.success) setActivityItems(data.activity) })
      .catch(() => {})
      .finally(() => setLoadingActivity(false))
  }, [])

  useEffect(() => {
    const history = JSON.parse(localStorage.getItem('search_history') ?? '[]') as string[]
    setSearchHistory(history)
  }, [])

  useEffect(() => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const overdue = leads.filter(lead => {
      if (lead.status !== 'Sent') return false
      const parts = lead.date_added.split('/')
      if (parts.length !== 3) return false
      const date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
      return date < sevenDaysAgo
    })
    setOverdueLeads(overdue)
    fetchLeadTimings(overdue)
  }, [leads])

  useEffect(() => {
    if (activeIntelTab === 'market' && !marketPulseLoaded) fetchMarketPulse()
    if (activeIntelTab === 'trends' && !trendsLoaded) fetchTrendMatches()
  }, [activeIntelTab])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setBrandName('')
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('.search-input')?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!loading) return
    setCurrentStep(0)
    const timings = [0, 4000, 9000, 14000, 19000]
    const timers = timings.map((delay, i) => setTimeout(() => setCurrentStep(i), delay))
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

  async function handleResearch(name?: string) {
    const target = (name ?? brandName).trim()
    if (!target) return
    setLoading(true)
    setError('')
    setSearchedBrand(target)
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_name: target })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError('Research failed — the brand may not have enough public data, or there was a connection issue. Please try again.')
        setLoading(false)
        return
      }
      localStorage.setItem('current_dossier', JSON.stringify(data.dossier))
      const history = JSON.parse(localStorage.getItem('search_history') ?? '[]') as string[]
      const updated = [target, ...history.filter(h => h !== target)].slice(0, 5)
      localStorage.setItem('search_history', JSON.stringify(updated))
      setSearchHistory(updated)
      router.push('/dossier')
    } catch {
      setError('Something went wrong. Check your internet connection and try again.')
      setLoading(false)
    }
  }

  async function draftEmailFromTrend(brandName: string, outreachAngle: string) {
    if (draftingBrand) return
    setDraftingBrand(brandName)
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_name: brandName })
      })
      const data = await res.json()
      if (!data.dossier) throw new Error('No dossier')
      localStorage.setItem('current_dossier', JSON.stringify(data.dossier))
      localStorage.setItem('pitch_bullet', outreachAngle)
      router.push('/email')
    } catch {
      setDraftingBrand(null)
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

  async function fetchLeadTimings(overdue: Lead[]) {
    if (overdue.length === 0) return
    const timings: Record<string, {urgency: string; urgency_reason: string; recommended_day: string; signal_context: string | null}> = {}
    await Promise.all(overdue.map(async lead => {
      try {
        const cached = localStorage.getItem('current_dossier')
        let dossier = null
        if (cached) {
          const d = JSON.parse(cached)
          if (d.brand_name?.toLowerCase() === lead.brand_name?.toLowerCase()) dossier = d
        }
        if (!dossier) return
        const res = await fetch('/api/outreach-timing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dossier, last_contacted: lead.date_added })
        })
        const data = await res.json()
        if (data.success) timings[lead.brand_name] = data.timing
      } catch {
        console.error('Failed to fetch timing for', lead.brand_name)
      }
    }))
    setLeadTimings(timings)
  }

  async function fetchTrendMatches(force = false) {
    if (loadingTrends) return
    if (!force) {
      const cached = readCache<typeof trendMatches>('cache_trend_matches')
      if (cached) { setTrendMatches(cached); setTrendsLoaded(true); return }
    }
    if (!force && trendsLoaded) return
    setLoadingTrends(true)
    try {
      const pipelineBrands = leads.map(l => ({
        brand_name: l.brand_name,
        category: l.score_band,
        key_signals: l.status
      }))
      const savedBrandsList = savedSuggestions.map(s => ({
        brand_name: s.brand_name,
        category: s.category,
        key_signals: s.signal
      }))
      const allBrands = [...pipelineBrands, ...savedBrandsList].filter(
        (b, i, arr) => arr.findIndex(x => x.brand_name === b.brand_name) === i
      )
      if (allBrands.length === 0) {
        setTrendsLoaded(true)
        return
      }
      const res = await fetch('/api/trend-matching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brands: allBrands })
      })
      const data = await res.json()
      if (data.success) {
        setTrendMatches(data.matches)
        setTrendsLoaded(true)
        writeCache('cache_trend_matches', data.matches)
      }
    } catch {
      console.error('Failed to fetch trend matches')
    } finally {
      setLoadingTrends(false)
    }
  }

  async function fetchMarketPulse(force = false) {
    if (loadingMarketPulse) return
    if (!force) {
      const cached = readCache<typeof marketPulse>('cache_market_pulse')
      if (cached) { setMarketPulse(cached); setMarketPulseLoaded(true); return }
    }
    if (!force && marketPulseLoaded) return
    setLoadingMarketPulse(true)
    try {
      const res = await fetch('/api/market-pulse')
      const data = await res.json()
      if (data.success) {
        setMarketPulse(data.signals)
        setMarketPulseLoaded(true)
        writeCache('cache_market_pulse', data.signals)
      }
    } catch {
      console.error('Failed to fetch market pulse')
    } finally {
      setLoadingMarketPulse(false)
    }
  }

  async function fetchCompetitorSignals(force = false) {
    if (loadingCompetitorSignals) return
    if (!force) {
      const cached = readCache<typeof competitorSignals>('cache_competitor_signals')
      if (cached) { setCompetitorSignals(cached); setCompetitorSignalsLoaded(true); return }
    }
    if (!force && competitorSignalsLoaded) return
    setLoadingCompetitorSignals(true)
    try {
      const res = await fetch('/api/competitor-signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (data.success) {
        setCompetitorSignals(data.signals)
        setCompetitorSignalsLoaded(true)
        writeCache('cache_competitor_signals', data.signals)
      }
    } catch {
      console.error('Failed to fetch industry signals')
    } finally {
      setLoadingCompetitorSignals(false)
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
      Hot: 'band band-hot', Warm: 'band band-warm', Watch: 'band band-watch', Pass: 'band band-pass',
    }
    return classes[normalised] ?? 'band band-watch'
  }

  function getStatusDot(status: string) {
    const dots: Record<string, string> = {
      Sent: 'dot-sent', Researched: 'dot-researched', Qualified: 'dot-qualified',
      Passed: 'dot-passed', Skipped: 'dot-researched',
    }
    return dots[status] ?? 'dot-researched'
  }

  function activityIcon(icon: string) {
    switch (icon) {
      case 'email':
        return <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" strokeWidth="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" strokeWidth="2"/></svg>
      case 'reply':
        return <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="9,17 4,12 9,7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M20 18v-2a4 4 0 0 0-4-4H4" strokeWidth="2" strokeLinecap="round"/></svg>
      case 'research':
        return <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" strokeWidth="2"/><path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round"/></svg>
      case 'qualify':
        return <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20,6 9,17 4,12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      case 'call':
        return <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.46 2 2 0 0 1 3.59 1.28h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.89a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16z" strokeWidth="2"/></svg>
      default:
        return <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="2"/><line x1="12" y1="8" x2="12" y2="12" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2" strokeLinecap="round"/></svg>
    }
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
                    {done && <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--green-400)' }}><polyline points="20,6 9,17 4,12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    {active && <div className="spinner" />}
                    {pending && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--slate-300)' }} />}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: active ? 500 : 400, color: done ? 'var(--text-default)' : active ? 'var(--text-default)' : 'var(--slate-400)', transition: 'color 0.3s ease' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Top section: two columns ── */}
      <div style={{ display: 'flex', alignItems: 'stretch', flexShrink: 0, borderBottom: '1px solid var(--black-100)' }}>

      {/* Left column (60%): greeting, metrics, follow-up */}
      <div style={{ flex: '0 0 60%', padding: '28px 36px 16px', borderRight: '1px solid var(--black-100)', display: 'flex', flexDirection: 'column' }}>

        {showOnboarding && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#050849', borderRadius: 'var(--radius-md)', padding: '14px 20px', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <svg width="18" height="18" fill="none" stroke="#fff" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2" strokeLinecap="round"/>
                <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <div style={{ fontSize: 13, color: '#fff' }}>
                <span style={{ fontWeight: 600 }}>Welcome to Atelier Sales Intelligence.</span> Start by searching for a brand below to generate a research dossier and ICP score.
              </div>
            </div>
            <button
              onClick={() => setShowOnboarding(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', fontSize: 18, flexShrink: 0, marginLeft: 16 }}
            >×</button>
          </div>
        )}

        <div className="page-eyebrow">Dashboard</div>
        <h1 className="page-title" style={{ marginBottom: 4 }}>
          {userName ? getGreeting(userName) : 'Good morning'}
        </h1>
        <p className="page-sub" style={{ marginBottom: 16 }}>Score any ANZ consumer brand against your ICP, surface buying signals, and find the right contact.</p>

        {/* 2×2 Metrics grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Total Leads', value: leads.length, color: 'var(--text-default)' },
            { label: 'Hot Leads', value: leads.filter(l => l.score_band === 'Hot').length, color: 'var(--green-400)' },
            { label: 'Emails Sent', value: leads.filter(l => l.status === 'Sent' || l.status === 'Called').length, color: '#050849' },
            { label: 'Replied', value: leads.filter(l => l.status === 'Replied').length, color: 'var(--orange-400)' },
          ].map(stat => (
            <div key={stat.label} style={{ background: '#fff', border: '1px solid var(--black-100)', borderRadius: 'var(--radius-md)', padding: '14px 20px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--slate-400)', marginBottom: 6 }}>{stat.label}</div>
              <div style={{ fontSize: 40, fontWeight: 700, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Due for follow-up */}
        {overdueLeads.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div className="section-label" style={{ marginBottom: 2, color: 'var(--orange-400)' }}>⏰ Due for follow-up</div>
                <div style={{ fontSize: 12, color: 'var(--slate-400)' }}>Contacted 7+ days ago with no reply recorded.</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {overdueLeads.map((lead, i) => (
                <div key={i} className="card-hair" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, borderColor: 'var(--orange-200)', background: 'var(--orange-100)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span onClick={() => handleLeadClick(lead)} style={{ fontSize: 14, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--black-200)' }}>{lead.brand_name}</span>
                      <span className={getBandClass(lead.score_band)} style={{ fontSize: 11 }}>{lead.score_band}</span>
                      <span style={{ fontSize: 11, color: 'var(--slate-400)' }}>· Sent {lead.date_added}</span>
                      {leadTimings[lead.brand_name] && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
                          padding: '2px 8px', borderRadius: 4,
                          background: leadTimings[lead.brand_name].urgency === 'high' ? '#050849' : 'var(--orange-100)',
                          color: leadTimings[lead.brand_name].urgency === 'high' ? '#fff' : 'var(--orange-400)'
                        }}>
                          {leadTimings[lead.brand_name].urgency === 'high' ? '⚡ Reach out now' : `📅 ${leadTimings[lead.brand_name].recommended_day}`}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>
                      {lead.contact_name ? `Last contacted: ${lead.contact_name}` : 'No reply recorded'}
                      {lead.email_subject ? ` · "${lead.email_subject}"` : ''}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <button
                      onClick={async () => {
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
                            localStorage.removeItem('selected_contact')
                            localStorage.setItem('selected_contact', JSON.stringify({
                              name: lead.contact_name,
                              role: lead.target_role,
                              email: ''
                            }))
                            localStorage.setItem('follow_up_context', JSON.stringify({
                              original_subject: lead.email_subject,
                              contact_name: lead.contact_name,
                              date_sent: lead.date_added
                            }))
                            router.push('/email')
                          }
                        } catch {
                          setLoading(false)
                        }
                      }}
                      className="btn btn-primary btn-sm"
                    >
                      Draft follow-up
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {scheduledEmails.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <div className="section-label" style={{ color: '#050849' }}>🕐 Scheduled sends</div>
              <span style={{ fontSize: 11, fontWeight: 500, background: '#050849', color: '#fff', borderRadius: 10, padding: '1px 7px' }}>{scheduledEmails.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {scheduledEmails.map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#f0f0ff', border: '1px solid #d0d0ee', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-default)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.brand_name || e.to_email}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--slate-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      To: {e.to_email}{e.contact_name ? ` · ${e.contact_name}` : ''}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: '#050849', marginTop: 3 }}>
                      📅 {new Date(e.scheduled_at).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} {(() => { try { return new Intl.DateTimeFormat('en-AU', { timeZone: e.timezone ?? 'Australia/Sydney', timeZoneName: 'short' }).formatToParts(new Date(e.scheduled_at)).find(p => p.type === 'timeZoneName')?.value ?? 'AEST' } catch { return 'AEST' } })()}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await fetch(`/api/schedule-email?id=${e.id}`, { method: 'DELETE' })
                      setScheduledEmails(prev => prev.filter(x => x.id !== e.id))
                    }}
                    className="btn btn-ghost btn-sm"
                    style={{ flexShrink: 0, color: 'var(--red-500)', borderColor: 'var(--red-300)' }}
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--black-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: 'var(--slate-400)' }}>{leads.length} {leads.length === 1 ? 'brand' : 'brands'} in pipeline</span>
          <a href="/pipeline" className="btn btn-secondary btn-sm">View full pipeline →</a>
        </div>

      </div>

      {/* Right column (40%): Team Activity — independently scrollable */}
      <div style={{ flex: '0 0 40%', padding: '24px 28px 0', marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="section-label">Team Activity</div>
          <button
            onClick={() => {
              setLoadingActivity(true)
              fetch('/api/activity').then(r => r.json()).then(data => {
                if (data.success) setActivityItems(data.activity)
              }).catch(() => {}).finally(() => setLoadingActivity(false))
            }}
            disabled={loadingActivity}
            className="btn btn-secondary btn-sm"
          >
            {loadingActivity ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
        {loadingActivity && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--slate-400)', fontSize: 13, padding: '12px 0' }}>
            <div className="spinner" /> Loading activity…
          </div>
        )}
        {!loadingActivity && activityItems.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--slate-400)', padding: '16px 0' }}>
            No recent activity yet.
          </div>
        )}
        {activityItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {activityItems.map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '10px 0',
                borderBottom: i < activityItems.length - 1 ? '1px solid var(--black-100)' : 'none'
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--slate-100)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--slate-500)', marginTop: 1
                }}>
                  {activityIcon(item.icon)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, lineHeight: 1.4, marginBottom: 3 }}>{item.text}</div>
                  <span style={{ fontSize: 11, color: 'var(--slate-400)' }}>{relativeDate(item.date)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>{/* end scrollable activity */}
      </div>

      </div>{/* end top section */}

      {/* ── Bottom section: intelligence tabs ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '8px 36px 0' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
          <div className="role-row" style={{ margin: 0 }}>
            <button onClick={() => setActiveIntelTab('industry')} className={`role-btn ${activeIntelTab === 'industry' ? 'active' : ''}`} style={{ fontSize: 13, padding: '6px 16px' }}>Industry Signals</button>
            <button onClick={() => setActiveIntelTab('market')} className={`role-btn ${activeIntelTab === 'market' ? 'active' : ''}`} style={{ fontSize: 13, padding: '6px 16px' }}>Market Pulse</button>
            <button onClick={() => setActiveIntelTab('trends')} className={`role-btn ${activeIntelTab === 'trends' ? 'active' : ''}`} style={{ fontSize: 13, padding: '6px 16px' }}>Trending Now</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {activeIntelTab === 'industry' && <button onClick={() => competitorSignalsLoaded ? fetchCompetitorSignals(true) : fetchCompetitorSignals()} disabled={loadingCompetitorSignals} className="btn btn-secondary btn-sm">{loadingCompetitorSignals ? 'Scanning...' : competitorSignalsLoaded ? 'Refresh' : 'Scan industry'}</button>}
            {activeIntelTab === 'market' && <button onClick={() => marketPulseLoaded ? fetchMarketPulse(true) : fetchMarketPulse()} disabled={loadingMarketPulse} className="btn btn-secondary btn-sm">{loadingMarketPulse ? 'Scanning...' : marketPulseLoaded ? 'Refresh' : 'Scan market'}</button>}
            {activeIntelTab === 'trends' && <button onClick={() => trendsLoaded ? fetchTrendMatches(true) : fetchTrendMatches()} disabled={loadingTrends || (leads.length === 0 && savedSuggestions.length === 0)} className="btn btn-secondary btn-sm">{loadingTrends ? 'Matching...' : trendsLoaded ? 'Refresh' : 'Match trends'}</button>}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: 32 }}>
        {activeIntelTab === 'industry' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--slate-400)', marginBottom: 14 }}>Latest news from prestige beauty, health and wellness — potential outreach triggers for Atelier.</div>
            {loadingCompetitorSignals && <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--slate-400)', fontSize: 13 }}><div className="spinner" /> Scanning industry activity...</div>}
            {!competitorSignalsLoaded && !loadingCompetitorSignals && <div className="card-hair" style={{ padding: '20px 24px', textAlign: 'center' }}><div style={{ fontSize: 13, color: 'var(--slate-400)', marginBottom: 12 }}>Scan for the latest beauty industry news.</div><button onClick={() => fetchCompetitorSignals()} className="btn btn-primary btn-sm">Scan industry</button></div>}
            {competitorSignalsLoaded && competitorSignals.length === 0 && <div className="card-hair" style={{ padding: '20px 24px', textAlign: 'center' }}><div style={{ fontSize: 13, color: 'var(--slate-400)' }}>No recent signals found.</div></div>}
            {competitorSignals.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {competitorSignals.map((signal, i) => (
                  <div key={i} className="card-hair" style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span onClick={() => handleResearch(signal.brand ?? signal.competitor ?? '')} style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--brand-400)', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--brand-200)' }}>{signal.brand ?? signal.competitor}</span>
                      <span style={{ fontSize: 11, color: 'var(--slate-300)' }}>· {signal.date}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{signal.headline}</div>
                    <div style={{ fontSize: 12, color: 'var(--slate-500)', lineHeight: 1.4 }}><span style={{ fontWeight: 500, color: 'var(--brand-400)' }}>Why it matters: </span>{signal.why_it_matters}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeIntelTab === 'market' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--slate-400)', marginBottom: 14 }}>Global supply chain and trade signals affecting beauty manufacturing.</div>
            {loadingMarketPulse && <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--slate-400)', fontSize: 13 }}><div className="spinner" /> Scanning global supply chain signals...</div>}
            {!marketPulseLoaded && !loadingMarketPulse && <div className="card-hair" style={{ padding: '20px 24px', textAlign: 'center' }}><div style={{ fontSize: 13, color: 'var(--slate-400)', marginBottom: 12 }}>Scan for global supply chain and trade signals.</div><button onClick={() => fetchMarketPulse()} className="btn btn-primary btn-sm">Scan market</button></div>}
            {marketPulseLoaded && marketPulse.length === 0 && <div className="card-hair" style={{ padding: '20px 24px', textAlign: 'center' }}><div style={{ fontSize: 13, color: 'var(--slate-400)' }}>No market signals found. Try again later.</div></div>}
            {marketPulse.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {marketPulse.map((signal, i) => (
                  <div key={i} className="card-hair" style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '2px 8px', borderRadius: 4, background: signal.urgency === 'high' ? 'var(--red-100)' : signal.urgency === 'medium' ? 'var(--orange-100)' : 'var(--slate-100)', color: signal.urgency === 'high' ? 'var(--red-500)' : signal.urgency === 'medium' ? 'var(--orange-400)' : 'var(--slate-400)' }}>{signal.urgency} urgency</span>
                      <span style={{ fontSize: 10, fontWeight: 500, textTransform: 'uppercase', color: 'var(--brand-400)', background: 'var(--brand-100)', padding: '2px 8px', borderRadius: 4 }}>{signal.signal_type}</span>
                      <span style={{ fontSize: 11, color: 'var(--slate-300)', marginLeft: 'auto' }}>· {signal.date}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{signal.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--slate-500)', lineHeight: 1.5, marginBottom: 8 }}>{signal.summary}</div>
                    <div style={{ fontSize: 12, color: 'var(--brand-400)', fontWeight: 500, background: 'var(--brand-100)', padding: '6px 10px', borderRadius: 4, lineHeight: 1.4 }}>💡 {signal.outreach_angle}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeIntelTab === 'trends' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--slate-400)', marginBottom: 14 }}>Current beauty trends matched against your pipeline and saved brands.</div>
            {loadingTrends && <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--slate-400)', fontSize: 13 }}><div className="spinner" /> Matching current beauty trends to your pipeline...</div>}
            {!trendsLoaded && !loadingTrends && <div className="card-hair" style={{ padding: '20px 24px', textAlign: 'center' }}><div style={{ fontSize: 13, color: 'var(--slate-400)', marginBottom: 12 }}>Match current beauty trends against your pipeline brands.</div><button onClick={() => fetchTrendMatches()} className="btn btn-primary btn-sm">Match trends</button></div>}
            {trendsLoaded && trendMatches.length === 0 && <div className="card-hair" style={{ padding: '20px 24px', textAlign: 'center' }}><div style={{ fontSize: 13, color: 'var(--slate-400)' }}>No trend matches found.</div></div>}
            {trendMatches.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {trendMatches.map((match, i) => (
                  <div key={i} className="card-hair" style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4, background: match.momentum === 'rising' ? 'var(--green-100)' : match.momentum === 'peak' ? '#050849' : 'var(--slate-100)', color: match.momentum === 'rising' ? 'var(--green-400)' : match.momentum === 'peak' ? '#fff' : 'var(--slate-400)' }}>{match.momentum === 'rising' ? '↑ Rising' : match.momentum === 'peak' ? '⚡ Peak' : 'Established'}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand-400)', background: 'var(--brand-100)', padding: '2px 8px', borderRadius: 4 }}>{match.trend}</span>
                    </div>
                    <div onClick={() => handleResearch(match.brand)} style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'var(--black-200)' }}>{match.brand}</div>
                    <div style={{ fontSize: 12, color: 'var(--slate-500)', lineHeight: 1.5, marginBottom: 8 }}>{match.match_reason}</div>
                    <div style={{ fontSize: 12, color: 'var(--brand-400)', fontWeight: 500, background: 'var(--brand-100)', padding: '6px 10px', borderRadius: 4, lineHeight: 1.4, marginBottom: 10 }}>💡 {match.outreach_angle}</div>
                    <button onClick={() => draftEmailFromTrend(match.brand, match.outreach_angle)} disabled={draftingBrand === match.brand} className="btn btn-secondary btn-sm" style={{ width: '100%' }}>{draftingBrand === match.brand ? 'Loading…' : 'Draft email'}</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        </div>{/* end intel scroll */}
      </div>{/* end bottom section */}
    </div>
  )
}

function SuggestionCard({ suggestion, saved, saving, onResearch, onSave, reengage }: {
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
      onClick={onResearch}
      className="card-hair"
      style={{ padding: '16px', display: 'flex', flexDirection: 'column', cursor: 'pointer', borderColor: reengage ? 'var(--orange-300)' : undefined, background: reengage ? 'var(--orange-100)' : undefined }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-default)' }}>{suggestion.brand_name}</div>
        <button
          onClick={e => { e.stopPropagation(); onSave() }}
          disabled={saving}
          title={saved ? 'Remove from saved' : 'Save for later'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0, color: saved ? 'var(--green-400)' : 'var(--slate-300)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {saving ? (
            <div className="spinner" style={{ width: 14, height: 14 }} />
          ) : (
            <svg width="16" height="16" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
