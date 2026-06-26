import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  openWaClient,
  statusFromSession,
  resolveOpenWaProfileImageUrl,
  isMissingOpenWaSession,
  getOpenWaSessionName,
} from '@/app/lib/openwaApi'
import { resolveOpenWaSession } from '@/app/lib/openwaSession'
import { verifyWaConnectToken } from '@/app/lib/waConnectToken'

export const dynamic = 'force-dynamic'

// Route pubblico (NESSUN login): autorizzato dal token firmato del link admin.
// Permette SOLO connect/qr/status su UNA istanza (quella nel token). Usa il service
// role limitato a quell'istanza. Niente associazione agente / disconnect / delete.

type InstanceRow = {
  id: string
  label: string | null
  session_id: string | null
  session_name: string | null
  phone: string | null
  push_name: string | null
  profile_image_url: string | null
  status: string
  remote_status: string | null
  last_error: string | null
}

const COLUMNS =
  'id, label, session_id, session_name, phone, push_name, profile_image_url, status, remote_status, last_error'

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Stato "public-safe": solo ciò che serve per scansionare e vedere il numero.
function publicState(row: InstanceRow) {
  return {
    label: row.label,
    status: row.status,
    phone: row.phone,
    pushName: row.push_name,
    profileImageUrl: row.profile_image_url,
    lastError: row.last_error,
  }
}

function instanceIdFromToken(request: NextRequest, bodyToken?: string): string | null {
  const token = bodyToken ?? request.nextUrl.searchParams.get('token') ?? ''
  const payload = verifyWaConnectToken(token)
  return payload?.instanceId ?? null
}

async function getRow(db: SupabaseClient, instanceId: string): Promise<InstanceRow | null> {
  const { data, error } = await db
    .from('whatsapp_instances')
    .select(COLUMNS)
    .eq('id', instanceId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as InstanceRow) ?? null
}

async function updateRow(
  db: SupabaseClient,
  instanceId: string,
  patch: Record<string, unknown>
): Promise<InstanceRow> {
  const { data, error } = await db
    .from('whatsapp_instances')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', instanceId)
    .select(COLUMNS)
    .single()
  if (error) throw new Error(error.message)
  return data as InstanceRow
}

export async function GET(request: NextRequest) {
  try {
    const instanceId = instanceIdFromToken(request)
    if (!instanceId) {
      return NextResponse.json({ error: 'Link non valido o scaduto.' }, { status: 401 })
    }
    const db = admin()
    const row = await getRow(db, instanceId)
    if (!row) {
      return NextResponse.json({ error: 'Istanza non trovata.' }, { status: 404 })
    }

    // QR polling
    if (request.nextUrl.searchParams.get('qr') === '1') {
      if (!row.session_id) {
        return NextResponse.json({ error: 'Avvia prima il collegamento.' }, { status: 409 })
      }
      try {
        return NextResponse.json(await openWaClient.getQr(row.session_id))
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'QR non disponibile.' },
          { status: 502 }
        )
      }
    }

    // Refresh stato da OpenWA se c'è una sessione
    if (!row.session_id) {
      return NextResponse.json(publicState(row))
    }
    try {
      const session = await openWaClient.getSession(row.session_id)
      const profileImageUrl = (await resolveOpenWaProfileImageUrl(session)) ?? row.profile_image_url
      const updated = await updateRow(db, row.id, {
        session_id: session.id,
        phone: session.phone,
        push_name: session.pushName ?? row.push_name,
        profile_image_url: profileImageUrl,
        status: statusFromSession(session),
        remote_status: session.status,
        last_error: null,
        last_verified_at: new Date().toISOString(),
      })
      return NextResponse.json(publicState(updated))
    } catch (error) {
      if (isMissingOpenWaSession(error)) {
        const updated = await updateRow(db, row.id, {
          session_id: null,
          phone: null,
          status: 'not_connected',
          remote_status: null,
          last_error: null,
        })
        return NextResponse.json(publicState(updated))
      }
      return NextResponse.json(publicState(row))
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore.' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { token?: string; action?: string }
    const instanceId = instanceIdFromToken(request, body.token)
    if (!instanceId) {
      return NextResponse.json({ error: 'Link non valido o scaduto.' }, { status: 401 })
    }
    if (body.action !== 'connect') {
      return NextResponse.json({ error: 'Azione non supportata.' }, { status: 400 })
    }

    const db = admin()
    const row = await getRow(db, instanceId)
    if (!row) {
      return NextResponse.json({ error: 'Istanza non trovata.' }, { status: 404 })
    }

    const sessionName = row.session_name ?? getOpenWaSessionName(row.id)
    try {
      const session = await resolveOpenWaSession(sessionName, row.session_id)
      const profileImageUrl = await resolveOpenWaProfileImageUrl(session)
      const updated = await updateRow(db, row.id, {
        session_id: session.id,
        session_name: sessionName,
        phone: session.phone,
        push_name: session.pushName ?? null,
        profile_image_url: profileImageUrl,
        status: statusFromSession(session),
        remote_status: session.status,
        last_error: null,
        last_verified_at: new Date().toISOString(),
      })
      return NextResponse.json(publicState(updated))
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Impossibile avviare il collegamento.' },
        { status: 502 }
      )
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Errore.' },
      { status: 500 }
    )
  }
}
