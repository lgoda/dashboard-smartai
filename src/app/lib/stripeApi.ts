import Stripe from 'stripe'
import { SupabaseClient } from '@supabase/supabase-js'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

if (!STRIPE_SECRET_KEY) {
  console.warn('[stripeApi] STRIPE_SECRET_KEY mancante — le funzioni Stripe non funzioneranno')
}

export const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-09-30.clover' })
  : null

/** 'test' if using sk_test_ key, 'live' if sk_live_, null if unconfigured. */
export function getStripeMode(): 'test' | 'live' | null {
  if (!STRIPE_SECRET_KEY) return null
  if (STRIPE_SECRET_KEY.startsWith('sk_test_')) return 'test'
  if (STRIPE_SECRET_KEY.startsWith('sk_live_')) return 'live'
  return null
}

/**
 * Get or create a Stripe Customer linked to a user. Reuses existing
 * customer_id if it belongs to the current Stripe mode; creates a new one
 * otherwise. Returns the customer id and updates billing_client_config.
 */
export async function getOrCreateStripeCustomer(
  sb: SupabaseClient,
  userId: string,
  email: string,
  name?: string
): Promise<{ customerId: string | null; error: string | null }> {
  if (!stripe) return { customerId: null, error: 'Stripe non configurato' }
  const mode = getStripeMode()
  if (!mode) return { customerId: null, error: 'Stripe key invalida' }

  const { data: cfg } = await sb
    .from('billing_client_config')
    .select('id, stripe_customer_id, stripe_mode')
    .eq('user_id', userId)
    .maybeSingle()

  // Reuse existing customer if it belongs to the current Stripe mode
  if (cfg?.stripe_customer_id && cfg.stripe_mode === mode) {
    try {
      const c = await stripe.customers.retrieve(cfg.stripe_customer_id)
      if (!c.deleted) return { customerId: cfg.stripe_customer_id, error: null }
    } catch {
      // fall through and create a fresh one
    }
  }

  // Create a new Stripe customer
  try {
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: { user_id: userId },
    })

    // Upsert into billing_client_config (create row if missing)
    if (cfg?.id) {
      await sb
        .from('billing_client_config')
        .update({
          stripe_customer_id: customer.id,
          stripe_mode: mode,
          stripe_payment_method_id: null,
        })
        .eq('id', cfg.id)
    } else {
      await sb
        .from('billing_client_config')
        .insert({
          user_id: userId,
          billing_mode: 'prepaid',
          stripe_customer_id: customer.id,
          stripe_mode: mode,
        })
    }

    return { customerId: customer.id, error: null }
  } catch (e) {
    return { customerId: null, error: e instanceof Error ? e.message : 'Errore Stripe' }
  }
}

/**
 * Create a SetupIntent for the customer to add a payment method via Elements.
 */
export async function createSetupIntent(
  customerId: string
): Promise<{ clientSecret: string | null; error: string | null }> {
  if (!stripe) return { clientSecret: null, error: 'Stripe non configurato' }
  try {
    const si = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    })
    return { clientSecret: si.client_secret, error: null }
  } catch (e) {
    return { clientSecret: null, error: e instanceof Error ? e.message : 'Errore SetupIntent' }
  }
}

/**
 * Attach a payment method to the customer and set it as the default for invoices.
 */
export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<{ error: string | null }> {
  if (!stripe) return { error: 'Stripe non configurato' }
  try {
    // Verify the PM is attached to this customer (SetupIntent already attaches it)
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId)
    if (pm.customer && pm.customer !== customerId) {
      return { error: 'Payment method appartiene a un altro customer' }
    }
    if (!pm.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId })
    }
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    })
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Errore setDefaultPaymentMethod' }
  }
}

/**
 * Detach a payment method from the customer (does not delete it from Stripe but
 * removes it from billing). Caller should also clear stripe_payment_method_id.
 */
export async function detachPaymentMethod(
  paymentMethodId: string
): Promise<{ error: string | null }> {
  if (!stripe) return { error: 'Stripe non configurato' }
  try {
    await stripe.paymentMethods.detach(paymentMethodId)
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Errore detachPaymentMethod' }
  }
}

