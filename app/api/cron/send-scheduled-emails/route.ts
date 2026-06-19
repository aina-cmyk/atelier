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

  try {
    if (isVercel) {
      const { sql } = await import('@vercel/postgres')
      const result = await sql`
        SELECT * FROM scheduled_emails
        WHERE scheduled_at <= NOW() AND sent = false
        ORDER BY scheduled_at ASC
      `
      emails = result.rows as ScheduledEmail[]
    } else {
      const db = getLocalDb()
      emails = db.prepare(`
        SELECT * FROM scheduled_emails
        WHERE scheduled_at <= datetime('now') AND sent = 0
        ORDER BY scheduled_at ASC
      `).all() as ScheduledEmail[]
    }
  } catch (e) {
    console.error('Cron: failed to query scheduled emails:', e)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  if (emails.length === 0) {
    return NextResponse.json({ success: true, sent: 0 })
  }

  let sent = 0
  const errors: string[] = []

  for (const email of emails) {
    try {
      let accessToken = email.gmail_access_token
      const refreshToken = email.gmail_refresh_token

      if (!accessToken && !refreshToken) {
        errors.push(`Email ${email.id}: no tokens stored`)
        continue
      }

      // Refresh proactively if no access token
      if (!accessToken && refreshToken) {
        const newToken = await refreshGmailToken(refreshToken)
        if (!newToken) {
          errors.push(`Email ${email.id}: token refresh failed`)
          continue
        }
        accessToken = newToken
      }

      const raw = makeEmailRaw(email.to_email, email.subject, email.body, email.cc || undefined, email.bcc || undefined)

      let messageId: string
      try {
        messageId = await sendViaGmail(accessToken, raw)
      } catch (sendErr) {
        if (isGmailAuthError(sendErr) && refreshToken) {
          const newToken = await refreshGmailToken(refreshToken)
          if (!newToken) throw sendErr
          messageId = await sendViaGmail(newToken, raw)
        } else {
          throw sendErr
        }
      }

      // Mark as sent
      if (isVercel) {
        const { sql } = await import('@vercel/postgres')
        await sql`UPDATE scheduled_emails SET sent = true WHERE id = ${email.id}`
      } else {
        const db = getLocalDb()
        db.prepare('UPDATE scheduled_emails SET sent = 1 WHERE id = ?').run(email.id)
      }

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

      console.log(`Cron: sent scheduled email ${email.id} → ${email.to_email} (msgId: ${messageId})`)
      sent++
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error'
      console.error(`Cron: failed to send email ${email.id}:`, msg)
      errors.push(`Email ${email.id}: ${msg}`)
    }
  }

  return NextResponse.json({ success: true, sent, ...(errors.length ? { errors } : {}) })
}
