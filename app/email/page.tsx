'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Contact {
  role: string
  name: string
  email: string
  phone?: string
  verified?: boolean
  placeholder?: boolean
}

interface Dossier {
  brand_name: string
  [key: string]: unknown
}

interface Email {
  subject: string
  body: string
}

interface Template {
  id: number
  name: string
  role: string
  subject: string
  body: string
}

export default function EmailPage() {
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [contact, setContact] = useState<Contact | null>(null)
  const [allContacts, setAllContacts] = useState<Contact[]>([])
  const [selectedRole, setSelectedRole] = useState<string>('CEO')
  const [email, setEmail] = useState<Email | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')
  const [trustGatePassed, setTrustGatePassed] = useState<boolean | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [sent, setSent] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [savedTemplates, setSavedTemplates] = useState<Template[]>([])
  const [activeTemplate, setActiveTemplate] = useState<{ subject: string; body: string } | null>(null)
  const [showContactDropdown, setShowContactDropdown] = useState(false)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [contactHistory, setContactHistory] = useState<{contact_role: string; sent_at: string}[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    const storedDossier = localStorage.getItem('current_dossier')
    const storedContact = localStorage.getItem('selected_contact')
    const storedTemplate = localStorage.getItem('email_template')
    if (!storedDossier) { router.push('/'); return }
    setDossier(JSON.parse(storedDossier))
    if (storedContact) {
      const c = JSON.parse(storedContact)
      setContact(c)
      setSelectedRole(c.role)
    }
    if (storedTemplate) {
      setActiveTemplate(JSON.parse(storedTemplate))
      localStorage.removeItem('email_template')
    }
  }, [router])

  useEffect(() => {
    if (dossier) generateEmail(selectedRole)
  }, [dossier])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowContactDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function fetchAllContacts() {
    if (!dossier) return
    setLoadingContacts(true)
    try {
      const [contactsRes, historyRes] = await Promise.all([
        fetch('/api/lookup-contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            brand_name: dossier.brand_name,
            domain: (dossier as {website?: string}).website ?? ''
          })
        }),
        fetch(`/api/contact-history?brand_name=${encodeURIComponent(dossier.brand_name as string)}`)
      ])
      const contactsData = await contactsRes.json()
      const historyData = await historyRes.json()
      if (contactsData.success) setAllContacts(contactsData.contacts)
      if (historyData.success) setContactHistory(historyData.history)
    } catch {
      console.error('Failed to fetch contacts')
    } finally {
      setLoadingContacts(false)
    }
  }

  async function fetchTemplates() {
    try {
      const res = await fetch('/api/templates')
      const data = await res.json()
      if (data.success) setSavedTemplates(data.templates)
    } catch {
      console.error('Failed to fetch templates')
    }
  }

  async function generateEmail(role: string, template?: { subject: string; body: string }) {
    if (!dossier) return
    setLoading(true)
    setWarning('')
    setError('')
    setEmail(null)
    setTrustGatePassed(null)

    const contactName = contact?.name ?? 'there'

    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dossier,
          role,
          contact_name: contactName,
          template: template ?? activeTemplate ?? undefined
        })
      })

      const data = await res.json()

      if (!res.ok) { setError('Email generation failed. Please try again.'); setTrustGatePassed(false); return }
      if (!data.success && data.warning) { setWarning(data.warning); setTrustGatePassed(false); return }

      setEmail(data.email)
      setTrustGatePassed(true)
    } catch {
      setError('Something went wrong. Please try again.')
      setTrustGatePassed(false)
    } finally {
      setLoading(false)
    }
  }

  function handleContactSelect(c: Contact) {
    setContact(c)
    setSelectedRole(c.role)
    setShowContactDropdown(false)
    generateEmail(c.role)
  }

  async function handleSend() {
    if (!email || !contact) return
    setSending(true)
    setError('')

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: contact.email,
          subject: email.subject,
          emailBody: email.body,
          contactName: contact.name,
          role: selectedRole,
          leadSource: localStorage.getItem('lead_source') ?? 'Outbound',
          dossier
        })
      })

      const data = await res.json()

      if (data.reauth) { setNeedsAuth(true); setShowModal(false); return }
      if (!res.ok || !data.success) { setError('Failed to send email. Please try again.'); setShowModal(false); return }

      setSent(true)
      setShowModal(false)
    } catch {
      setError('Something went wrong. Please try again.')
      setShowModal(false)
    } finally {
      setSending(false)
    }
  }

  if (!dossier) return null

  return (
    <div>
      <div className="page-eyebrow">Email Generator</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.5px', margin: 0 }}>
          Outreach to {dossier.brand_name as string}
        </h1>
        <button onClick={() => router.push('/contacts')} className="btn btn-ghost btn-sm">
          ← Back to contacts
        </button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--slate-500)', marginBottom: 28 }}>
        Personalised from {dossier.brand_name as string}&apos;s research dossier. Review every detail before it leaves your inbox.
      </p>

      {sent && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--green-100)', border: '1px solid var(--green-300)', borderRadius: 'var(--radius-md)', padding: '14px 18px', marginBottom: 24 }}>
          <div className="success-mark" style={{ width: 32, height: 32 }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <polyline points="20,6 9,17 4,12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--green-500)' }}>Email sent successfully</div>
            <div style={{ fontSize: 12, color: 'var(--green-400)' }}>Sent to {contact?.name} · {contact?.email}</div>
          </div>
        </div>
      )}

      {needsAuth && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--orange-100)', border: '1px solid var(--orange-300)', borderRadius: 'var(--radius-md)', padding: '14px 18px', marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: 'var(--orange-500)' }}>Gmail authorisation required before sending.</div>
          <a href="/api/auth/gmail" className="btn btn-primary btn-sm">Authorise Gmail</a>
        </div>
      )}

      {activeTemplate && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--brand-100)', border: '1px solid var(--brand-200)', borderRadius: 'var(--radius-md)', padding: '10px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: 'var(--brand-400)', fontWeight: 500 }}>
            Using saved template as style guide
          </div>
          <button
            onClick={() => { setActiveTemplate(null); generateEmail(selectedRole) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-400)', fontSize: 12 }}
          >
            Remove ×
          </button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--slate-400)' }}>Trust gate</span>
          {trustGatePassed === null && (
            <span style={{ fontSize: 12, color: 'var(--slate-400)', background: 'var(--slate-200)', padding: '3px 10px', borderRadius: 'var(--radius-xs)' }}>—</span>
          )}
          {trustGatePassed === true && (
            <span style={{ fontSize: 12, fontWeight: 500, color: '#fff', background: 'var(--green-400)', padding: '3px 10px', borderRadius: 'var(--radius-xs)' }}>Pass</span>
          )}
          {trustGatePassed === false && (
            <span style={{ fontSize: 12, fontWeight: 500, color: '#fff', background: 'var(--red-500)', padding: '3px 10px', borderRadius: 'var(--radius-xs)' }}>Fail</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 24 }}>
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setShowContactDropdown(!showContactDropdown)
              if (!showContactDropdown && allContacts.length === 0) fetchAllContacts()
            }}
            className="btn btn-secondary btn-sm"
          >
            Additional contacts ▾
          </button>
          {showContactDropdown && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 4,
              background: '#fff', border: '1px solid var(--black-100)',
              borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-400)',
              minWidth: 280, zIndex: 50, overflow: 'hidden'
            }}>
              {loadingContacts && (
                <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--slate-400)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="spinner" /> Loading contacts...
                </div>
              )}
              {!loadingContacts && allContacts.length === 0 && (
                <div style={{ padding: '12px 16px', fontSize: 13, color: 'var(--slate-400)' }}>No contacts found</div>
              )}
              {!loadingContacts && allContacts.map((c, i) => {
                const history = contactHistory.find(h => h.contact_role === c.role)
                return (
                  <div
                    key={i}
                    onClick={() => handleContactSelect(c)}
                    style={{
                      padding: '10px 16px', cursor: 'pointer',
                      borderBottom: i < allContacts.length - 1 ? '1px solid var(--black-100)' : 'none',
                      background: contact?.role === c.role ? 'var(--slate-100)' : history ? 'var(--green-100)' : '#fff'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--slate-100)')}
                    onMouseLeave={e => (e.currentTarget.style.background = contact?.role === c.role ? 'var(--slate-100)' : history ? 'var(--green-100)' : '#fff')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--slate-400)' }}>{c.role}</span>
                          {history && (
                            <span style={{ fontSize: 10, color: 'var(--green-400)', fontWeight: 500 }}>
                              Contacted {new Date(history.sent_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                          {!c.verified && !history && <span style={{ fontSize: 10, color: 'var(--orange-400)' }}>Unverified</span>}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>{c.email}</div>
                      </div>
                      {contact?.role === c.role && (
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--green-400)' }}>
                          <polyline points="20,6 9,17 4,12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <button
          onClick={() => { setShowTemplates(!showTemplates); fetchTemplates() }}
          className="btn btn-secondary btn-sm"
        >
          {showTemplates ? 'Hide templates' : 'Use saved template'}
        </button>
      </div>

      {showTemplates && (
        <div className="card-hair" style={{ padding: '16px 20px', marginBottom: 24 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>Saved templates</div>
          {savedTemplates.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--slate-400)' }}>
              No saved templates yet. <a href="/templates" style={{ color: 'var(--brand-400)' }}>Create one in the Templates tab.</a>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {savedTemplates.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', border: '1px solid var(--black-100)', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', background: 'var(--brand-100)', color: 'var(--brand-400)', padding: '2px 8px', borderRadius: 4, marginRight: 8 }}>{t.role}</span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</span>
                  <div style={{ fontSize: 12, color: 'var(--slate-400)', marginTop: 2 }}>{t.subject}</div>
                </div>
                <button
                  onClick={() => {
                    const tmpl = { subject: t.subject, body: t.body }
                    setActiveTemplate(tmpl)
                    setShowTemplates(false)
                    generateEmail(selectedRole, tmpl)
                  }}
                  className="btn btn-primary btn-sm"
                >
                  Use
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        {contact && (
          <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--black-100)' }}>
            <div className="kv-label">Recipient</div>
            <div style={{ fontWeight: 500, fontSize: 14 }}>{contact.name}</div>
            <div style={{ fontSize: 13, color: 'var(--slate-500)' }}>{contact.role} · {contact.email}</div>
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '32px 0', color: 'var(--slate-500)', fontSize: 14 }}>
            <div className="spinner" />
            {activeTemplate ? 'Personalising your template...' : 'Generating personalised email...'}
          </div>
        )}

        {warning && (
          <div className="data-warning">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeWidth="2"/>
              <line x1="12" y1="9" x2="12" y2="13" strokeWidth="2" strokeLinecap="round"/>
              <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {warning}
          </div>
        )}

        {error && (
          <div style={{ background: 'var(--red-100)', border: '1px solid var(--red-300)', borderRadius: 'var(--radius-md)', padding: '14px 16px', color: 'var(--red-500)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {email && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="field-label">Subject</label>
              <input
                type="text"
                value={email.subject}
                onChange={e => setEmail({ ...email, subject: e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="field-label">Body</label>
              <textarea
                value={email.body}
                onChange={e => setEmail({ ...email, body: e.target.value })}
                rows={12}
                className="textarea"
              />
            </div>
          </div>
        )}
      </div>

      {email && !sent && (
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ flex: 1, height: 48, fontSize: 15 }}>
            Send email
          </button>
          <button onClick={() => generateEmail(selectedRole)} disabled={loading} className="btn btn-secondary" style={{ flex: 1, height: 48, fontSize: 15 }}>
            Regenerate
          </button>
        </div>
      )}

      {showModal && email && (
        <div className="overlay">
          <div className="modal">
            <div className="modal-head">
              <div className="modal-title">Confirm send</div>
              <div className="modal-sub">Review before sending — this cannot be undone.</div>
            </div>
            <div className="modal-body">
              <div className="summary-row">
                <div className="k">To</div>
                <div className="v">{contact?.name} &lt;{contact?.email}&gt;</div>
              </div>
              <div className="summary-row">
                <div className="k">Role</div>
                <div className="v">{selectedRole}</div>
              </div>
              <div className="summary-row">
                <div className="k">Subject</div>
                <div className="v">{email.subject}</div>
              </div>
              <div style={{ marginTop: 16 }}>
                <div className="field-label" style={{ marginBottom: 8 }}>Email body</div>
                <div className="email-full">{email.body}</div>
              </div>
            </div>
            <div className="modal-foot">
              <button onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={handleSend} disabled={sending} className="btn btn-primary">
                {sending ? 'Sending...' : 'Confirm send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}