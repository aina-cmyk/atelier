import { NextResponse } from 'next/server'
import { google } from 'googleapis'

const REDIRECT_URI = process.env.PRODUCTION_URL
  ? `${process.env.PRODUCTION_URL}/api/auth/callback`
  : 'http://localhost:3000/api/auth/callback'

export async function GET() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    REDIRECT_URI
  )

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ],
    prompt: 'consent'
  })

  return NextResponse.redirect(url)
}