import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createServiceClient, getBalance, getClientConfig, getAdminConfig } from '@/app/lib/billingApi'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request.headers.get('authorization'))
  if (!auth) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const sb = createServiceClient()
  const [balance, config, adminConfig] = await Promise.all([
    getBalance(sb, auth.userId),
    getClientConfig(sb, auth.userId),
    getAdminConfig(sb),
  ])
  return NextResponse.json({
    balance,
    billing_mode:             config?.billing_mode ?? 'prepaid',
    invoice_trigger:          config?.invoice_trigger ?? 'monthly',
    invoice_threshold_cents:  config?.invoice_threshold_cents ?? 5000,
    monthly_invoice_day:      adminConfig?.monthly_invoice_day ?? 27,
  })
}
