import { NextRequest, NextResponse } from 'next/server'
import { createAuthedClient, createServiceClient } from '@/app/lib/billingApi'
import { getOrCreateStripeCustomer, createSetupIntent, getStripeMode } from '@/app/lib/stripeApi'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const userClient = createAuthedClient(authHeader)
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const mode = getStripeMode()
  if (!mode) return NextResponse.json({ error: 'Stripe non configurato' }, { status: 500 })

  const sb = createServiceClient()

  const { data: profile } = await sb
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const { customerId, error: custErr } = await getOrCreateStripeCustomer(
    sb,
    user.id,
    user.email ?? '',
    profile?.full_name ?? undefined
  )
  if (custErr || !customerId) return NextResponse.json({ error: custErr ?? 'Errore creazione customer' }, { status: 500 })

  const { clientSecret, error: siErr } = await createSetupIntent(customerId)
  if (siErr || !clientSecret) return NextResponse.json({ error: siErr ?? 'Errore SetupIntent' }, { status: 500 })

  return NextResponse.json({
    client_secret: clientSecret,
    customer_id: customerId,
    mode,
    publishable_key: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  })
}
