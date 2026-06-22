import { NextRequest, NextResponse } from 'next/server'
import { makeEmailRaw, refreshGmailToken, sendViaGmail, isGmailAuthError } from '@/lib/gmail'

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

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { isVercel, getLocalDb } = await import('@/lib/db')
  let emails: ScheduledEmail[] = []

  console.log('[cron] Starting send-scheduled-emails run, isVercel:', isVercel)

  try {
    if (isVercel) {
      const { sql } = await import('@vercel/postgres')

      // Debug: check what rows exist regardless of time filter
      const allRows = await sql`SELECT id, scheduled_at, sent FROM scheduled_emails ORDER BY scheduled_at ASC`
      console.log('[cron] All scheduled_emails rows:', JSON.stringify(allRows.rows))

      const now = new Date().toISOString()
      console.log('[cron] Server NOW (UTC):', now)

      const result = await sql`
        SELECT * FROM scheduled_emails
        WHERE scheduled_at <= NOW() AND sent = false
        ORDER BY scheduled_at ASC
      `
      console.log('[cron] Emails due (scheduled_at <= NOW() AND sent = false):', result.rows.length)
      emails = result.rows as ScheduledEmail[]
    } else {
      const db = getLocalDb()

      const allRows = db.prepare('SELECT id, scheduled_at, sent FROM scheduled_emails ORDER BY scheduled_at ASC').all()
      console.log('[cron] All scheduled_emails rows:', JSON.stringify(allRows))
      console.log('[cron] Server NOW (UTC):', new Date().toISOString())

      emails = db.prepare(`
        SELECT * FROM scheduled_emails
        WHERE scheduled_at <= datetime('now') AND sent = 0
        ORDER BY scheduled_at ASC
      `).all() as ScheduledEmail[]
      console.log('[cron] Emails due:', emails.length)
    }
  } catch (e) {
    console.error('[cron] Failed to query scheduled emails:', e)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  if (emails.length === 0) {
    console.log('[cron] No emails due — exiting')
    return NextResponse.json({ success: true, sent: 0 })
  }

  console.log('[cron] Processing', emails.length, 'email(s)')

  let sent = 0
  const errors: string[] = []

  for (const email of emails) {
    console.log(`[cron] Processing email id=${email.id} to=${email.to_email} scheduled_at=${email.scheduled_at}`)
    try {
      let accessToken = email.gmail_access_token
      const refreshToken = email.gmail_refresh_token

      console.log(`[cron] Email ${email.id}: access_token present=${!!accessToken} refresh_token present=${!!refreshToken}`)

      if (!accessToken && !refreshToken) {
        console.warn(`[cron] Email ${email.id}: no tokens stored — skipping`)
        errors.push(`Email ${email.id}: no tokens stored`)
        continue
      }

      // Refresh proactively if no access token
      if (!accessToken && refreshToken) {
        console.log(`[cron] Email ${email.id}: no access token, attempting refresh`)
        const newToken = await refreshGmailToken(refreshToken)
        if (!newToken) {
          console.error(`[cron] Email ${email.id}: token refresh failed`)
          errors.push(`Email ${email.id}: token refresh failed`)
          continue
        }
        console.log(`[cron] Email ${email.id}: token refresh succeeded`)
        accessToken = newToken
      }

      const raw = makeEmailRaw(email.to_email, email.subject, email.body, email.cc || undefined, email.bcc || undefined)
      console.log(`[cron] Email ${email.id}: raw message built, attempting Gmail send`)

      let messageId: string
      try {
        messageId = await sendViaGmail(accessToken, raw)
        console.log(`[cron] Email ${email.id}: Gmail send succeeded, messageId=${messageId}`)
      } catch (sendErr) {
        console.error(`[cron] Email ${email.id}: Gmail send failed:`, sendErr instanceof Error ? sendErr.message : sendErr)
        if (isGmailAuthError(sendErr) && refreshToken) {
          console.log(`[cron] Email ${email.id}: auth error detected, retrying with refreshed token`)
          const newToken = await refreshGmailToken(refreshToken)
          if (!newToken) {
            console.error(`[cron] Email ${email.id}: retry token refresh failed`)
            throw sendErr
          }
          console.log(`[cron] Email ${email.id}: retry token refresh succeeded, resending`)
          messageId = await sendViaGmail(newToken, raw)
          console.log(`[cron] Email ${email.id}: retry send succeeded, messageId=${messageId}`)
        } else {
          throw sendErr
        }
      }

      // Mark as sent
      console.log(`[cron] Email ${email.id}: marking as sent in database`)
      if (isVercel) {
        const { sql } = await import('@vercel/postgres')
        await sql`UPDATE scheduled_emails SET sent = true WHERE id = ${email.id}`
      } else {
        const db = getLocalDb()
        db.prepare('UPDATE scheduled_emails SET sent = 1 WHERE id = ?').run(email.id)
      }
      console.log(`[cron] Email ${email.id}: marked as sent`)

      // Log to contact history
      try {
        const { isVercel: iv, getLocalDb: gld } = await import('@/lib/db')
        if (iv) {
          const { sql } = await import('@vercel/postgres')
          await sql`
            INSERT INTO contact_history (brand_name, contact_role, contact_name, contact_email, method)
            VALUES (${email.brand_name}, '', ${email.contact_name}, ${email.to_email}, 'email')
          `
        } else {
          const db = gld()
          db.prepare('INSERT INTO contact_history (brand_name, contact_role, contact_name, contact_email, method) VALUES (?, ?, ?, ?, ?)').run(email.brand_name, '', email.contact_name, email.to_email, 'email')
        }
      } catch {}

      // Update pipeline status via save-to-sheets
      if (email.brand_name) {
        try {
          const base = process.env.PRODUCTION_URL ?? 'http://localhost:3000'
          await fetch(`${base}/api/save-to-sheets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              brand_name: email.brand_name,
              contact_name: email.contact_name,
              email_subject: email.subject,
              email_body: email.body,
              status: 'Sent',
              lead_source: 'Scheduled',
              website: '', revenue_estimate: '', retailers: [],
              category: '', icp_score: 0, score_band: '', signals: [],
              target_role: '',
            }),
          })
        } catch {}
      }

      console.log(`[cron] Done: email ${email.id} → ${email.to_email} (msgId: ${messageId})`)
      sent++
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error'
      console.error(`[cron] Failed to send email ${email.id}:`, msg)
      errors.push(`Email ${email.id}: ${msg}`)
    }
  }

  console.log(`[cron] Run complete: sent=${sent} errors=${errors.length}`)
  return NextResponse.json({ success: true, sent, ...(errors.length ? { errors } : {}) })
}
