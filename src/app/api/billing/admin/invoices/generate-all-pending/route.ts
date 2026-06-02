import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, createServiceClient, generatePostpaidInvoice } from '@/app/lib/billingApi'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Generates a postpaid invoice for EVERY postpaid/hybrid client with
 * outstanding_cents > 0, regardless of the monthly_invoice_day or the
 * client's invoice_trigger. Useful for catching up on arrears.
 *
 * Auth: admin Bearer token (same pattern as other admin routes).
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const sb = createServiceClient()

  // Find every postpaid/hybrid client with outstanding > 0
  const { data: candidates, error: candErr } = await sb
    .from('billing_balance')
    .select('user_id, outstanding_cents, billing_client_config!inner(billing_mode, user_id)')
    .gt('outstanding_cents', 0)

  if (candErr) return NextResponse.json({ error: candErr.message }, { status: 500 })

  type Row = { user_id: string; outstanding_cents: number; billing_client_config: { billing_mode: string }[] }
  const rows = (candidates ?? []) as Row[]
  const eligible = rows.filter((r) => {
    const cfg = Array.isArray(r.billing_client_config) ? r.billing_client_config[0] : r.billing_client_config
    return cfg?.billing_mode === 'postpaid' || cfg?.billing_mode === 'hybrid'
  })

  const today = new Date()
  const periodFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const periodTo   = today.toISOString().slice(0, 10)

  const results: {
    user_id: string
    outstanding_cents: number
    invoice_number?: string
    stripe_status?: 'paid' | 'open' | 'failed' | null
    error?: string
  }[] = []

  for (const r of eligible) {
    const { invoice, error } = await generatePostpaidInvoice(sb, {
      userId:     r.user_id,
      periodFrom,
      periodTo,
      createdBy:  admin.userId,
    })
    if (error || !invoice) {
      results.push({ user_id: r.user_id, outstanding_cents: r.outstanding_cents, error: error ?? 'Errore sconosciuto' })
      continue
    }
    const stripeStatus = invoice.payment_error_detail
      ? 'failed'
      : invoice.status === 'paid'
        ? 'paid'
        : invoice.stripe_invoice_id ? 'open' : null
    results.push({
      user_id:           r.user_id,
      outstanding_cents: r.outstanding_cents,
      invoice_number:    invoice.invoice_number,
      stripe_status:     stripeStatus,
    })
  }

  const generated = results.filter(r => r.invoice_number).length
  const paid      = results.filter(r => r.stripe_status === 'paid').length
  const open      = results.filter(r => r.stripe_status === 'open').length
  const failed    = results.filter(r => r.stripe_status === 'failed').length
  const errors    = results.filter(r => r.error).length

  return NextResponse.json({
    total_candidates: eligible.length,
    generated,
    paid_immediately: paid,
    open_pending:     open,
    charge_failed:    failed,
    errors,
    results,
  })
}
