'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Contact {
  role: string
  name: string
  email: string
}

interface Dossier {
  brand_name: string
  [key: string]: unknown
}

interface Email {
  subject: string
  body: string
}

export default function EmailPage() {
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [contact, setContact] = useState<Contact | null>(null)
  const [email, setEmail] = useState<Email | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [sent, setSent] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const storedDossier = localStorage.getItem('current_dossier')
    const storedContact = localStorage.getItem('selected_contact')
    if (!storedDossier || !storedContact) { router.push('/'); return }
    setDossier(JSON.parse(storedDossier))
    setContact(JSON.parse(storedContact))
  }, [router])

  async function generateEmail() {
    if (!dossier || !contact) return
    setLoading(true)
    setWarning('')
    setError('')
    setEmail(null)

    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dossier,
          role: contact.role,
          contact_name: contact.name
        })
      })

      const data = await res.json()

      if (!res.ok) { setError('Email generation failed. Please try again.'); return }
      if (!data.success && data.warning) { setWarning(data.warning); return }

      setEmail(data.email)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (dossier && contact) generateEmail()
  }, [dossier, contact])

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
          role: contact.role,
          dossier
        })
      })

      const data = await res.json()

      if (data.reauth) {
        setNeedsAuth(true)
        setShowModal(false)
        return
      }

      if (!res.ok || !data.success) {
        setError('Failed to send email. Please try again.')
        setShowModal(false)
        return
      }

      setSent(true)
      setShowModal(false)

    } catch {
      setError('Something went wrong. Please try again.')
      setShowModal(false)
    } finally {
      setSending(false)
    }
  }

  if (!dossier || !contact) return null

  return (
    <div>
      <div className="page-eyebrow">Email Generator</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.5px', margin: 0 }}>
          Outreach email
        </h1>
        <button onClick={() => router.push('/contacts')} className="btn btn-ghost btn-sm">
          ← Back to contacts
        </button>
      </div>

      {sent && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--green-100)', border: '1px solid var(--green-300)', borderRadius: 'var(--radius-md)', padding: '14px 18px', marginBottom: 24 }}>
          <div className="success-mark" style={{ width: 32, height: 32 }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <polyline points="20,6 9,17 4,12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--green-500)' }}>Email sent successfully</div>
            <div style={{ fontSize: 12, color: 'var(--green-400)' }}>Sent to {contact.name} · {contact.email}</div>
          </div>
        </div>
      )}

      {needsAuth && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--orange-100)', border: '1px solid var(--orange-300)', borderRadius: 'var(--radius-md)', padding: '14px 18px', marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: 'var(--orange-500)' }}>
            Gmail authorisation required before sending.
          </div>
          <a href="/api/auth/gmail" className="btn btn-primary btn-sm">
            Authorise Gmail
          </a>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--black-100)' }}>
          <div>
            <div className="kv-label">Recipient</div>
            <div style={{ fontWeight: 500, fontSize: 15 }}>{contact.name}</div>
            <div style={{ fontSize: 13, color: 'var(--slate-500)' }}>{contact.role} · {contact.email}</div>
          </div>
        </div>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '32px 0', color: 'var(--slate-500)', fontSize: 14 }}>
            <div className="spinner" />
            Generating personalised email...
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
          <button
            onClick={() => setShowModal(true)}
            className="btn btn-primary"
            style={{ flex: 1, height: 48, fontSize: 15 }}
          >
            Send email
          </button>
          <button
            onClick={generateEmail}
            disabled={loading}
            className="btn btn-secondary"
            style={{ flex: 1, height: 48, fontSize: 15 }}
          >
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
                <div className="v">{contact.name} &lt;{contact.email}&gt;</div>
              </div>
              <div className="summary-row">
                <div className="k">Role</div>
                <div className="v">{contact.role}</div>
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
              <button onClick={() => setShowModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="btn btn-primary"
              >
                {sending ? 'Sending...' : 'Confirm send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}