/**
 * Retrieve payment method details for display (brand, last4, exp_month, exp_year).
 */
export type PaymentMethodInfo = {
  id: string
  brand: string
  last4: string
  exp_month: number
  exp_year: number
}

/**
 * Create a Stripe Invoice for a postpaid period, finalize it and attempt
 * auto-charge against the customer's default payment method.
 *
 * Returns the Stripe invoice id + hosted/PDF URLs + the live payment status
 * (paid | open | failed). The DB record should be updated with this data.
 */
export async function createAndChargeStripeInvoice(params: {
  customerId: string
  amountCents: number
  description: string
  invoiceNumber: string  // our internal invoice number (for memo/metadata)
  metadata?: Record<string, string>
}): Promise<{
  stripeInvoiceId: string | null
  hostedUrl: string | null
  pdfUrl: string | null
  status: 'paid' | 'open' | 'failed'
  errorDetail: string | null
}> {
  if (!stripe) {
    return { stripeInvoiceId: null, hostedUrl: null, pdfUrl: null, status: 'failed', errorDetail: 'Stripe non configurato' }
  }
  try {
    // 1. Create a draft Invoice (auto_advance=true means Stripe will finalize
    //    and attempt to pay it on its own after we add items).
    const invoice = await stripe.invoices.create({
      customer: params.customerId,
      collection_method: 'charge_automatically',
      auto_advance: true,
      description: params.description,
      metadata: { invoice_number: params.invoiceNumber, ...(params.metadata ?? {}) },
    })

    if (!invoice.id) {
      return { stripeInvoiceId: null, hostedUrl: null, pdfUrl: null, status: 'failed', errorDetail: 'Stripe non ha restituito invoice.id' }
    }

    // 2. Attach a line item to the draft invoice.
    await stripe.invoiceItems.create({
      customer: params.customerId,
      invoice: invoice.id,
      amount: params.amountCents,
      currency: 'eur',
      description: params.description,
    })

    // 3. Finalize the invoice — produces hosted_invoice_url + invoice_pdf.
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id)

    // 4. Trigger immediate payment attempt. With charge_automatically +
    //    auto_advance, Stripe schedules the charge async, but pay() forces
    //    the synchronous attempt so we know the result right now.
    let paid = finalized
    try {
      paid = await stripe.invoices.pay(invoice.id)
    } catch (payErr: unknown) {
      // pay() throws if charge declines. Surface the reason but keep the
      // invoice — Stripe will Smart Retry per dashboard config.
      const msg = payErr instanceof Error ? payErr.message : 'Charge declined'
      return {
        stripeInvoiceId: invoice.id,
        hostedUrl: finalized.hosted_invoice_url ?? null,
        pdfUrl: finalized.invoice_pdf ?? null,
        status: 'failed',
        errorDetail: msg,
      }
    }

    return {
      stripeInvoiceId: invoice.id,
      hostedUrl: paid.hosted_invoice_url ?? null,
      pdfUrl: paid.invoice_pdf ?? null,
      status: paid.status === 'paid' ? 'paid' : 'open',
      errorDetail: null,
    }
  } catch (e) {
    return {
      stripeInvoiceId: null,
      hostedUrl: null,
      pdfUrl: null,
      status: 'failed',
      errorDetail: e instanceof Error ? e.message : 'Errore creazione Stripe Invoice',
    }
  }
}

export async function getPaymentMethodInfo(
  paymentMethodId: string
): Promise<{ info: PaymentMethodInfo | null; error: string | null }> {
  if (!stripe) return { info: null, error: 'Stripe non configurato' }
  try {
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId)
    if (!pm.card) return { info: null, error: 'Payment method non è una carta' }
    return {
      info: {
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        exp_month: pm.card.exp_month,
        exp_year: pm.card.exp_year,
      },
      error: null,
    }
  } catch (e) {
    return { info: null, error: e instanceof Error ? e.message : 'Errore getPaymentMethodInfo' }
  }
}
