import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function makeSupabase(authHeader: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })

    const supabase = makeSupabase(authHeader)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

    const { data, error } = await supabase
      .from('campaigns')
      .select(`
        *,
        campaign_imports (
          id, status, queued_contacts, valid_contacts,
          crm_automation_name, list_tag, created_at
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Real-time queued count per campaign (overrides cached queued_contacts on imports)
    const { data: queuedStats } = await supabase
      .from('campaign_contacts')
      .select('campaign_id')
      .eq('user_id', user.id)
      .eq('status', 'queued')

    const queuedByCampaign = (queuedStats ?? []).reduce<Record<string, number>>((acc, r) => {
      acc[r.campaign_id] = (acc[r.campaign_id] ?? 0) + 1
      return acc
    }, {})

    const enriched = (data ?? []).map((c: any) => ({
      ...c,
      queued_count: queuedByCampaign[c.id] ?? 0,
    }))

    return NextResponse.json({ campaigns: enriched })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Errore interno' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })

    const supabase = makeSupabase(authHeader)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

    const body = await request.json()
    const {
      name, type, notes, campaign_tag,
      default_automation_id, default_automation_name,
      send_days, send_time_from, send_time_to, daily_limit, timezone,
    } = body

    if (!name?.trim() || !type) {
      return NextResponse.json({ error: 'Nome e tipo campagna sono obbligatori' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('campaigns')
      .insert({
        user_id: user.id,
        name: name.trim(),
        type,
        notes,
        campaign_tag,
        default_automation_id,
        default_automation_name,
        send_days: send_days ?? ['monday','tuesday','wednesday','thursday','friday'],
        send_time_from: send_time_from ?? '09:00',
        send_time_to: send_time_to ?? '18:00',
        daily_limit: daily_limit ?? 100,
        timezone: timezone ?? 'Europe/Rome',
        status: 'active',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Log
    await supabase.from('campaign_logs').insert({
      user_id: user.id,
      campaign_id: data.id,
      action: 'campaign_created',
      detail: `Campagna "${name}" creata (tipo: ${type})`,
    })

    return NextResponse.json({ campaign: data }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Errore interno' }, { status: 500 })
  }
}
