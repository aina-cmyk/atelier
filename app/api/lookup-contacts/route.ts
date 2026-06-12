import { NextRequest, NextResponse } from 'next/server'

const LUSHA_API_KEY = process.env.LUSHA_API_KEY
console.log('Lusha key present:', !!LUSHA_API_KEY)

async function fetchCompanyContacts(domain: string): Promise<Record<string, unknown>[]> {
  if (!LUSHA_API_KEY) return []

  try {
    const res = await fetch('https://api.lusha.com/v3/contacts/prospecting', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_key': LUSHA_API_KEY
      },
      body: JSON.stringify({
        pagination: { page: 1, size: 50 },
        filters: {
          companies: {
            include: {
              domains: [domain]
            }
          }
        },
        options: {
          maxContactsPerCompany: 50,
          includePartialProfiles: false
        }
      })
    })

    if (!res.ok) {
      console.error('Lusha fetch failed:', res.status, await res.text())
      return []
    }

    const data = await res.json()
    return data.results ?? []

  } catch (error) {
    console.error('Lusha error:', error)
    return []
  }
}

async function enrichContact(contactId: string): Promise<{ email: string; phone: string }> {
  if (!LUSHA_API_KEY) return { email: '', phone: '' }

  try {
    const res = await fetch('https://api.lusha.com/v3/contacts/enrich', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_key': LUSHA_API_KEY
      },
      body: JSON.stringify({ ids: [contactId] })
    })

    if (!res.ok) {
      console.error('Enrich failed:', res.status, await res.text())
      return { email: '', phone: '' }
    }

    const data = await res.json()
    const enriched = data.results?.[0]
    if (!enriched) return { email: '', phone: '' }

    const emails = enriched.emails ?? []
    const phones = enriched.phones ?? []
    const email = emails.find((e: { emailStatus: string; email: string }) => e.emailStatus === 'verified')?.email ?? emails[0]?.email ?? ''
    const phone = phones[0]?.localNumber ?? phones[0]?.number ?? ''

    return { email, phone }
  } catch (e) {
    console.error('Enrich error:', e)
    return { email: '', phone: '' }
  }
}

function getPlaceholders(companyName: string) {
  const roles = ['CEO', 'CFO', 'COO', 'CMO', 'VP Product', 'VP Marketing', 'VP Operations', 'Head of NPD']
  const names: Record<string, string> = {
    'CFO': 'James Chen', 'COO': 'Emma Williams', 'CMO': 'David Park',
    'CEO': 'Sarah Mitchell', 'VP Product': 'Michael Torres',
    'VP Marketing': 'Jessica Lee', 'VP Operations': 'Andrew Thompson',
    'Head of NPD': 'Rachel Kim',
  }
  return roles.map(role => ({
    role,
    name: names[role] ?? 'Contact',
    email: `${role.toLowerCase().replace(/\s+/g, '.')}@${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
    phone: '+61 2 9000 0001',
    linkedin: '',
    verified: false,
    placeholder: true
  }))
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { brand_name, domain } = body

    if (!brand_name || typeof brand_name !== 'string') {
      return NextResponse.json({ error: 'brand_name is required' }, { status: 400 })
    }

    if (!LUSHA_API_KEY) {
      return NextResponse.json({ success: true, contacts: getPlaceholders(brand_name) })
    }

    const searchDomain = domain
      ? domain.replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0]
      : brand_name.toLowerCase().replace(/\s+/g, '') + '.com'

    const allContacts = await fetchCompanyContacts(searchDomain)

    if (!allContacts.length) {
      return NextResponse.json({ success: true, contacts: getPlaceholders(brand_name) })
    }

    const results = await Promise.all(allContacts.map(async contact => {
      const fullName = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim()
      const jobTitle = (contact.jobTitle as { title?: string })?.title ?? ''
      const seniority = (contact.jobTitle as { seniority?: string })?.seniority ?? ''
      const linkedin = (contact.socialLinks as { linkedin?: string })?.linkedin ?? ''
      const contactId = contact.id as string
      const canReveal = (contact.canReveal as { field: string; credits: number }[]) ?? []

      let email = ''
      let phone = ''

      if (contactId && canReveal.length > 0) {
        const enriched = await enrichContact(contactId)
        email = enriched.email
        phone = enriched.phone
      }

      const departments = (contact.jobTitle as { departments?: string[] })?.departments ?? []
      const department = departments[0] ?? 'Other'

      return {
        role: jobTitle || seniority,
        name: fullName,
        email,
        phone,
        linkedin,
        jobTitle,
        seniority,
        department,
        verified: !!email,
        contactId,
        placeholder: false
      }
    }))

    return NextResponse.json({ success: true, contacts: results })

  } catch (error) {
    console.error('Lookup contacts error:', error)
    return NextResponse.json({ error: 'Contact lookup failed' }, { status: 500 })
  }
}