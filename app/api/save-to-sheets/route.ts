import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      brand_name,
      website,
      lead_source,
      revenue_estimate,
      retailers,
      category,
      icp_score,
      score_band,
      signals,
      target_role,
      contact_name,
      email_subject,
      email_body,
      status,
      sent_by
    } = body

    const serviceAccountRaw = process.env.GOOGLE_SERVICE_ACCOUNT
    if (!serviceAccountRaw) {
      return NextResponse.json({ error: 'Service account not configured' }, { status: 500 })
    }

    const serviceAccount = JSON.parse(serviceAccountRaw)

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    })

    const sheets = google.sheets({ version: 'v4', auth })

    const retailerNames = Array.isArray(retailers)
      ? retailers.map((r: { name: string }) => r.name).join(', ')
      : retailers

    const signalSummary = Array.isArray(signals)
      ? signals.slice(0, 3).map((s: { type: string }) => s.type.replace(/_/g, ' ')).join(', ')
      : signals

    const row = [
      brand_name ?? '',
      website ?? '',
      lead_source ?? 'Outbound',
      revenue_estimate ?? '',
      retailerNames ?? '',
      category ?? '',
      icp_score ?? '',
      score_band ?? '',
      signalSummary ?? '',
      target_role ?? '',
      contact_name ?? '',
      email_subject ?? '',
      email_body ?? '',
      new Date().toLocaleDateString('en-AU'),
      status ?? 'Sent',
      '',
      sent_by ?? ''
    ]

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:P',
      valueInputOption: 'RAW',
      requestBody: { values: [row] }
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Save to sheets error:', error)
    return NextResponse.json({ error: 'Failed to save to sheets' }, { status: 500 })
  }
}