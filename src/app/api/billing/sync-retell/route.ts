import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/app/lib/billingApi'
import { runRetellBillingSync } from '@/app/lib/retellBillingSync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

// Vercel cron fires GET; manual trigger (legacy) uses POST
export async function GET(request: NextRequest) { return handle(request) }
export async function POST(request: NextRequest) { return handle(request) }

async function handle(request: NextRequest) {
  const authHeader   = request.headers.get('authorization')
  const secretHeader = request.headers.get('x-cron-secret')
  const querySecret  = new URL(request.url).searchParams.get('secret')
  const provided     = secretHeader ?? querySecret ?? authHeader?.replace('Bearer ', '')

  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb     = createServiceClient()
  const result = await runRetellBillingSync(sb)
  console.log('[sync-retell] complete:', result)
  return NextResponse.json(result, { status: result.error_message ? 500 : 200 })
}
