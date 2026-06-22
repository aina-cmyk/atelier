import { NextRequest, NextResponse } from 'next/server'

async function verifyRefreshToken(refreshToken: string): Promise<boolean> {
  if (!refreshToken) return false
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GMAIL_CLIENT_ID ?? '',
        client_secret: process.env.GMAIL_CLIENT_SECRET ?? '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Convert a datetime-local string ("2024-06-20T10:00") interpreted in the given
// IANA timezone into a UTC Date. Works without external dependencies.
function localToUTC(localStr: string, timezone: string): Date {
  const [datePart, timePart] = localStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes] = (timePart ?? '10:00').split(':').map(Number)

  // Step 1: treat the local time as if it were UTC to get a reference timestamp
  const fakeUTC = Date.UTC(year, month - 1, day, hours, minutes)

  // Step 2: find out what that UTC timestamp looks like in the target timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(fakeUTC))
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value ?? '0')

  // Step 3: the diff between what we asked for and what the timezone shows is the offset
  const diff = fakeUTC - Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return new Date(fakeUTC + diff)
}

export async function POST(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('gmail_access_token')?.value ?? ''
    const refreshToken = request.cookies.get('gmail_refresh_token')?.value ?? ''

    const body = await request.json()
    const { to, cc, bcc, subject, body: emailBody, brand_name, contact_name, scheduled_at_local, timezone, sent_by, dossier } = body

    if (!to || !subject || !emailBody || !scheduled_at_local) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!refreshToken) {
      return NextResponse.json({ error: 'Gmail session expired — please re-authenticate before scheduling', reauth: true }, { status: 401 })
    }

    const tokenValid = await verifyRefreshToken(refreshToken)
    if (!tokenValid) {
      return NextResponse.json({ error: 'Gmail session expired — please re-authenticate before scheduling', reauth: true }, { status: 401 })
    }

    const scheduledAt = localToUTC(scheduled_at_local, timezone ?? 'Australia/Sydney')

    const { isVercel, getLocalDb } = await import('@/lib/db')
    const dossierJson = dossier ? JSON.stringify(dossier) : ''

    if (isVercel) {
      const { sql } = await import('@vercel/postgres')
      await sql`
        INSERT INTO scheduled_emails
          (to_email, cc, bcc, subject, body, brand_name, contact_name, scheduled_at, gmail_access_token, gmail_refresh_token, timezone, sent_by, dossier_json)
        VALUES
          (${to}, ${cc ?? ''}, ${bcc ?? ''}, ${subject}, ${emailBody},
           ${brand_name ?? ''}, ${contact_name ?? ''}, ${scheduledAt.toISOString()},
           ${accessToken}, ${refreshToken}, ${timezone ?? 'Australia/Sydney'}, ${sent_by ?? ''}, ${dossierJson})
      `
    } else {
      const db = getLocalDb()
      db.prepare(`
        INSERT INTO scheduled_emails
          (to_email, cc, bcc, subject, body, brand_name, contact_name, scheduled_at, gmail_access_token, gmail_refresh_token, timezone, sent_by, dossier_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(to, cc ?? '', bcc ?? '', subject, emailBody, brand_name ?? '', contact_name ?? '', scheduledAt.toISOString(), accessToken, refreshToken, timezone ?? 'Australia/Sydney', sent_by ?? '', dossierJson)
    }

    return NextResponse.json({ success: true, scheduled_at: scheduledAt.toISOString() })
  } catch (e) {
    console.error('Schedule email error:', e)
    return NextResponse.json({ error: 'Failed to schedule email' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const { isVercel, getLocalDb } = await import('@/lib/db')
    if (isVercel) {
      const { sql } = await import('@vercel/postgres')
      const result = await sql`
        SELECT id, to_email, cc, subject, brand_name, contact_name, scheduled_at, timezone
        FROM scheduled_emails
        WHERE sent = false
        ORDER BY scheduled_at ASC
      `
      return NextResponse.json({ success: true, emails: result.rows })
    } else {
      const db = getLocalDb()
      const emails = db.prepare(`
        SELECT id, to_email, cc, subject, brand_name, contact_name, scheduled_at, timezone
        FROM scheduled_emails
        WHERE sent = 0
        ORDER BY scheduled_at ASC
      `).all()
      return NextResponse.json({ success: true, emails })
    }
  } catch (e) {
    console.error('Fetch scheduled emails error:', e)
    return NextResponse.json({ error: 'Failed to fetch scheduled emails' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const { isVercel, getLocalDb } = await import('@/lib/db')
    if (isVercel) {
      const { sql } = await import('@vercel/postgres')
      await sql`DELETE FROM scheduled_emails WHERE id = ${id}`
    } else {
      const db = getLocalDb()
      db.prepare('DELETE FROM scheduled_emails WHERE id = ?').run(id)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Cancel scheduled email error:', e)
    return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 })
  }
}
