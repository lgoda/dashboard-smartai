import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, generatePostpaidInvoice, getAdminConfig } from '@/app/lib/billingApi'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

// Called daily by n8n; runs only on admin_config.monthly_invoice_day
export async function POST(request: NextRequest) {
  const provided = request.headers.get('x-cron-secret')
    ?? new URL(request.url).searchParams.get('secret')
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createServiceClient()

  const adminConfig = await getAdminConfig(sb)
  if (!adminConfig) return NextResponse.json({ error: 'billing_admin_config non trovata' }, { status: 500 })

  const today        = new Date()
  const todayDay     = today.getUTCDate()
  const invoiceDay   = adminConfig.monthly_invoice_day ?? 27

  if (todayDay !== invoiceDay) {
    return NextResponse.json({ skipped: true, reason: `today=${todayDay} != monthly_invoice_day=${invoiceDay}` })
  }

  // Find all postpaid/hybrid clients with outstanding > 0
  const { data: configs, error: cfgErr } = await sb
    .from('billing_client_config')
    .select('user_id, invoice_trigger')
    .in('billing_mode', ['postpaid', 'hybrid'])

  if (cfgErr) return NextResponse.json({ error: cfgErr.message }, { status: 500 })

  const periodFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const periodTo   = today.toISOString().slice(0, 10)

  const results: { userId: string; invoice_number?: string; error?: string; skipped?: boolean }[] = []

  for (const cfg of configs ?? []) {
    // Only process clients whose trigger includes monthly
    if (cfg.invoice_trigger === 'threshold') {
      results.push({ userId: cfg.user_id, skipped: true })
      continue
    }

    const { invoice, error } = await generatePostpaidInvoice(sb, {
      userId:    cfg.user_id,
      periodFrom,
      periodTo,
    })

    if (error === 'Nessun importo da fatturare') {
      results.push({ userId: cfg.user_id, skipped: true })
    } else if (error) {
      results.push({ userId: cfg.user_id, error })
    } else {
      results.push({ userId: cfg.user_id, invoice_number: invoice!.invoice_number })
    }
  }

  const generated = results.filter(r => r.invoice_number).length
  const skipped   = results.filter(r => r.skipped).length
  const errors    = results.filter(r => r.error).length

  console.log(`[generate-monthly] generated=${generated} skipped=${skipped} errors=${errors}`)
  return NextResponse.json({ generated, skipped, errors, results })
}
