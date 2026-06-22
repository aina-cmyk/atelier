import { NextRequest, NextResponse } from 'next/server'
import { makeEmailRaw, sendViaGmail, isGmailAuthError } from '@/lib/gmail'

interface ScheduledEmail {
  id: number
  to_email: string
  cc: string
  bcc: string
  subject: string
  body: string
  brand_name: string
  contact_name: string
  scheduled_at: string
  gmail_access_token: string
  gmail_refresh_token: string
}

// Verbose token refresh — logs every detail so we can diagnose 400s from Google
async function refreshTokenWithLogging(refreshToken: string, emailId: number): Promise<{ token: string | null; status: number; errorBody: unknown }> {
  const clientId = process.env.GMAIL_CLIENT_ID ?? ''
  const clientSecret = process.env.GMAIL_CLIENT_SECRET ?? ''

  console.log(`[cron] Email ${emailId}: token refresh — GMAIL_CLIENT_ID length=${clientId.length} GMAIL_CLIENT_SECRET present=${!!clientSecret} refresh_token length=${refreshToken.length}`)

  if (!clientId || !clientSecret) {
    console.error(`[cron] Email ${emailId}: GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET is missing from environment`)
    return { token: null, status: 0, errorBody: 'Missing env vars' }
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  let res: Response
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })
  } catch (fetchErr) {
    console.error(`[cron] Email ${emailId}: network error calling Google token endpoint:`, fetchErr)
    return { token: null, status: 0, errorBody: String(fetchErr) }
  }

  const responseText = await res.text()
  console.log(`[cron] Email ${emailId}: Google token response status=${res.status} body=${responseText}`)

  if (!res.ok) {
    let parsedError: unknown = responseText
    try { parsedError = JSON.parse(responseText) } catch {}
    return { token: null, status: res.status, errorBody: parsedError }
  }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(responseText)
  } catch {
    console.error(`[cron] Email ${emailId}: could not parse successful token response`)
    return { token: null, status: res.status, errorBody: 'Could not parse response' }
  }

  const token = (data.access_token as string) ?? null
  console.log(`[cron] Email ${emailId}: token refresh succeeded, new access_token present=${!!token}`)
  return { token, status: res.status, errorBody: null }
}

