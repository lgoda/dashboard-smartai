import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, createServiceClient, creditMinutes } from '@/app/lib/billingApi'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const body = await request.json()
  const { user_id, minutes_delta, amount_cents, type, description } = body

  if (!user_id)        return NextResponse.json({ error: 'user_id obbligatorio' }, { status: 400 })
  if (!minutes_delta)  return NextResponse.json({ error: 'minutes_delta obbligatorio' }, { status: 400 })
  if (!description)    return NextResponse.json({ error: 'description obbligatoria' }, { status: 400 })

  const allowedTypes = ['manual_credit', 'manual_debit', 'refund'] as const
  type AllowedType = typeof allowedTypes[number]
  if (!allowedTypes.includes(type as AllowedType)) {
    return NextResponse.json({ error: `type deve essere uno di: ${allowedTypes.join(', ')}` }, { status: 400 })
  }

  // Verify target user exists
  const sb = createServiceClient()
  const { data: profile } = await sb.from('profiles').select('id').eq('id', user_id).single()
  if (!profile) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const idempotencyKey = `manual_${Date.now()}_${user_id}_${admin.userId}`

  const { data: ledgerEntry, error } = await creditMinutes(sb, {
    userId:          user_id,
    minutesDelta:    Number(minutes_delta),
    amountCents:     Number(amount_cents ?? 0),
    type:            type as AllowedType,
    idempotencyKey,
    description,
    createdBy:       admin.userId,
  })

  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ ledger_entry: ledgerEntry }, { status: 201 })
}
