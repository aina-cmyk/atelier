# Atelier Sales Intelligence Tool

## What It Does

The Atelier Sales Intelligence Tool is an AI-powered B2B outreach platform built for Atelier's VP of Client Partnerships. It automates brand research, ICP scoring, contact finding, and personalised email generation for prestige beauty brands across ANZ and the US. The tool researches any brand using live web search, scores it against Atelier's Ideal Customer Profile, surfaces buying signals, finds decision-maker contacts via Lusha, generates personalised cold outreach emails, and tracks all activity in a Google Sheets pipeline.

---

## Tech Stack

- **Framework:** Next.js 14 (App Router, TypeScript)
- **AI:** Anthropic Claude Sonnet 4.6 with web search tool
- **Database:** Vercel Postgres (production), SQLite via better-sqlite3 (local)
- **Auth:** Google OAuth2 (Gmail send scope + userinfo)
- **Integrations:** Lusha API v3 (contacts), Google Sheets API v4 (pipeline), Gmail API (send)
- **Deployment:** Vercel (auto-deploy from GitHub main)
- **Session:** JWT via jose library
