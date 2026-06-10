import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Atelier',
  description: 'AI Sales Intelligence',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="app">
          <aside className="sidebar">
            <div className="sidebar-brand">
              <span style={{ color: '#fff', fontSize: '15px', fontFamily: 'var(--font-display)', fontWeight: 500, letterSpacing: '0.2em' }}>ATELIER®</span>
            </div>
            <div className="sidebar-tagline">Sales Intelligence</div>

            <nav className="nav">
              <a href="/" className="nav-item">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" strokeWidth="2"/><rect x="14" y="3" width="7" height="7" rx="1" strokeWidth="2"/><rect x="3" y="14" width="7" height="7" rx="1" strokeWidth="2"/><rect x="14" y="14" width="7" height="7" rx="1" strokeWidth="2"/></svg>
                Dashboard
              </a>
              <a href="/dossier" className="nav-item">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" strokeWidth="2"/><path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round"/></svg>
                Research
              </a>
              <a href="/email" className="nav-item">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2" strokeWidth="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" strokeWidth="2"/></svg>
                Email Generator
              </a>
              <a href="/pipeline" className="nav-item">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6" strokeWidth="2" strokeLinecap="round"/><line x1="8" y1="12" x2="21" y2="12" strokeWidth="2" strokeLinecap="round"/><line x1="8" y1="18" x2="21" y2="18" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="6" x2="3.01" y2="6" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="12" x2="3.01" y2="12" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="18" x2="3.01" y2="18" strokeWidth="2" strokeLinecap="round"/></svg>
                Pipeline
              </a>
            </nav>

            <div className="sidebar-foot">
              <div className="avatar">SA</div>
              <div className="who">
                <div className="nm">Samara Abells</div>
                <div className="rl">VP, Client Partnerships</div>
              </div>
            </div>
          </aside>

          <main className="main">
            <div className="main-inner">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  )
}