import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { signWaConnectToken } from '@/app/lib/waConnectToken'

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
    .select('id, user_id, label')
    .eq('id', instanceId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!instance || instance.user_id !== admin.id) {
    return NextResponse.json({ error: 'Istanza non trovata' }, { status: 404 })
  }

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
