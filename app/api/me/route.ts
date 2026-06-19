import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ user: null })
    }
    return NextResponse.json({
      user: {
        name: session.name,
        email: session.email,
        picture: session.picture
      }
    })
  } catch {
    return NextResponse.json({ user: null })
  }
}