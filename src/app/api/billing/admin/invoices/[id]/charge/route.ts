import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, createServiceClient, getClientConfig } from '@/app/lib/billingApi'
import { getStripeMode, createAndChargeStripeInvoice } from '@/app/lib/stripeApi'

export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/admin/invoices/[id]/charge
 *
 * Bill an existing DB invoice via Stripe — creates the Stripe Invoice,
 * finalizes it and attempts charge on the client's default payment method.
 * Useful for invoices created before Stripe was integrated, or for retrying
 * a previously failed charge.
 *
 * Auth: admin Bearer token.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const { id: invoiceId } = await params
  const sb = createServiceClient()

  const { data: invoice, error: invErr } = await sb
    .from('billing_invoices')
    .select('*')
    .eq('id', invoiceId)
    .single()
  if (invErr || !invoice) return NextResponse.json({ error: 'Fattura non trovata' }, { status: 404 })

  if (invoice.status === 'paid')      return NextResponse.json({ error: 'Fattura già pagata' }, { status: 400 })
  if (invoice.status === 'cancelled') return NextResponse.json({ error: 'Fattura annullata' }, { status: 400 })
  if (invoice.stripe_invoice_id)      return NextResponse.json({ error: 'Fattura già emessa su Stripe — controlla lo stato sul webhook' }, { status: 400 })

  const mode = getStripeMode()
  if (!mode) return NextResponse.json({ error: 'Stripe non configurato' }, { status: 500 })

  const clientConfig = await getClientConfig(sb, invoice.user_id)
  if (!clientConfig?.stripe_customer_id || !clientConfig?.stripe_payment_method_id) {
    return NextResponse.json({ error: 'Cliente senza metodo di pagamento Stripe configurato' }, { status: 400 })
  }
  if (clientConfig.stripe_mode !== mode) {
    return NextResponse.json({ error: `Metodo di pagamento del cliente è in modalità ${clientConfig.stripe_mode}, server in ${mode}. Il cliente deve aggiungere di nuovo la carta.` }, { status: 400 })
  }

  const description = invoice.type === 'postpaid_period' && invoice.period_from && invoice.period_to
    ? `Periodo ${invoice.period_from} → ${invoice.period_to}`
    : `Fattura ${invoice.invoice_number}`

  const result = await createAndChargeStripeInvoice({
    customerId:    clientConfig.stripe_customer_id,
    amountCents:   invoice.amount_cents,
    description,
    invoiceNumber: invoice.invoice_number,
    metadata: { user_id: invoice.user_id, db_invoice_id: invoice.id },
  })

  const updates: Record<string, unknown> = {
    stripe_invoice_id:    result.stripeInvoiceId,
    stripe_hosted_url:    result.hostedUrl,
    stripe_pdf_url:       result.pdfUrl,
    payment_error_detail: result.errorDetail,
  }
  if (result.status === 'paid') {
    updates.status  = 'paid'
    updates.paid_at = new Date().toISOString()
  }

  const { data: updated, error: updErr } = await sb
    .from('billing_invoices')
    .update(updates)
    .eq('id', invoice.id)
    .select()
    .single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({
    invoice:       updated,
    stripe_status: result.status,
    error_detail:  result.errorDetail,
  })
}
