import { NextRequest, NextResponse } from 'next/server'
import { createAuthedClient, createServiceClient } from '@/app/lib/billingApi'
import { setDefaultPaymentMethod, detachPaymentMethod, getPaymentMethodInfo, getStripeMode } from '@/app/lib/stripeApi'

export const dynamic = 'force-dynamic'

/** GET /api/billing/stripe/payment-method
 *  Returns the current saved payment method (brand, last4, exp) or null.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthUser(request)
  if ('error' in auth) return auth.error
  const sb = createServiceClient()
  const mode = getStripeMode()

  const { data: cfg } = await sb
    .from('billing_client_config')
    .select('stripe_payment_method_id, stripe_mode, card_grace_period_until, billing_mode')
    .eq('user_id', auth.userId)
    .maybeSingle()

  // Stale: payment method saved in test but server in live (or vice versa)
  const stale = cfg?.stripe_mode && mode && cfg.stripe_mode !== mode
  const effectivePmId = stale ? null : (cfg?.stripe_payment_method_id ?? null)

  if (!effectivePmId) {
    return NextResponse.json({
      payment_method: null,
      stale,
      grace_period_until: cfg?.card_grace_period_until ?? null,
      billing_mode: cfg?.billing_mode ?? 'prepaid',
      mode,
    })
  }

  const { info, error } = await getPaymentMethodInfo(effectivePmId)
  if (error) return NextResponse.json({ error }, { status: 500 })

  return NextResponse.json({
    payment_method: info,
    stale: false,
    grace_period_until: cfg?.card_grace_period_until ?? null,
    billing_mode: cfg?.billing_mode ?? 'prepaid',
    mode,
  })
}

/** POST /api/billing/stripe/payment-method
 *  Save a payment method id (just confirmed via Elements) as the default for the customer.
 *  Body: { payment_method_id: string }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthUser(request)
  if ('error' in auth) return auth.error
  const body = await request.json().catch(() => ({}))
  const pmId: string | undefined = body.payment_method_id
  if (!pmId) return NextResponse.json({ error: 'payment_method_id obbligatorio' }, { status: 400 })

  const sb = createServiceClient()
  const { data: cfg } = await sb
    .from('billing_client_config')
    .select('id, stripe_customer_id')
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (!cfg?.stripe_customer_id) {
    return NextResponse.json({ error: 'Customer Stripe non trovato — riavvia il flusso di setup' }, { status: 400 })
  }

  const { error: setErr } = await setDefaultPaymentMethod(cfg.stripe_customer_id, pmId)
  if (setErr) return NextResponse.json({ error: setErr }, { status: 500 })

  // Save pm_id on DB; clear grace period
  await sb
    .from('billing_client_config')
    .update({
      stripe_payment_method_id: pmId,
      card_grace_period_until: null,
    })
    .eq('id', cfg.id)

  const { info } = await getPaymentMethodInfo(pmId)
  return NextResponse.json({ payment_method: info })
}

/** DELETE /api/billing/stripe/payment-method
 *  Detach the current payment method.
 */
export async function DELETE(request: NextRequest) {
  const auth = await getAuthUser(request)
  if ('error' in auth) return auth.error

  const sb = createServiceClient()
  const { data: cfg } = await sb
    .from('billing_client_config')
    .select('id, stripe_payment_method_id')
    .eq('user_id', auth.userId)
    .maybeSingle()

  if (!cfg?.stripe_payment_method_id) {
    return NextResponse.json({ ok: true, note: 'Nessun payment method da rimuovere' })
  }

  const { error: detErr } = await detachPaymentMethod(cfg.stripe_payment_method_id)
  // Continue even if detach fails (could be already detached); always clear DB
  await sb
    .from('billing_client_config')
    .update({ stripe_payment_method_id: null })
    .eq('id', cfg.id)

  return NextResponse.json({ ok: true, detach_error: detErr })
}

async function getAuthUser(request: NextRequest): Promise<{ userId: string } | { error: NextResponse }> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return { error: NextResponse.json({ error: 'Non autorizzato' }, { status: 401 }) }
  const client = createAuthedClient(authHeader)
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non autorizzato' }, { status: 401 }) }
  return { userId: user.id }
}
