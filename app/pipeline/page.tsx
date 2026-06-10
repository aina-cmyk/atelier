'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Lead {
  brand_name: string
  website: string
  lead_source: string
  revenue_estimate: string
  retailers: string
  category: string
  icp_score: string
  score_band: string
  key_signals: string
  target_role: string
  contact_name: string
  email_subject: string
  email_body: string
  date_added: string
  status: string
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    async function fetchLeads() {
      try {
        const res = await fetch('/api/pipeline')
        const data = await res.json()
        if (data.success) {
          setLeads(data.leads)
        } else {
          setError('Failed to load pipeline.')
        }
      } catch {
        setError('Failed to load pipeline.')
      } finally {
        setLoading(false)
      }
    }
    fetchLeads()
  }, [])

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

  return (
    <div>
      <div className="page-eyebrow">Pipeline</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 className="page-title">Atelier Pipeline</h1>
        <div style={{ fontSize: 13, color: 'var(--slate-400)' }}>
          {leads.length} {leads.length === 1 ? 'brand' : 'brands'}
        </div>
      </div>
      <p className="page-sub" style={{ marginBottom: 32 }}>All leads tracked across outbound, inbound, and referral channels.</p>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--slate-400)', fontSize: 14 }}>
          <div className="spinner" />
          Loading pipeline...
        </div>
      )}

      {error && (
        <div className="data-warning">{error}</div>
      )}

      {!loading && !error && (
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
                    No leads yet. Research a brand to get started.
                  </td>
                </tr>
              )}
              {leads.map((lead, i) => (
                <tr
                  key={i}
                  className="clickable"
                  onClick={() => {
                    localStorage.setItem('pipeline_lead', JSON.stringify(lead))
                    router.push('/')
                  }}
                >
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
      )}
    </div>
  )
}