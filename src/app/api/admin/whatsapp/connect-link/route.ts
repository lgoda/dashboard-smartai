import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { signWaConnectToken } from '@/app/lib/waConnectToken'
import { getOpenWaSessionName } from '@/app/lib/openwaApi'
import { purgeOpenWaSessionsStrict } from '@/app/lib/openwaSession'

export const dynamic = 'force-dynamic'

const DEFAULT_DAYS = 7
const MIN_DAYS = 1
const MAX_DAYS = 30

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireAdmin(authHeader: string | null) {
  if (!authHeader) return null
  const supabaseAdmin = getSupabaseAdmin()
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return profile?.role === 'admin' ? user : null
}

// POST /api/admin/whatsapp/connect-link — genera un link firmato a scadenza per far
// scansionare il QR a un cliente esterno (senza accesso alla dashboard). Solo admin.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as { instanceId?: string; days?: number }
  const instanceId = typeof body.instanceId === 'string' ? body.instanceId.trim() : ''
  if (!instanceId) {
    return NextResponse.json({ error: 'instanceId mancante' }, { status: 400 })
  }

  const days = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(Number(body.days) || DEFAULT_DAYS)))

  // L'istanza deve esistere ed essere di proprietà dell'admin che genera il link.
  const supabaseAdmin = getSupabaseAdmin()
  const { data: instance, error } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('id, user_id, label, session_id, session_name')
    .eq('id', instanceId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!instance || instance.user_id !== admin.id) {
    return NextResponse.json({ error: 'Istanza non trovata' }, { status: 404 })
  }

  // Generare un link significa "preparare una nuova scansione": scolleghiamo la
  // sessione OpenWA eventualmente attiva e azzeriamo la riga, così la pagina
  // pubblica mostra SEMPRE un QR fresco (e non il numero collegato in precedenza).
  const sessionName = instance.session_name ?? getOpenWaSessionName(instance.id)
  try {
    await purgeOpenWaSessionsStrict(sessionName, instance.session_id)
  } catch {
    return NextResponse.json(
      { error: 'Servizio WhatsApp non raggiungibile: riprova tra poco.' },
      { status: 502 }
    )
  }
  await supabaseAdmin
    .from('whatsapp_instances')
    .update({
      session_id: null,
      phone: null,
      push_name: null,
      profile_image_url: null,
      status: 'not_connected',
      remote_status: null,
      session_name: getOpenWaSessionName(instance.id),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', instance.id)

  const origin = request.headers.get('origin')
    ?? request.headers.get('referer')?.split('/').slice(0, 3).join('/')
    ?? ''

  const exp = Date.now() + days * 24 * 60 * 60 * 1000
  const token = signWaConnectToken({ instanceId, exp })
  const link = `${origin}/collega-whatsapp?token=${encodeURIComponent(token)}`

  return NextResponse.json({
    success: true,
    link,
    expiresAt: new Date(exp).toISOString(),
    days,
    message: `Link valido ${days} giorni e riutilizzabile. Invialo al cliente: collegherà il suo WhatsApp scansionando il QR.`,
  })
}
