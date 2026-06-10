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
}

interface Dossier {
  brand_name: string
  score_band: string
  icp_score: number
}

function getDummyContacts(brandName: string): Contact[] {
  return [
    {
      role: 'CEO',
      name: 'Sarah Mitchell',
      email: `s.mitchell@${brandName.toLowerCase().replace(/\s+/g, '')}.com`,
      phone: '+61 2 9000 0001',
      linkedin: 'linkedin.com/in/sarah-mitchell',
      verified: false
    },
    {
      role: 'CFO',
      name: 'James Chen',
      email: `j.chen@${brandName.toLowerCase().replace(/\s+/g, '')}.com`,
      phone: '+61 2 9000 0002',
      linkedin: 'linkedin.com/in/james-chen',
      verified: false
    },
    {
      role: 'COO',
      name: 'Emma Williams',
      email: `e.williams@${brandName.toLowerCase().replace(/\s+/g, '')}.com`,
      phone: '+61 2 9000 0003',
      linkedin: 'linkedin.com/in/emma-williams',
      verified: false
    },
    {
      role: 'CMO',
      name: 'David Park',
      email: `d.park@${brandName.toLowerCase().replace(/\s+/g, '')}.com`,
      phone: '+61 2 9000 0004',
      linkedin: 'linkedin.com/in/david-park',
      verified: false
    }
  ]
}

export default function ContactsPage() {
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('current_dossier')
    if (!stored) { router.push('/'); return }
    const d = JSON.parse(stored)
    setDossier(d)
    setContacts(getDummyContacts(d.brand_name))
  }, [router])

  if (!dossier) return null

  function handleProceed() {
    if (!selectedRole) return
    const contact = contacts.find(c => c.role === selectedRole)
    localStorage.setItem('selected_contact', JSON.stringify(contact))
    router.push('/email')
  }

  return (
    <div>
      <div className="page-eyebrow">Contacts</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.5px', margin: 0 }}>{dossier.brand_name}</h1>
        <button onClick={() => router.push('/dossier')} className="btn btn-ghost btn-sm">
          ← Back to dossier
        </button>
      </div>
      <p className="page-sub" style={{ marginBottom: 28 }}>Select a contact to generate an outreach email</p>

      <div className="data-warning" style={{ marginBottom: 24 }}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" strokeWidth="2"/>
          <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2" strokeLinecap="round"/>
          <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        Placeholder contacts — Lusha integration will populate real data once connected.
      </div>

      <div className="contacts-grid" style={{ marginBottom: 24 }}>
        {contacts.map((contact) => (
          <div
            key={contact.role}
            onClick={() => setSelectedRole(contact.role)}
            className="contact-card"
            style={{
              cursor: 'pointer',
              borderColor: selectedRole === contact.role ? 'var(--black)' : undefined,
              background: selectedRole === contact.role ? 'var(--slate-100)' : undefined,
              transition: 'all var(--dur-fast) var(--ease-out)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div className="contact-role">{contact.role}</div>
              {!contact.verified && (
                <span style={{ fontSize: 11, color: 'var(--orange-400)' }}>Unverified</span>
              )}
            </div>
            <div className="contact-name">{contact.name}</div>
            <div className="contact-line">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" strokeWidth="2"/>
              </svg>
              {contact.email}
            </div>
            <div className="contact-line">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.06 6.06l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" strokeWidth="2"/>
              </svg>
              {contact.phone}
            </div>
            {selectedRole === contact.role && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green-400)', fontSize: 12, fontWeight: 500 }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <polyline points="20,6 9,17 4,12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Selected
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleProceed}
        disabled={!selectedRole}
        className="btn btn-primary btn-block"
        style={{ height: 48, fontSize: 15 }}
      >
        Generate email for {selectedRole ?? '...'}
      </button>
    </div>
  )
}