import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  openWaClient,
  statusFromSession,
  resolveOpenWaProfileImageUrl,
  isMissingOpenWaSession,
  getOpenWaSessionName,
} from '@/app/lib/openwaApi'
import {
  resolveOpenWaSession,
  deleteOpenWaSessionsByName,
  purgeOpenWaSessionsStrict,
  registerAgentWebhook,
} from '@/app/lib/openwaSession'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

type WhatsAppInstanceRow = {
  id: string
  user_id: string
  label: string | null
  session_id: string | null
  session_name: string | null
  phone: string | null
  push_name: string | null
  profile_image_url: string | null
  status: string
  remote_status: string | null
  n8n_webhook_url: string | null
  n8n_agent_name: string | null
  n8n_webhook_id: string | null
  ai_paused: boolean
  last_error: string | null
  last_verified_at: string | null
}

const ROW_COLUMNS =
  'id, user_id, label, session_id, session_name, phone, push_name, profile_image_url, status, remote_status, n8n_webhook_url, n8n_agent_name, n8n_webhook_id, ai_paused, last_error, last_verified_at'

async function authenticate(request: NextRequest): Promise<
  | { supabase: SupabaseClient; userId: string }
  | { error: NextResponse }
> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return { error: NextResponse.json({ error: 'Authorization header required' }, { status: 401 }) }
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { supabase, userId: user.id }
}

