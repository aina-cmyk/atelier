import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'atelier-dev-secret-key-change-in-prod')

const PUBLIC_PATHS = ['/api/auth/gmail', '/api/auth/callback']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  const token = request.cookies.get('atelier_session')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/api/auth/gmail', request.url))
  }

  try {
    await jwtVerify(token, JWT_SECRET)
    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL('/api/auth/gmail', request.url))
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}