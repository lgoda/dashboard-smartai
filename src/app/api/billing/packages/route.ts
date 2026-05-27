import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireAuth, createServiceClient } from '@/app/lib/billingApi'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request.headers.get('authorization'))
  if (!auth) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const sb = createServiceClient()
  const { data, error } = await sb
    .from('billing_packages')
    .select('*')
    .order('minutes', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packages: data ?? [] })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const body = await request.json()
  const { name, minutes, price_cents, currency } = body

  if (!name)        return NextResponse.json({ error: 'name obbligatorio' }, { status: 400 })
  if (!minutes)     return NextResponse.json({ error: 'minutes obbligatorio' }, { status: 400 })
  if (!price_cents) return NextResponse.json({ error: 'price_cents obbligatorio' }, { status: 400 })

  const sb = createServiceClient()
  const { data, error } = await sb
    .from('billing_packages')
    .insert({ name, minutes: Number(minutes), price_cents: Number(price_cents), currency: currency ?? 'eur', created_by: admin.userId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ package: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const body = await request.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id obbligatorio' }, { status: 400 })

  const allowed = ['name', 'minutes', 'price_cents', 'is_active']
  const filtered: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key]
  }

  const sb = createServiceClient()
  const { data, error } = await sb
    .from('billing_packages')
    .update(filtered)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ package: data })
}
