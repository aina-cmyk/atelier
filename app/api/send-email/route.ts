import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

const REDIRECT_URI = process.env.PRODUCTION_URL
  ? `${process.env.PRODUCTION_URL}/api/auth/callback`
  : 'http://localhost:3000/api/auth/callback'

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    REDIRECT_URI
  )
}

interface Attachment {
  name: string
  type: string
  data: string // base64
}

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function makeEmailBody(to: string, subject: string, body: string, attachments?: Attachment[], cc?: string, bcc?: string): string {
  const ccAddresses = cc ? cc.split(',').map(e => e.trim()).filter(Boolean).join(', ') : ''
  const bccAddresses = bcc ? bcc.split(',').map(e => e.trim()).filter(Boolean).join(', ') : ''
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`

  if (!attachments || attachments.length === 0) {
    const lines = [
      `To: ${to}`,
      ...(ccAddresses ? [`Cc: ${ccAddresses}`] : []),
      ...(bccAddresses ? [`Bcc: ${bccAddresses}`] : []),
      `Subject: ${encodedSubject}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      body,
    ]
    return toBase64Url(Buffer.from(lines.join('\r\n')))
  }

  const boundary = `----=_Boundary_${Date.now().toString(36)}`
  const parts: string[] = [
    `To: ${to}`,
    ...(ccAddresses ? [`Cc: ${ccAddresses}`] : []),
    ...(bccAddresses ? [`Bcc: ${bccAddresses}`] : []),
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    body,
  ]

  for (const att of attachments) {
    const safeName = `=?UTF-8?B?${Buffer.from(att.name, 'utf-8').toString('base64')}?=`
    const chunks = att.data.match(/.{1,76}/g)?.join('\r\n') ?? att.data
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.type || 'application/octet-stream'}; name="${safeName}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${safeName}"`,
      '',
      chunks,
    )
  }

  parts.push(`--${boundary}--`)
  return toBase64Url(Buffer.from(parts.join('\r\n')))
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
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
    if (!res.ok) return null
    const data = await res.json()
    return (data.access_token as string) ?? null
  } catch {
    return null
  }
}

function isAuthError(error: unknown): boolean {
  return error instanceof Error && (
    error.message.includes('invalid_grant') ||
    error.message.includes('Invalid Credentials') ||
    error.message.includes('401')
  )
}

async function gmailSend(accessToken: string, raw: string): Promise<string> {
  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials({ access_token: accessToken })
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
  const result = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  return result.data.id!
}

export async function POST(request: NextRequest) {
  try {
    let accessToken = request.cookies.get('gmail_access_token')?.value
    const refreshToken = request.cookies.get('gmail_refresh_token')?.value

    if (!accessToken && !refreshToken) {
      return NextResponse.json(
        { error: 'Not authenticated — authorise Gmail first', reauth: true },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { to, cc, bcc, subject, emailBody, contactName, leadSource, senderName, attachments } = body

    if (!to || !subject || !emailBody) {
      return NextResponse.json(
        { error: 'to, subject, and emailBody are required' },
        { status: 400 }
      )
    }

    const raw = makeEmailBody(to, subject, emailBody, attachments, cc, bcc)
    let newAccessToken: string | null = null

    // If no access token but refresh token exists, refresh before first attempt
    if (!accessToken) {
      newAccessToken = await refreshAccessToken(refreshToken!)
      if (!newAccessToken) {
        return NextResponse.json(
          { error: 'Gmail session expired — re-authorise Gmail', reauth: true },
          { status: 401 }
        )
      }
      accessToken = newAccessToken
    }

    let messageId: string
    try {
      messageId = await gmailSend(accessToken, raw)
    } catch (sendError) {
      if (isAuthError(sendError) && refreshToken) {
        // Token expired mid-session — refresh and retry once
        newAccessToken = await refreshAccessToken(refreshToken)
        if (!newAccessToken) {
          return NextResponse.json(
            { error: 'Gmail session expired — re-authorise Gmail', reauth: true },
            { status: 401 }
          )
        }
        messageId = await gmailSend(newAccessToken, raw)
      } else {
        throw sendError
      }
    }

    const dossier = body.dossier
    if (dossier) {
      try {
        await fetch(`${request.nextUrl.origin}/api/save-to-sheets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand_name: dossier.brand_name,
            website: dossier.website,
            lead_source: leadSource ?? 'Outbound',
            revenue_estimate: dossier.revenue_estimate,
            retailers: dossier.retailers,
            category: dossier.category,
            icp_score: dossier.icp_score,
            score_band: dossier.score_band,
            signals: dossier.signals,
            target_role: body.role,
            contact_name: contactName,
            email_subject: subject,
            email_body: emailBody,
            status: 'Sent',
            sent_by: senderName ?? ''
          })
        })
      } catch (e) {
        console.error('Sheets sync failed:', e)
      }
    }

    try {
      const { isVercel, getLocalDb } = await import('@/lib/db')
      if (isVercel) {
        const { sql } = await import('@vercel/postgres')
        await sql`
          INSERT INTO contact_history (brand_name, contact_role, contact_name, contact_email, method)
          VALUES (${dossier?.brand_name ?? ''}, ${body.role ?? ''}, ${contactName}, ${to}, 'email')
        `
      } else {
        const db = getLocalDb()
        db.prepare('INSERT INTO contact_history (brand_name, contact_role, contact_name, contact_email, method) VALUES (?, ?, ?, ?, ?)').run(dossier?.brand_name ?? '', body.role ?? '', contactName, to, 'email')
      }
    } catch (e) {
      console.error('Failed to log contact history:', e)
    }

    const response = NextResponse.json({
      success: true,
      message_id: messageId,
      to,
      contact_name: contactName
    })

    // Persist the refreshed token so subsequent requests don't need to refresh again
    if (newAccessToken) {
      response.cookies.set('gmail_access_token', newAccessToken, {
        httpOnly: true,
        secure: !!process.env.PRODUCTION_URL,
        sameSite: 'lax',
        maxAge: 3600,
        path: '/',
      })
    }

    return response

  } catch (error: unknown) {
    console.error('Send email error:', error)

    if (isAuthError(error)) {
      return NextResponse.json(
        { error: 'Gmail session expired — re-authorise Gmail', reauth: true },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    )
  }
}
