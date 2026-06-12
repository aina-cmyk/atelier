'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Contact {
  role: string
  name: string
  email: string
  phone: string
  linkedin: string
  verified: boolean
  placeholder?: boolean
  lookup_failed?: boolean
  department?: string
  jobTitle?: string
  seniority?: string
  contactId?: string
}

interface Dossier {
  brand_name: string
  score_band: string
  icp_score: number
  [key: string]: unknown
}

interface Template {
  id: number
  name: string
  role: string
  subject: string
  body: string
}

export default function ContactsPage() {
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [showCustomize, setShowCustomize] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [customizeContact, setCustomizeContact] = useState<Contact | null>(null)
  const [contactHistory, setContactHistory] = useState<{contact_role: string; sent_at: string; method?: string}[]>([])
  const [loggingCall, setLoggingCall] = useState<string | null>(null)
  const [loggedCalls, setLoggedCalls] = useState<Set<string>>(new Set())
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('current_dossier')
    if (!stored) { router.push('/'); return }
    const d = JSON.parse(stored)
    setDossier(d)
    fetchContacts(d.brand_name, d.website)
    fetchTemplates()
  }, [router])

  async function fetchContacts(brandName: string, website?: string) {
    setLoading(true)
    try {
      const [contactsRes, historyRes] = await Promise.all([
        fetch('/api/lookup-contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brand_name: brandName, domain: website ?? '' })
        }),
        fetch(`/api/contact-history?brand_name=${encodeURIComponent(brandName)}`)
      ])
      const contactsData = await contactsRes.json()
      const historyData = await historyRes.json()
      if (contactsData.success) setContacts(contactsData.contacts)
      if (historyData.success) {
        setContactHistory(historyData.history)
        setLoggedCalls(new Set(
          historyData.history
            .filter((h: {method?: string}) => h.method === 'phone')
            .map((h: {contact_role: string}) => h.contact_role)
        ))
      }
    } catch {
      console.error('Failed to fetch contacts')
    } finally {
      setLoading(false)
    }
  }

  async function fetchTemplates() {
    try {
      const res = await fetch('/api/templates')
      const data = await res.json()
      if (data.success) setTemplates(data.templates)
    } catch {
      console.error('Failed to fetch templates')
    }
  }

  async function handleLogCall(contact: Contact) {
    if (!dossier) return
    const key = contact.contactId ?? contact.name
    setLoggingCall(key)
    try {
      await Promise.all([
        fetch('/api/contact-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand_name: dossier.brand_name,
            contact_role: contact.role,
            contact_name: contact.name,
            contact_email: contact.email,
            method: 'phone'
          })
        }),
        fetch('/api/save-to-sheets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand_name: dossier.brand_name,
            website: (dossier as Dossier & {website?: string}).website ?? '',
            lead_source: localStorage.getItem('lead_source') ?? 'Outbound',
            revenue_estimate: (dossier as Dossier & {revenue_estimate?: string}).revenue_estimate ?? '',
            retailers: (dossier as Dossier & {retailers?: unknown[]}).retailers ?? [],
            category: (dossier as Dossier & {category?: string}).category ?? '',
            icp_score: dossier.icp_score,
            score_band: dossier.score_band,
            signals: (dossier as Dossier & {signals?: unknown[]}).signals ?? [],
            target_role: contact.role,
            contact_name: contact.name,
            email_subject: 'Phone outreach',
            email_body: '',
            status: 'Called'
          })
        })
      ])
      setLoggedCalls(prev => new Set([...prev, key]))
      setContactHistory(prev => [
        { contact_role: contact.role, sent_at: new Date().toISOString(), method: 'phone' },
        ...prev
      ])
    } catch {
      console.error('Failed to log call')
    } finally {
      setLoggingCall(null)
    }
  }

  if (!dossier) return null

  function handleProceed() {
    if (!selectedContact) return
    localStorage.setItem('selected_contact', JSON.stringify(selectedContact))
    router.push('/email')
  }

  function handleCustomizeGenerate() {
    if (!customizeContact) return
    localStorage.setItem('selected_contact', JSON.stringify(customizeContact))
    if (selectedTemplate) {
      localStorage.setItem('email_template', JSON.stringify(selectedTemplate))
    }
    router.push('/email')
  }

  const grouped = contacts.reduce((acc, contact) => {
    const dept = contact.department ?? 'Other'
    if (!acc[dept]) acc[dept] = []
    acc[dept].push(contact)
    return acc
  }, {} as Record<string, Contact[]>)

  const deptOrder = ['General Management', 'Marketing', 'Operations', 'Finance', 'Sales', 'Product & Innovation', 'Research & Analytics', 'Human Resources', 'Engineering', 'Other']
  const sortedDepts = Object.keys(grouped).sort((a, b) => {
    const ai = deptOrder.indexOf(a)
    const bi = deptOrder.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  return (
    <div>
      <div className="page-eyebrow">Contacts</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.5px', margin: 0 }}>{dossier.brand_name}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowCustomize(!showCustomize)} className="btn btn-secondary btn-sm">
            {showCustomize ? 'Cancel' : 'Customise email'}
          </button>
          <button onClick={() => router.push('/dossier')} className="btn btn-ghost btn-sm">← Back to dossier</button>
        </div>
      </div>
      <p className="page-sub" style={{ marginBottom: 28 }}>Select a contact to generate an outreach email or log a phone call.</p>

      {showCustomize && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="section-label" style={{ marginBottom: 16 }}>Customise your outreach</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div className="kv-label" style={{ marginBottom: 10 }}>Select contact</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                {contacts.map((c, i) => (
                  <div
                    key={i}
                    onClick={() => setCustomizeContact(c)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', cursor: 'pointer',
                      border: '1px solid var(--black-100)', borderRadius: 'var(--radius-sm)',
                      background: customizeContact?.name === c.name ? 'var(--slate-100)' : '#fff',
                      borderColor: customizeContact?.name === c.name ? 'var(--black)' : 'var(--black-100)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--slate-400)', marginBottom: 2 }}>{c.role}</div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--slate-500)' }}>{c.email}</div>
                    </div>
                    {customizeContact?.name === c.name && (
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--green-400)' }}>
                        <polyline points="20,6 9,17 4,12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="kv-label" style={{ marginBottom: 10 }}>Select template <span style={{ color: 'var(--slate-400)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></div>
              {templates.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--slate-400)' }}>
                  No saved templates. <a href="/templates" style={{ color: 'var(--brand-400)' }}>Create one in the Templates tab.</a>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {templates.map(t => (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTemplate(selectedTemplate?.id === t.id ? null : t)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', cursor: 'pointer',
                      border: '1px solid var(--black-100)', borderRadius: 'var(--radius-sm)',
                      background: selectedTemplate?.id === t.id ? 'var(--slate-100)' : '#fff',
                      borderColor: selectedTemplate?.id === t.id ? 'var(--black)' : 'var(--black-100)',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', background: 'var(--brand-100)', color: 'var(--brand-400)', padding: '2px 8px', borderRadius: 4, marginRight: 8 }}>{t.role}</span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</span>
                      <div style={{ fontSize: 12, color: 'var(--slate-500)', marginTop: 2 }}>{t.subject}</div>
                    </div>
                    {selectedTemplate?.id === t.id && (
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--green-400)' }}>
                        <polyline points="20,6 9,17 4,12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleCustomizeGenerate}
              disabled={!customizeContact}
              className="btn btn-primary"
              style={{ height: 44 }}
            >
              Generate email{customizeContact ? ` for ${customizeContact.name}` : ''}
              {selectedTemplate ? ` using "${selectedTemplate.name}"` : ''}
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--slate-400)', fontSize: 14, marginBottom: 24 }}>
          <div className="spinner" />
          Looking up contacts...
        </div>
      )}

      {!loading && (
        <>
          {sortedDepts.map(dept => (
            <div key={dept} style={{ marginBottom: 24 }}>
              <div className="section-label">{dept}</div>
              <div className="contacts-grid">
                {grouped[dept].map((contact, i) => (
                  <ContactCard
                    key={`${dept}-${i}`}
                    contact={contact}
                    selected={selectedContact?.name === contact.name}
                    onSelect={() => setSelectedContact(contact)}
                    lastContacted={contactHistory.find(h => h.contact_role === contact.role && contact.name.includes(h.contact_role.split(' ')[0]))?.sent_at}
                    callLogged={loggedCalls.has(contact.contactId ?? contact.name)}
                    loggingCall={loggingCall === (contact.contactId ?? contact.name)}
                    onLogCall={() => handleLogCall(contact)}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      <div style={{ position: 'sticky', bottom: 24, zIndex: 10 }}>
        <button
          onClick={handleProceed}
          disabled={!selectedContact}
          className="btn btn-primary btn-block"
          style={{ height: 52, fontSize: 15, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}
        >
          {selectedContact ? `Generate email for ${selectedContact.name}` : 'Select a contact above'}
        </button>
      </div>
    </div>
  )
}

function ContactCard({ contact, selected, onSelect, lastContacted, callLogged, loggingCall, onLogCall }: {
  contact: Contact
  selected: boolean
  onSelect: () => void
  lastContacted?: string
  callLogged?: boolean
  loggingCall?: boolean
  onLogCall: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className="contact-card"
      style={{
        cursor: 'pointer',
        borderColor: selected ? 'var(--black)' : lastContacted ? 'var(--green-300)' : undefined,
        background: selected ? 'var(--slate-100)' : lastContacted ? 'var(--green-100)' : undefined,
        transition: 'all var(--dur-fast) var(--ease-out)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div className="contact-role" style={{ fontSize: 11 }}>{contact.role}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {lastContacted && (
            <span style={{ fontSize: 11, color: 'var(--green-400)', fontWeight: 500, background: 'var(--green-100)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--green-300)' }}>
              Contacted {new Date(lastContacted).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
          {!lastContacted && !contact.verified && (
            <span style={{ fontSize: 11, color: 'var(--orange-400)' }}>Unverified</span>
          )}
        </div>
      </div>
      <div className="contact-name">{contact.name}</div>
      {contact.email && (
        <div className="contact-line">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth="2"/>
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" strokeWidth="2"/>
          </svg>
          {contact.email}
        </div>
      )}
      {contact.phone && (
        <div className="contact-line">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.06 6.06l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" strokeWidth="2"/>
          </svg>
          {contact.phone}
        </div>
      )}
      {contact.linkedin && (
        <a
          href={contact.linkedin}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--brand-400)', textDecoration: 'none', marginTop: 4 }}
        >
          <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z"/>
            <circle cx="4" cy="4" r="2"/>
          </svg>
          View LinkedIn
        </a>
      )}

      {selected && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--black-100)', display: 'flex', gap: 8 }}>
          <button
            onClick={e => { e.stopPropagation(); onLogCall() }}
            disabled={!!loggingCall || !!callLogged}
            style={{
              flex: 1, fontSize: 12, fontWeight: 500, padding: '6px 10px',
              borderRadius: 'var(--radius-sm)', cursor: callLogged ? 'default' : 'pointer',
              border: '1px solid var(--black-100)',
              background: callLogged ? 'var(--green-100)' : '#fff',
              color: callLogged ? 'var(--green-400)' : 'var(--slate-500)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5
            }}
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.06 6.06l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" strokeWidth="2"/>
            </svg>
            {loggingCall ? 'Logging...' : callLogged ? 'Call logged ✓' : 'Log phone call'}
          </button>
        </div>
      )}
    </div>
  )
}