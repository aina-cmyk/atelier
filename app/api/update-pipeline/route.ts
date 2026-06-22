import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { brand_name, status } = body

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

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Sheet1!A:O'
    })

    const rows = response.data.values ?? []
    console.log('[update-pipeline] received brand_name:', brand_name, 'status:', status)
    console.log('[update-pipeline] total rows in sheet:', rows.length)
    console.log('[update-pipeline] first 5 brand names:', rows.slice(0, 5).map(r => r[0]))

    const rowIndex = rows.findIndex(row => row[0]?.toLowerCase() === brand_name?.toLowerCase())
    console.log('[update-pipeline] matched rowIndex:', rowIndex, rowIndex !== -1 ? `(sheet row ${rowIndex + 1}, brand="${rows[rowIndex][0]}")` : '(no match)')

    if (rowIndex === -1) {
      return NextResponse.json({ error: 'Brand not found in pipeline', brand_name, total_rows: rows.length }, { status: 404 })
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Sheet1!O${rowIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[status]] }
    })

    console.log('[update-pipeline] successfully updated row', rowIndex + 1, 'column O to', status)
    return NextResponse.json({ success: true, row: rowIndex + 1, brand_name: rows[rowIndex][0] })

  } catch (error) {
    console.error('Update pipeline error:', error)
    return NextResponse.json({ error: 'Failed to update pipeline' }, { status: 500 })
  }
}