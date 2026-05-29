import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, createServiceClient, purchasePackage } from '@/app/lib/billingApi'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request.headers.get('authorization'))
  if (!auth) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { package_id } = await request.json()
  if (!package_id) return NextResponse.json({ error: 'package_id obbligatorio' }, { status: 400 })

  const sb = createServiceClient()
  const { invoice, error } = await purchasePackage(sb, {
    userId:    auth.userId,
    packageId: package_id,
    type:      'package_purchase',
    createdBy: auth.userId,
  })

  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json({ invoice }, { status: 201 })
}
