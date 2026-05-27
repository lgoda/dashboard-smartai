import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createServiceClient, getBalance } from '@/app/lib/billingApi'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request.headers.get('authorization'))
  if (!auth) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const sb = createServiceClient()
  const balance = await getBalance(sb, auth.userId)
  return NextResponse.json({ balance })
}