async function markSent(emailId: number, isVercel: boolean, getLocalDb: () => unknown) {
  if (isVercel) {
    const { sql } = await import('@vercel/postgres')
    await sql`UPDATE scheduled_emails SET sent = true WHERE id = ${emailId}`
  } else {
    const db = getLocalDb() as { prepare: (q: string) => { run: (...a: unknown[]) => void } }
    db.prepare('UPDATE scheduled_emails SET sent = 1 WHERE id = ?').run(emailId)
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { isVercel, getLocalDb } = await import('@/lib/db')
  let emails: ScheduledEmail[] = []

  console.log('[cron] Starting send-scheduled-emails run, isVercel:', isVercel)
  console.log('[cron] Env check — GMAIL_CLIENT_ID present:', !!process.env.GMAIL_CLIENT_ID, 'GMAIL_CLIENT_SECRET present:', !!process.env.GMAIL_CLIENT_SECRET, 'CRON_SECRET present:', !!process.env.CRON_SECRET)

  try {
    if (isVercel) {
      const { sql } = await import('@vercel/postgres')

      const allRows = await sql`SELECT id, scheduled_at, sent FROM scheduled_emails ORDER BY scheduled_at ASC`
      console.log('[cron] All scheduled_emails rows:', JSON.stringify(allRows.rows))
      console.log('[cron] Server NOW (UTC):', new Date().toISOString())

      const result = await sql`
        SELECT * FROM scheduled_emails
        WHERE scheduled_at <= NOW() AND sent = false
        ORDER BY scheduled_at ASC
      `
      console.log('[cron] Emails due (scheduled_at <= NOW() AND sent = false):', result.rows.length)
      emails = result.rows as ScheduledEmail[]
    } else {
      const db = getLocalDb() as { prepare: (q: string) => { all: () => unknown[] } }
      const allRows = db.prepare('SELECT id, scheduled_at, sent FROM scheduled_emails ORDER BY scheduled_at ASC').all()
      console.log('[cron] All scheduled_emails rows:', JSON.stringify(allRows))
      console.log('[cron] Server NOW (UTC):', new Date().toISOString())

      emails = (db as unknown as { prepare: (q: string) => { all: () => ScheduledEmail[] } })
        .prepare(`SELECT * FROM scheduled_emails WHERE scheduled_at <= datetime('now') AND sent = 0 ORDER BY scheduled_at ASC`)
        .all()
      console.log('[cron] Emails due:', emails.length)
    }
  } catch (e) {
    console.error('[cron] Failed to query scheduled emails:', e)
    return NextResponse.json({ error: 'Database error', detail: String(e) }, { status: 500 })
  }

  if (emails.length === 0) {
    console.log('[cron] No emails due — exiting')
    return NextResponse.json({ success: true, sent: 0 })
  }

  console.log('[cron] Processing', emails.length, 'email(s)')

  let sent = 0
  const errors: { id: number; reason: string; detail?: unknown }[] = []

  for (const email of emails) {
    console.log(`[cron] Processing email id=${email.id} to=${email.to_email} scheduled_at=${email.scheduled_at}`)
    try {
      let accessToken = email.gmail_access_token
      const refreshToken = email.gmail_refresh_token

      console.log(`[cron] Email ${email.id}: access_token present=${!!accessToken} refresh_token present=${!!refreshToken}`)

      if (!accessToken && !refreshToken) {
        console.warn(`[cron] Email ${email.id}: no tokens stored — marking sent to stop retrying`)
        await markSent(email.id, isVercel, getLocalDb)
        errors.push({ id: email.id, reason: 'no tokens stored' })
        continue
      }

      // Proactive refresh when no access token
      if (!accessToken && refreshToken) {
        console.log(`[cron] Email ${email.id}: no access token, attempting proactive refresh`)
        const { token, status, errorBody } = await refreshTokenWithLogging(refreshToken, email.id)
        if (!token) {
          const reason = `proactive token refresh failed (HTTP ${status})`
          console.error(`[cron] Email ${email.id}: ${reason}`, errorBody)
          if (status === 400) {
            console.warn(`[cron] Email ${email.id}: 400 from Google — invalid refresh token, marking sent to stop retrying`)
            await markSent(email.id, isVercel, getLocalDb)
          }
          errors.push({ id: email.id, reason, detail: errorBody })
          continue
        }
        accessToken = token
      }

      const raw = makeEmailRaw(email.to_email, email.subject, email.body, email.cc || undefined, email.bcc || undefined)
      console.log(`[cron] Email ${email.id}: raw message built, attempting Gmail send`)

      let messageId: string
      try {
        messageId = await sendViaGmail(accessToken, raw)
        console.log(`[cron] Email ${email.id}: Gmail send succeeded, messageId=${messageId}`)
      } catch (sendErr) {
        const sendErrMsg = sendErr instanceof Error ? sendErr.message : String(sendErr)
        console.error(`[cron] Email ${email.id}: Gmail send failed:`, sendErrMsg)

        if (isGmailAuthError(sendErr) && refreshToken) {
          console.log(`[cron] Email ${email.id}: auth error — retrying with refreshed token`)
          const { token, status, errorBody } = await refreshTokenWithLogging(refreshToken, email.id)
          if (!token) {
            const reason = `retry token refresh failed (HTTP ${status})`
            console.error(`[cron] Email ${email.id}: ${reason}`, errorBody)
            if (status === 400) {
              console.warn(`[cron] Email ${email.id}: 400 from Google — marking sent to stop retrying`)
              await markSent(email.id, isVercel, getLocalDb)
            }
            errors.push({ id: email.id, reason, detail: errorBody })
            continue
          }
          console.log(`[cron] Email ${email.id}: retry token refresh succeeded, resending`)
          messageId = await sendViaGmail(token, raw)
          console.log(`[cron] Email ${email.id}: retry send succeeded, messageId=${messageId}`)
        } else {
          throw sendErr
        }
      }

      console.log(`[cron] Email ${email.id}: marking as sent in database`)
      await markSent(email.id, isVercel, getLocalDb)
      console.log(`[cron] Email ${email.id}: marked as sent`)

      // Log to contact history
      try {
        if (isVercel) {
          const { sql } = await import('@vercel/postgres')
          await sql`INSERT INTO contact_history (brand_name, contact_role, contact_name, contact_email, method) VALUES (${email.brand_name}, '', ${email.contact_name}, ${email.to_email}, 'email')`
        } else {
          const db = getLocalDb() as { prepare: (q: string) => { run: (...a: unknown[]) => void } }
          db.prepare('INSERT INTO contact_history (brand_name, contact_role, contact_name, contact_email, method) VALUES (?, ?, ?, ?, ?)').run(email.brand_name, '', email.contact_name, email.to_email, 'email')
        }
      } catch {}

      // Update pipeline status
      if (email.brand_name) {
        try {
          const base = process.env.PRODUCTION_URL ?? 'http://localhost:3000'
          await fetch(`${base}/api/save-to-sheets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              brand_name: email.brand_name, contact_name: email.contact_name,
              email_subject: email.subject, email_body: email.body,
              status: 'Sent', lead_source: 'Scheduled',
              website: '', revenue_estimate: '', retailers: [],
              category: '', icp_score: 0, score_band: '', signals: [], target_role: '',
            }),
          })
        } catch {}
      }

      console.log(`[cron] Done: email ${email.id} → ${email.to_email} (msgId: ${messageId!})`)
      sent++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[cron] Unexpected error for email ${email.id}:`, msg)
      errors.push({ id: email.id, reason: msg })
    }
  }

  console.log(`[cron] Run complete: sent=${sent} errors=${errors.length}`)
  return NextResponse.json({ success: true, sent, errors: errors.length ? errors : undefined })
}
