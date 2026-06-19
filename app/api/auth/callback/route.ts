import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { SignJWT } from 'jose'

const REDIRECT_URI = process.env.PRODUCTION_URL
  ? `${process.env.PRODUCTION_URL}/api/auth/callback`
  : 'http://localhost:3000/api/auth/callback'

const APP_URL = process.env.PRODUCTION_URL ?? 'http://localhost:3000'
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'atelier-dev-secret-key-change-in-prod')

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
    oauth2Client.setCredentials(tokens)

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const userInfo = await oauth2.userinfo.get()

    const userEmail = userInfo.data.email ?? ''
    const userName = userInfo.data.name ?? ''
    const userPicture = userInfo.data.picture ?? ''

    const jwt = await new SignJWT({
      email: userEmail,
      name: userName,
      picture: userPicture,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('30d')
      .sign(JWT_SECRET)

    const response = NextResponse.redirect(`${APP_URL}/`)
    response.cookies.set('atelier_session', jwt, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
      secure: !!process.env.PRODUCTION_URL,
      sameSite: 'lax'
    })

    response.cookies.set('gmail_access_token', tokens.access_token ?? '', {
      httpOnly: true,
      maxAge: 3600,
      path: '/'
    })

    if (tokens.refresh_token) {
      response.cookies.set(`gmail_refresh_token_${userEmail}`, tokens.refresh_token, {
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