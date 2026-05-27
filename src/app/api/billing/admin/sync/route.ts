import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, createServiceClient } from '@/app/lib/billingApi'
import { runRetellBillingSync } from '@/app/lib/retellBillingSync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const sb     = createServiceClient()
  const result = await runRetellBillingSync(sb)
  console.log('[admin/sync] complete:', result)
  return NextResponse.json(result, { status: result.error_message ? 400 : 200 })
}
