import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServiceClient } from '@/app/lib/billingApi'
import { stripe } from '@/app/lib/stripeApi'

export const dynamic = 'force-dynamic'

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

export async function POST(request: NextRequest) {
  if (!stripe) return NextResponse.json({ error: 'Stripe non configurato' }, { status: 500 })
  if (!WEBHOOK_SECRET) return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET non configurato' }, { status: 500 })

  const signature = request.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Firma mancante' }, { status: 400 })

  const rawBody = await request.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET)
  } catch (e) {
    console.error('[stripe-webhook] signature verification failed:', e)
    return NextResponse.json({ error: 'Firma non valida' }, { status: 400 })
  }

  const sb = createServiceClient()

  try {
    switch (event.type) {
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const inv = event.data.object as Stripe.Invoice
        if (!inv.id) break
        await sb
          .from('billing_invoices')
          .update({
            status:               'paid',
            paid_at:              new Date().toISOString(),
            payment_error_detail: null,
            stripe_hosted_url:    inv.hosted_invoice_url ?? null,
            stripe_pdf_url:       inv.invoice_pdf ?? null,
          })
          .eq('stripe_invoice_id', inv.id)
        break
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        if (!inv.id) break
        const errMsg =
          inv.last_finalization_error?.message ??
          (inv as unknown as { last_payment_error?: { message?: string } }).last_payment_error?.message ??
          'Pagamento fallito'
        await sb
          .from('billing_invoices')
          .update({
            status:               'issued',
            payment_error_detail: errMsg,
            stripe_hosted_url:    inv.hosted_invoice_url ?? null,
            stripe_pdf_url:       inv.invoice_pdf ?? null,
          })
          .eq('stripe_invoice_id', inv.id)
        break
      }

      case 'invoice.finalized': {
        // Backup: ensure DB has the URLs even if our sync write lost them
        const inv = event.data.object as Stripe.Invoice
        if (!inv.id) break
        await sb
          .from('billing_invoices')
          .update({
            stripe_hosted_url: inv.hosted_invoice_url ?? null,
            stripe_pdf_url:    inv.invoice_pdf ?? null,
          })
          .eq('stripe_invoice_id', inv.id)
        break
      }

      case 'payment_method.detached': {
        const pm = event.data.object as Stripe.PaymentMethod
        await sb
          .from('billing_client_config')
          .update({ stripe_payment_method_id: null })
          .eq('stripe_payment_method_id', pm.id)
        break
      }

      // Other events ignored for now — add more cases as needed
    }
  } catch (e) {
    console.error('[stripe-webhook] handler error for', event.type, e)
    // 200 anyway so Stripe doesn't keep retrying on a bug we already logged
  }

  return NextResponse.json({ received: true })
}
