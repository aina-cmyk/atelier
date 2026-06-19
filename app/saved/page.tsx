'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface SavedBrand {
  id: number
  brand_name: string
  category: string
  reason: string
  signal: string
  created_at: string
}

export default function SavedBrandsPage() {
  const [brands, setBrands] = useState<SavedBrand[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    document.title = 'Saved Brands — Atelier'

    Promise.all([
      fetch('/api/saved-suggestions').then(r => r.json()),
      fetch('/api/pipeline').then(r => r.json())
    ]).then(([savedData, pipelineData]) => {
      const pipelineNames = new Set(
        (pipelineData.leads ?? []).map((l: {brand_name: string}) => l.brand_name.toLowerCase())
      )
      if (savedData.success) {
        setBrands(savedData.suggestions.filter(
          (s: SavedBrand) => !pipelineNames.has(s.brand_name.toLowerCase())
        ))
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function handleUnsave(brandName: string) {
    try {
      await fetch(`/api/saved-suggestions?brand_name=${encodeURIComponent(brandName)}`, { method: 'DELETE' })
      setBrands(prev => prev.filter(b => b.brand_name !== brandName))
    } catch {
      console.error('Failed to unsave brand')
    }
  }

  async function handleResearch(brandName: string) {
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_name: brandName })
      })
      const data = await res.json()
      if (data.success) {
        localStorage.setItem('current_dossier', JSON.stringify(data.dossier))
        router.push('/dossier')
      }
    } catch {
      console.error('Failed to research brand')
    }
  }

  return (
    <div>
      <div className="page-eyebrow">Saved Brands</div>
      <h1 className="page-title">Saved Brands</h1>
      <p className="page-sub">Brands saved from research dossiers and suggested brands — excludes brands already in your pipeline.</p>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--slate-400)', fontSize: 14, marginTop: 32 }}>
          <div className="spinner" />
          Loading saved brands...
        </div>
      )}

      {!loading && brands.length === 0 && (
        <div className="card-hair" style={{ padding: '48px 24px', textAlign: 'center', marginTop: 32 }}>
          <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--slate-300)', marginBottom: 16 }}>
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-default)', marginBottom: 8 }}>No saved brands yet</div>
          <div style={{ fontSize: 13, color: 'var(--slate-400)', marginBottom: 20 }}>Save brands from the research dossier or from suggested brands on the dashboard.</div>
          <a href="/" className="btn btn-primary btn-sm">Go to dashboard</a>
        </div>
      )}

      {!loading && brands.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 24, alignItems: 'stretch' }}>
          {brands.map((brand, i) => (
            <div key={i} className="card-hair" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-default)', marginBottom: 2 }}>{brand.brand_name}</div>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--slate-400)' }}>{brand.category.split(/[,(]/)[0].trim()}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--slate-500)', lineHeight: 1.4 }}>{brand.reason}</div>
                <div style={{ fontSize: 11, color: 'var(--brand-400)', fontWeight: 500, background: 'var(--brand-100)', padding: '3px 8px', borderRadius: 4, display: 'inline-block' }}>
                  {brand.signal.slice(0, 80)}{brand.signal.length > 80 ? '...' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                <button onClick={() => handleResearch(brand.brand_name)} className="btn btn-primary btn-sm" style={{ flex: 1, background: '#050849', borderColor: '#050849' }}>
                  Research
                </button>
                <button onClick={() => handleUnsave(brand.brand_name)} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}