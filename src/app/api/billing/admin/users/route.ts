import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, createServiceClient } from '@/app/lib/billingApi'

export const dynamic = 'force-dynamic'

/**
 * GET — list all clients with balance and billing stats.
 * PATCH — update billing_client_config for a user (margin, mode, threshold).
 */

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const sb = createServiceClient()

  // Get all profiles with their balance and billing config
  const { data: profiles, error: profErr } = await sb
    .from('profiles')
    .select('id, full_name, company, role, is_active')
    .eq('is_active', true)
    .neq('role', 'admin')
    .order('full_name')

  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 })

  const userIds = (profiles ?? []).map((p: { id: string }) => p.id)
  if (userIds.length === 0) return NextResponse.json({ users: [] })

  // Fetch balances
  const { data: balances } = await sb
    .from('billing_balance')
    .select('*')
    .in('user_id', userIds)

  const balanceMap = new Map((balances ?? []).map((b: { user_id: string }) => [b.user_id, b]))

  // Fetch billing configs
  const { data: configs } = await sb
    .from('billing_client_config')
    .select('*')
    .in('user_id', userIds)

  const configMap = new Map((configs ?? []).map((c: { user_id: string }) => [c.user_id, c]))

  // Fetch last billed call per user
  const { data: lastCalls } = await sb
    .from('retell_call_billing')
    .select('user_id, billed_at, call_id')
    .in('user_id', userIds)
    .eq('sync_status', 'billed')
    .order('billed_at', { ascending: false })

  const lastCallMap = new Map<string, { billed_at: string; call_id: string }>()
  for (const c of lastCalls ?? []) {
    if (!lastCallMap.has(c.user_id)) lastCallMap.set(c.user_id, c)
  }

  // Fetch 30-day usage per user
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: usage } = await sb
    .from('billing_ledger')
    .select('user_id, minutes_delta')
    .in('user_id', userIds)
    .eq('type', 'call_debit')
    .gte('created_at', thirtyDaysAgo)

  const usageMap = new Map<string, number>()
  for (const u of usage ?? []) {
    usageMap.set(u.user_id, (usageMap.get(u.user_id) ?? 0) + Math.abs(u.minutes_delta))
  }

  const users = (profiles ?? []).map((p: { id: string; full_name: string; company: string; role: string; is_active: boolean }) => ({
    ...p,
    balance: balanceMap.get(p.id) ?? { balance_minutes: 0, balance_cents: 0 },
    billing_config: configMap.get(p.id) ?? null,
    last_call: lastCallMap.get(p.id) ?? null,
    minutes_used_30d: usageMap.get(p.id) ?? 0,
  }))

  return NextResponse.json({ users })
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const body = await request.json()
  const { user_id, billing_mode, margin_percent, low_balance_threshold_minutes } = body

  if (!user_id) return NextResponse.json({ error: 'user_id obbligatorio' }, { status: 400 })

  const sb = createServiceClient()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (billing_mode !== undefined)                  updates.billing_mode = billing_mode
  if (margin_percent !== undefined)                updates.margin_percent = margin_percent
  if (low_balance_threshold_minutes !== undefined) updates.low_balance_threshold_minutes = low_balance_threshold_minutes

  const { data, error } = await sb
    .from('billing_client_config')
    .upsert({ user_id, ...updates }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ billing_config: data })
}