async function listInstances(
  supabase: SupabaseClient,
  userId: string
): Promise<WhatsAppInstanceRow[]> {
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .select(ROW_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as WhatsAppInstanceRow[]
}

// Fetch a single instance owned by the user (RLS also enforces ownership).
async function getInstance(
  supabase: SupabaseClient,
  userId: string,
  instanceId: string
): Promise<WhatsAppInstanceRow | null> {
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .select(ROW_COLUMNS)
    .eq('user_id', userId)
    .eq('id', instanceId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as WhatsAppInstanceRow) ?? null
}

async function updateInstance(
  supabase: SupabaseClient,
  instanceId: string,
  patch: Record<string, unknown>
): Promise<WhatsAppInstanceRow> {
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', instanceId)
    .select(ROW_COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return data as WhatsAppInstanceRow
}

function serialize(row: WhatsAppInstanceRow) {
  return {
    id: row.id,
    label: row.label,
    status: row.status,
    remoteStatus: row.remote_status,
    sessionId: row.session_id,
    phone: row.phone,
    pushName: row.push_name,
    profileImageUrl: row.profile_image_url,
    n8nWebhookUrl: row.n8n_webhook_url,
    n8nAgentName: row.n8n_agent_name,
    aiPaused: row.ai_paused,
    lastError: row.last_error,
    lastVerifiedAt: row.last_verified_at,
  }
}

function sessionNameFor(row: WhatsAppInstanceRow): string {
  return row.session_name ?? getOpenWaSessionName(row.id)
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticate(request)
    if ('error' in auth) return auth.error
    const { supabase, userId } = auth

    const instanceId = request.nextUrl.searchParams.get('id')

    // No id → list all instances (from DB, no OpenWA calls).
    if (!instanceId) {
      const rows = await listInstances(supabase, userId)
      return NextResponse.json({ instances: rows.map(serialize) })
    }

    const row = await getInstance(supabase, userId, instanceId)
    if (!row) {
      return NextResponse.json({ error: 'Istanza non trovata.' }, { status: 404 })
    }

    // QR polling endpoint
    if (request.nextUrl.searchParams.get('qr') === '1') {
      if (!row.session_id) {
        return NextResponse.json({ error: 'WhatsApp non è collegato.' }, { status: 404 })
      }
      try {
        return NextResponse.json(await openWaClient.getQr(row.session_id))
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'QR Code non disponibile.' },
          { status: 502 }
        )
      }
    }

    // Refresh single instance state from OpenWA if it has a session.
    if (!row.session_id) {
      return NextResponse.json(serialize(row))
    }

    try {
      const session = await openWaClient.getSession(row.session_id)
      const profileImageUrl = (await resolveOpenWaProfileImageUrl(session)) ?? row.profile_image_url
      const updated = await updateInstance(supabase, row.id, {
        session_id: session.id,
        phone: session.phone,
        push_name: session.pushName ?? row.push_name,
        profile_image_url: profileImageUrl,
        status: statusFromSession(session),
        remote_status: session.status,
        last_error: null,
        last_verified_at: new Date().toISOString(),
      })
      return NextResponse.json(serialize(updated))
    } catch (error) {
      if (isMissingOpenWaSession(error)) {
        const updated = await updateInstance(supabase, row.id, {
          session_id: null,
          phone: null,
          status: 'not_connected',
          remote_status: null,
          last_error: 'La sessione WhatsApp è stata interrotta. Scansiona di nuovo il QR Code.',
        })
        return NextResponse.json(serialize(updated))
      }
      const updated = await updateInstance(supabase, row.id, {
        status: 'error',
        last_error: error instanceof Error ? error.message : String(error),
      })
      return NextResponse.json(serialize(updated))
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore configurazione WhatsApp.' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticate(request)
    if ('error' in auth) return auth.error
    const { supabase, userId } = auth

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action.trim() : ''

    // create: new instance row (no OpenWA session yet).
    if (action === 'create') {
      const label = typeof body.label === 'string' ? body.label.trim() : ''
      const { data: inserted, error: insertError } = await supabase
        .from('whatsapp_instances')
        .insert({ user_id: userId, label: label || null, status: 'not_connected' })
        .select(ROW_COLUMNS)
        .single()
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
      const newRow = inserted as WhatsAppInstanceRow
      // Derive a per-instance OpenWA session name from the generated id.
      const updated = await updateInstance(supabase, newRow.id, {
        session_name: getOpenWaSessionName(newRow.id),
      })
      return NextResponse.json(serialize(updated))
    }

    const instanceId = typeof body.instanceId === 'string' ? body.instanceId.trim() : ''
    if (!instanceId) {
      return NextResponse.json({ error: 'instanceId mancante.' }, { status: 400 })
    }
    const row = await getInstance(supabase, userId, instanceId)
    if (!row) {
      return NextResponse.json({ error: 'Istanza non trovata.' }, { status: 404 })
    }
    const sessionName = sessionNameFor(row)

    if (action === 'connect') {
      try {
        const session = await resolveOpenWaSession(sessionName, row.session_id)
        const profileImageUrl = await resolveOpenWaProfileImageUrl(session)

        // If an agent was already configured, re-register its webhook on the new session.
        let webhookId = row.n8n_webhook_id
        if (row.n8n_webhook_url) {
          webhookId = await registerAgentWebhook(
            session.id,
            row.n8n_webhook_url,
            row.session_id === session.id ? row.n8n_webhook_id : null
          ).catch(() => row.n8n_webhook_id)
        }

        const updated = await updateInstance(supabase, row.id, {
          session_id: session.id,
          session_name: sessionName,
          phone: session.phone,
          push_name: session.pushName ?? null,
          profile_image_url: profileImageUrl,
          status: statusFromSession(session),
          remote_status: session.status,
          n8n_webhook_id: webhookId,
          ai_paused: row.n8n_webhook_url ? false : row.ai_paused,
          last_error: null,
          last_verified_at: new Date().toISOString(),
        })
        return NextResponse.json(serialize(updated))
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Impossibile collegare WhatsApp.' },
          { status: 502 }
        )
      }
    }

    if (action === 'disconnect') {
      try {
        await purgeOpenWaSessionsStrict(sessionName, row.session_id)
      } catch (error) {
        return NextResponse.json(
          {
            error:
              'Impossibile scollegare la sessione su OpenWA (servizio non raggiungibile). Riprova: la connessione NON è stata rimossa.',
          },
          { status: 502 }
        )
      }
      const updated = await updateInstance(supabase, row.id, {
        session_id: null,
        phone: null,
        push_name: null,
        profile_image_url: null,
        status: 'not_connected',
        remote_status: null,
        // n8n config is preserved; webhook id is gone with the session.
        n8n_webhook_id: null,
        last_error: null,
      })
      return NextResponse.json(serialize(updated))
    }

    if (action === 'set_agent') {
      const url = typeof body.n8nWebhookUrl === 'string' ? body.n8nWebhookUrl.trim() : ''
      const name = typeof body.n8nAgentName === 'string' ? body.n8nAgentName.trim() : ''
      if (!/^https?:\/\/.+/i.test(url)) {
        return NextResponse.json({ error: 'Inserisci un URL webhook valido (http/https).' }, { status: 400 })
      }
      if (!row.session_id || row.status !== 'connected') {
        return NextResponse.json(
          { error: 'Collega prima WhatsApp, poi associa l’agente n8n.' },
          { status: 400 }
        )
      }
      try {
        const webhookId = await registerAgentWebhook(row.session_id, url, row.n8n_webhook_id)
        const updated = await updateInstance(supabase, row.id, {
          n8n_webhook_url: url,
          n8n_agent_name: name || null,
          n8n_webhook_id: webhookId,
          ai_paused: false,
        })
        return NextResponse.json(serialize(updated))
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Impossibile associare l’agente n8n.' },
          { status: 502 }
        )
      }
    }

    if (action === 'clear_agent') {
      if (row.session_id && row.n8n_webhook_id) {
        await openWaClient.deleteWebhook(row.session_id, row.n8n_webhook_id).catch(() => undefined)
      }
      const updated = await updateInstance(supabase, row.id, {
        n8n_webhook_url: null,
        n8n_agent_name: null,
        n8n_webhook_id: null,
      })
      return NextResponse.json(serialize(updated))
    }

    if (action === 'pause' || action === 'resume') {
      const paused = action === 'pause'
      if (!row.n8n_webhook_url || !row.n8n_webhook_id || !row.session_id) {
        return NextResponse.json(
          { error: 'Associa prima un agente n8n a questo numero.' },
          { status: 400 }
        )
      }
      try {
        // Pausa = disabilita il webhook OpenWA (i messaggi non arrivano all'IA);
        // Riprendi = riabilita. L'operatore risponde a mano dall'app WhatsApp.
        await openWaClient.updateWebhook(row.session_id, row.n8n_webhook_id, { active: !paused })
        const updated = await updateInstance(supabase, row.id, { ai_paused: paused })
        return NextResponse.json(serialize(updated))
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Impossibile aggiornare lo stato IA.' },
          { status: 502 }
        )
      }
    }

    if (action === 'delete') {
      // Only require OpenWA cleanup if this instance was actually connected.
      // For a never-connected instance we just remove the empty DB row.
      if (row.session_id) {
        try {
          if (row.n8n_webhook_id) {
            await openWaClient.deleteWebhook(row.session_id, row.n8n_webhook_id).catch(() => undefined)
          }
          await purgeOpenWaSessionsStrict(sessionName, row.session_id)
        } catch (error) {
          return NextResponse.json(
            {
              error:
                'Impossibile rimuovere la sessione su OpenWA (servizio non raggiungibile). Riprova: la configurazione NON è stata rimossa.',
            },
            { status: 502 }
          )
        }
      }
      const { error: deleteError } = await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('id', row.id)
      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, id: row.id })
    }

    return NextResponse.json({ error: 'Azione non supportata.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
