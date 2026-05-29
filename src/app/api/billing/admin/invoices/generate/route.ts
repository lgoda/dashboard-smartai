import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, createServiceClient, generatePostpaidInvoice } from '@/app/lib/billingApi'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const { user_id } = await request.json()
  if (!user_id) return NextResponse.json({ error: 'user_id obbligatorio' }, { status: 400 })

  const sb = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  const { invoice, error } = await generatePostpaidInvoice(sb, {
    userId:     user_id,
    periodFrom: today,
    periodTo:   today,
    createdBy:  admin.userId,
  })

  if (error) return NextResponse.json({ error }, { status: 400 })
  return NextResponse.json({ invoice })
}
