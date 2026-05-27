import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createServiceClient } from '@/app/lib/billingApi'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request.headers.get('authorization'))
  if (!auth) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const url = new URL(request.url)
  const page = Math.max(0, parseInt(url.searchParams.get('page') ?? '0', 10))
  const userId = url.searchParams.get('user_id') // admin can query other users

  const sb = createServiceClient()

  // If querying a different user, must be admin
  let targetUserId = auth.userId
  if (userId && userId !== auth.userId) {
    const { data: profile } = await sb
      .from('profiles')
      .select('role')
      .eq('id', auth.userId)
      .single()
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
    }
    targetUserId = userId
  }

  const from = page * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

  const { data, error, count } = await sb
    .from('billing_ledger')
    .select('*', { count: 'exact' })
    .eq('user_id', targetUserId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    entries: data ?? [],
    total: count ?? 0,
    page,
    page_size: PAGE_SIZE,
    has_more: (count ?? 0) > to + 1,
  })
}
