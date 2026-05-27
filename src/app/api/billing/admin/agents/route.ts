import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, createServiceClient } from '@/app/lib/billingApi'

export const dynamic = 'force-dynamic'

/**
 * GET  — list all configured agent mappings + discover agents from call history
 * POST — create or update an agent→user mapping
 *
 * Note: Retell does not expose a reliable public /list-agent endpoint.
 * We discover agents from retell_call_billing rows (synced call history)
 * which is more reliable and doesn't require an additional API call.
 */

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const sb = createServiceClient()

  // Load existing mappings
  const { data: mappings, error } = await sb
    .from('billing_agent_config')
    .select(`*, profiles!user_id(full_name, email:id)`)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Discover distinct agent IDs seen in actual call history
  const { data: callAgents } = await sb
    .from('retell_call_billing')
    .select('agent_id')
    .not('agent_id', 'is', null)

  // Build unique agent list, enriching with known names from mappings
  const mappingMap = new Map((mappings ?? []).map((m: any) => [m.agent_id, m.agent_name as string | null]))
  const seenIds = new Set<string>()
  const retellAgents: { agent_id: string; agent_name: string | null }[] = []

  for (const row of callAgents ?? []) {
    if (!row.agent_id || seenIds.has(row.agent_id)) continue
    seenIds.add(row.agent_id)
    retellAgents.push({ agent_id: row.agent_id, agent_name: mappingMap.get(row.agent_id) ?? null })
  }

  // Also include agents that have a mapping but no calls yet
  for (const m of mappings ?? []) {
    if (!seenIds.has(m.agent_id)) {
      seenIds.add(m.agent_id)
      retellAgents.push({ agent_id: m.agent_id, agent_name: m.agent_name ?? null })
    }
  }

  return NextResponse.json({
    mappings: mappings ?? [],
    retell_agents: retellAgents,
    retell_api_configured: true,
  })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const body = await request.json()
  const { agent_id, user_id, agent_name, price_per_minute_cents, is_active } = body

  if (!agent_id) return NextResponse.json({ error: 'agent_id obbligatorio' }, { status: 400 })
  if (!user_id)  return NextResponse.json({ error: 'user_id obbligatorio' }, { status: 400 })

  const sb = createServiceClient()

  const { data: profile } = await sb.from('profiles').select('id').eq('id', user_id).single()
  if (!profile) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const { data, error } = await sb
    .from('billing_agent_config')
    .upsert({
      agent_id,
      user_id,
      agent_name:             agent_name ?? null,
      price_per_minute_cents: price_per_minute_cents ?? null,
      is_active:              is_active ?? true,
      created_by:             admin.userId,
      updated_at:             new Date().toISOString(),
    }, { onConflict: 'agent_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agent_config: data }, { status: 201 })
}
