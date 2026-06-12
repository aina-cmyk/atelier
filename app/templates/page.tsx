'use client'

import { useEffect, useState } from 'react'

interface Template {
  id: number
  name: string
  role: string
  subject: string
  body: string
  created_at: string
}

const TEMPLATE_TYPES = [
  'Cold Outreach',
  'Follow-up',
  'Inbound Response',
  'Referral Intro',
  'Re-engagement',
  'Partnership Proposal'
]

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterType, setFilterType] = useState<string>('All')
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('Cold Outreach')
  const [newSubject, setNewSubject] = useState('')
  const [newBody, setNewBody] = useState('')

  useEffect(() => { fetchTemplates() }, [])

  async function fetchTemplates() {
    try {
      const res = await fetch('/api/templates')
      const data = await res.json()
      if (data.success) setTemplates(data.templates)
    } catch {
      console.error('Failed to fetch templates')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!newName || !newSubject || !newBody) return
    setSaving(true)
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, role: newType, subject: newSubject, body: newBody })
      })
      const data = await res.json()
      if (data.success) {
        setNewName('')
        setNewSubject('')
        setNewBody('')
        setShowCreate(false)
        fetchTemplates()
      }
    } catch {
      console.error('Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    try {
      await fetch(`/api/templates?id=${id}`, { method: 'DELETE' })
      setTemplates(templates.filter(t => t.id !== id))
      if (selectedTemplate?.id === id) setSelectedTemplate(null)
    } catch {
      console.error('Failed to delete template')
    }
  }

  const filteredTemplates = filterType === 'All'
    ? templates
    : templates.filter(t => t.role === filterType)

  return (
    <div>
      <div className="page-eyebrow">Templates</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 className="page-title">Email Templates</h1>
        <button onClick={() => setShowCreate(!showCreate)} className="btn btn-primary">
          {showCreate ? 'Cancel' : '+ New template'}
        </button>
      </div>
      <p className="page-sub" style={{ marginBottom: 32 }}>Save and reuse outreach emails. One template can be used across any stakeholder role.</p>

      {showCreate && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="section-label" style={{ marginBottom: 16 }}>Create new template</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="field-label">Template name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Prestige skincare cold outreach"
                  className="input"
                />
              </div>
              <div>
                <label className="field-label">Template type</label>
                <div className="role-row" style={{ marginTop: 4, flexWrap: 'wrap' }}>
                  {TEMPLATE_TYPES.map(type => (
                    <button
                      key={type}
                      onClick={() => setNewType(type)}
                      className={`role-btn ${newType === type ? 'active' : ''}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="field-label">Subject line</label>
              <input
                type="text"
                value={newSubject}
                onChange={e => setNewSubject(e.target.value)}
                placeholder="e.g. Manufacturing partnership — [Brand name]"
                className="input"
              />
            </div>
            <div>
              <label className="field-label">Email body</label>
              <textarea
                value={newBody}
                onChange={e => setNewBody(e.target.value)}
                placeholder="Paste your existing email here or write a new one. Use [Brand name], [Contact name], [Retailer] as placeholders."
                rows={12}
                className="textarea"
              />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handleSave}
                disabled={saving || !newName || !newSubject || !newBody}
                className="btn btn-primary"
              >
                {saving ? 'Saving...' : 'Save template'}
              </button>
              <button onClick={() => setShowCreate(false)} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <div className="role-row" style={{ flexWrap: 'wrap' }}>
          {['All', ...TEMPLATE_TYPES].map(type => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`role-btn ${filterType === type ? 'active' : ''}`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--slate-400)', fontSize: 14 }}>
          <div className="spinner" />
          Loading templates...
        </div>
      )}

      {!loading && filteredTemplates.length === 0 && (
        <div className="table-wrap">
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--slate-400)', fontSize: 13 }}>
            No templates yet. Click <strong>+ New template</strong> to get started.
          </div>
        </div>
      )}

      {!loading && filteredTemplates.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedTemplate ? '1fr 1fr' : '1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredTemplates.map(template => (
              <div
                key={template.id}
                className="card-hair"
                style={{
                  padding: '16px 20px',
                  cursor: 'pointer',
                  borderColor: selectedTemplate?.id === template.id ? 'var(--black)' : undefined,
                  background: selectedTemplate?.id === template.id ? 'var(--slate-100)' : '#fff'
                }}
                onClick={() => setSelectedTemplate(template)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', background: 'var(--brand-100)', color: 'var(--brand-400)', padding: '2px 8px', borderRadius: 4 }}>
                      {template.role}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{template.name}</span>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(template.id) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)', fontSize: 18, padding: '2px 6px' }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ fontSize: 13, color: 'var(--slate-500)', marginBottom: 4 }}>{template.subject}</div>
                <div style={{ fontSize: 12, color: 'var(--slate-400)' }}>
                  {new Date(template.created_at).toLocaleDateString('en-AU')}
                </div>
              </div>
            ))}
          </div>

          {selectedTemplate && (
            <div className="card" style={{ alignSelf: 'start' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--slate-400)', marginBottom: 4 }}>{selectedTemplate.role}</div>
                  <div style={{ fontSize: 18, fontWeight: 500 }}>{selectedTemplate.name}</div>
                </div>
                <button
                  onClick={() => {
                    localStorage.setItem('email_template', JSON.stringify(selectedTemplate))
                    window.location.href = '/email'
                  }}
                  className="btn btn-primary btn-sm"
                >
                  Use in email generator
                </button>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div className="field-label">Subject</div>
                <div style={{ fontSize: 13, color: 'var(--text-default)', background: 'var(--slate-100)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--black-100)' }}>
                  {selectedTemplate.subject}
                </div>
              </div>
              <div>
                <div className="field-label">Body</div>
                <div style={{ fontSize: 13, color: 'var(--text-default)', background: 'var(--slate-100)', padding: '14px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--black-100)', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 400, overflowY: 'auto' }}>
                  {selectedTemplate.body}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}