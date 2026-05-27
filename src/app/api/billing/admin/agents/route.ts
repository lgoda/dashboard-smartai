import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, createServiceClient, getAdminConfig } from '@/app/lib/billingApi'

export const dynamic = 'force-dynamic'

const RETELL_AGENT_BASE = 'https://api.retellai.com/v2'

/**
 * GET  — list all configured agent mappings + fetch agent names from Retell
 * POST — create or update an agent→user mapping
 */

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })

  const sb = createServiceClient()

  // Load existing mappings
  const { data: mappings, error } = await sb
    .from('billing_agent_config')
    .select(`
      *,
      profiles!user_id(full_name, email:id)
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch live agent list from Retell (if API key configured)
  const adminConfig = await getAdminConfig(sb)
  let retellAgents: RetellAgent[] = []

  let retellApiError: string | null = null
  if (adminConfig?.retell_billing_api_token) {
    try {
      const resp = await fetch(`${RETELL_AGENT_BASE}/list-agent`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminConfig.retell_billing_api_token}` },
      })
      if (resp.ok) {
        retellAgents = await resp.json()
      } else {
        const text = await resp.text()
        retellApiError = `Retell ${resp.status}: ${text}`
        console.warn('[admin/agents] Retell API error:', resp.status, text)
      }
    } catch (e) {
      retellApiError = e instanceof Error ? e.message : 'Network error'
      console.warn('[admin/agents] Could not fetch Retell agents:', e)
    }
  }

  return NextResponse.json({
    mappings: mappings ?? [],
    retell_agents: retellAgents,
    retell_api_configured: !!adminConfig?.retell_billing_api_token,
    retell_api_error: retellApiError,
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

  // Verify target user exists
  const { data: profile } = await sb.from('profiles').select('id').eq('id', user_id).single()
  if (!profile) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  // Upsert mapping (agent_id is UNIQUE)
  const { data, error } = await sb
    .from('billing_agent_config')
    .upsert({
      agent_id,
      user_id,
      agent_name:            agent_name ?? null,
      price_per_minute_cents: price_per_minute_cents ?? null,
      is_active:             is_active ?? true,
      created_by:            admin.userId,
      updated_at:            new Date().toISOString(),
    }, { onConflict: 'agent_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ agent_config: data }, { status: 201 })
}

type RetellAgent = {
  agent_id: string
  agent_name: string
}
