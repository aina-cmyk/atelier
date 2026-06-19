import { jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'atelier-dev-secret-key-change-in-prod')

export interface UserSession {
  email: string
  name: string
  picture: string
  accessToken: string
  refreshToken?: string
}

export async function getSession(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('atelier_session')?.value
    if (!token) return null
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as UserSession
  } catch {
    return null
  }
}