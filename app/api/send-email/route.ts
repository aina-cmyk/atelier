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

function makeEmailBody(to: string, subject: string, body: string): string {
  const email = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body
  ].join('\n')

  return Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function POST(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('gmail_access_token')?.value
    const refreshToken = request.cookies.get('gmail_refresh_token')?.value

    if (!accessToken && !refreshToken) {
      return NextResponse.json(
        { error: 'Not authenticated — authorise Gmail first', reauth: true },
        { status: 401 }
      )
    }

    const oauth2Client = getOAuthClient()
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken
    })

    const body = await request.json()
    const { to, subject, emailBody, contactName, leadSource } = body

    if (!to || !subject || !emailBody) {
      return NextResponse.json(
        { error: 'to, subject, and emailBody are required' },
        { status: 400 }
      )
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    const raw = makeEmailBody(to, subject, emailBody)

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    })

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
            email_subject: body.subject,
            email_body: body.emailBody,
            status: 'Sent'
          })
        })
      } catch (e) {
        console.error('Sheets sync failed:', e)
      }
    }

    try {
      const { sql } = await import('@vercel/postgres')
      await sql`
        INSERT INTO contact_history (brand_name, contact_role, contact_name, contact_email, method)
        VALUES (${body.dossier?.brand_name ?? ''}, ${body.role ?? ''}, ${contactName}, ${to}, 'email')
      `
    } catch (e) {
      console.error('Failed to log contact history:', e)
    }

    return NextResponse.json({
      success: true,
      message_id: result.data.id,
      to,
      contact_name: contactName
    })

  } catch (error: unknown) {
    console.error('Send email error:', error)

    const isAuthError = error instanceof Error &&
      (error.message.includes('invalid_grant') || error.message.includes('Invalid Credentials'))

    if (isAuthError) {
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