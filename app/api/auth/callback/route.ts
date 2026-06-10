import { NextRequest, NextResponse } from 'next/server'
import { OAuth2Client } from 'google-auth-library'

const client = new OAuth2Client(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'http://localhost:3000/api/auth/callback'
)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 })
  }

  try {
    const { tokens } = await client.getToken(code)

    const response = NextResponse.redirect('http://localhost:3000/email')
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