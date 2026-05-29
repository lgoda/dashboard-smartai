import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, createServiceClient } from '@/app/lib/billingApi'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const sb     = createServiceClient()
  const page   = Number(request.nextUrl.searchParams.get('page') ?? 0)
  const status = request.nextUrl.searchParams.get('status') // null = all
  const PAGE_SIZE = 50

  let query = sb
    .from('billing_invoices')
    .select(`
      *,
      billing_packages(name),
      profiles!user_id(full_name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (status) query = query.eq('status', status)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    invoices: data ?? [],
    total:    count ?? 0,
    has_more: ((count ?? 0) > (page + 1) * PAGE_SIZE),
  })
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const { id, status } = await request.json()
  if (!id || !status) return NextResponse.json({ error: 'id e status obbligatori' }, { status: 400 })
  if (!['issued', 'paid', 'cancelled'].includes(status))
    return NextResponse.json({ error: 'Status non valido' }, { status: 400 })

  const sb = createServiceClient()

  const { data, error } = await sb
    .from('billing_invoices')
    .update({
      status,
      paid_at: status === 'paid' ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ invoice: data })
}
