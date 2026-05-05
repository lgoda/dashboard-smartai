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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })

    const supabase = makeSupabase(authHeader)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

    const { id } = await params

    const { data, error } = await supabase
      .from('campaigns')
      .select(`
        *,
        campaign_imports (
          id, status, file_name, list_tag, crm_automation_id, crm_automation_name,
          total_rows, valid_contacts, excluded_no_phone, excluded_duplicates, queued_contacts,
          excluded_tags, existing_contact_policy, created_at, updated_at
        )
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })

    // Count contacts by status for this campaign + queued/excluded counts per import (real-time)
    const { data: stats } = await supabase
      .from('campaign_contacts')
      .select('status, import_id, exclusion_reason')
      .eq('campaign_id', id)
      .eq('user_id', user.id)

    const statusCounts = (stats ?? []).reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    }, {})

    // Real-time queued count per import (overrides the cached queued_contacts column)
    const queuedByImport = (stats ?? [])
      .filter((r) => r.status === 'queued')
      .reduce<Record<string, number>>((acc, r) => {
        if (r.import_id) acc[r.import_id] = (acc[r.import_id] ?? 0) + 1
        return acc
      }, {})

    // Scheduler exclusion breakdown per import (existing_contact / excluded_tag)
    const excludedByImport: Record<string, { crm: number; tag: number }> = {}
    for (const r of stats ?? []) {
      if (r.status === 'excluded' && r.import_id) {
        if (!excludedByImport[r.import_id]) excludedByImport[r.import_id] = { crm: 0, tag: 0 }
        if (r.exclusion_reason === 'existing_contact') excludedByImport[r.import_id].crm++
        else if (r.exclusion_reason === 'excluded_tag') excludedByImport[r.import_id].tag++
      }
    }

    const enrichedImports = ((data as any).campaign_imports ?? []).map((imp: any) => ({
      ...imp,
      queued_contacts: queuedByImport[imp.id] ?? 0,
      excluded_crm: excludedByImport[imp.id]?.crm ?? 0,
      excluded_tag: excludedByImport[imp.id]?.tag ?? 0,
    }))

    // Count sent today
    const today = new Date().toISOString().split('T')[0]
    const { count: sentToday } = await supabase
      .from('campaign_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', id)
      .eq('user_id', user.id)
      .gte('sent_at', `${today}T00:00:00Z`)
      .lt('sent_at', `${today}T23:59:59Z`)

    return NextResponse.json({
      campaign: { ...data, campaign_imports: enrichedImports },
      status_counts: statusCounts,
      sent_today: sentToday ?? 0,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Errore interno' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })

    const supabase = makeSupabase(authHeader)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    // Whitelist updatable fields
    const allowed = [
      'name','type','status','notes','campaign_tag',
      'default_automation_id','default_automation_name',
      'send_days','send_time_from','send_time_to','daily_limit','timezone',
    ]
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (body.status) {
      const actionMap: Record<string, string> = {
        active: 'campaign_resumed',
        paused: 'campaign_paused',
        draft: 'campaign_set_draft',
        completed: 'campaign_completed',
      }
      const labelMap: Record<string, string> = {
        active: 'Campagna avviata / ripresa',
        paused: 'Campagna messa in pausa',
        draft: 'Campagna riportata in bozza',
        completed: 'Campagna segnata come completata',
      }
      await supabase.from('campaign_logs').insert({
        user_id: user.id,
        campaign_id: id,
        action: actionMap[body.status] ?? 'campaign_status_changed',
        detail: labelMap[body.status] ?? `Stato cambiato a ${body.status}`,
      })
    }

    return NextResponse.json({ campaign: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Errore interno' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })

    const supabase = makeSupabase(authHeader)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

    const { id } = await params

    // Soft delete: status = 'deleted', data preserved for logs
    const { error } = await supabase
      .from('campaigns')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabase.from('campaign_logs').insert({
      user_id: user.id,
      campaign_id: id,
      action: 'campaign_deleted',
      detail: 'Campagna eliminata (soft delete)',
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Errore interno' }, { status: 500 })
  }
}
