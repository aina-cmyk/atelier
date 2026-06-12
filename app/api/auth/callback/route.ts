import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

const REDIRECT_URI = process.env.PRODUCTION_URL
  ? `${process.env.PRODUCTION_URL}/api/auth/callback`
  : 'http://localhost:3000/api/auth/callback'

const APP_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 })
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      REDIRECT_URI
    )

    const { tokens } = await oauth2Client.getToken(code)

    const response = NextResponse.redirect(`${APP_URL}/email`)
    response.cookies.set('gmail_access_token', tokens.access_token ?? '', {
      httpOnly: true,
      maxAge: 3600,
      path: '/'
    })
    if (tokens.refresh_token) {
      response.cookies.set('gmail_refresh_token', tokens.refresh_token, {
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 30,
        path: '/'
      })
    }

    return response

  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.json({ error: 'Auth failed' }, { status: 500 })
  }
}