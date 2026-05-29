import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createServiceClient } from '@/app/lib/billingApi'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request.headers.get('authorization'))
  if (!auth) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const sb   = createServiceClient()
  const page = Number(request.nextUrl.searchParams.get('page') ?? 0)
  const PAGE_SIZE = 20

  const { data, error, count } = await sb
    .from('billing_invoices')
    .select('*, billing_packages(name)', { count: 'exact' })
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    invoices: data ?? [],
    total:    count ?? 0,
    has_more: ((count ?? 0) > (page + 1) * PAGE_SIZE),
  })
}
