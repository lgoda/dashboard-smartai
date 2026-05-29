import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, createServiceClient } from '@/app/lib/billingApi'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const sb = createServiceClient()
  const { data, error } = await sb.from('billing_admin_config').select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const body = await request.json()
  const allowed = ['default_margin_percent', 'usd_eur_rate', 'notification_email', 'retell_billing_api_token', 'monthly_invoice_day']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const sb = createServiceClient()

  // Fetch the single config row id first (singleton table)
  const { data: existing } = await sb.from('billing_admin_config').select('id').single()
  if (!existing?.id) return NextResponse.json({ error: 'billing_admin_config non trovata' }, { status: 500 })

  const { data, error } = await sb
    .from('billing_admin_config')
    .update(updates)
    .eq('id', existing.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}
