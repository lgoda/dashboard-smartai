import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { signSetupToken } from '@/app/lib/setupToken'

export const dynamic = 'force-dynamic'

// Validità del link (giorni). Entro questo periodo il link è riutilizzabile.
const LINK_VALIDITY_DAYS = 7

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

// Cerca un utente esistente per email scorrendo le pagine di listUsers.
async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase()
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data?.users?.length) return null
    const found = data.users.find(u => u.email?.toLowerCase() === target)
    if (found) return found.id
    if (data.users.length < 1000) return null // ultima pagina
  }
  return null
}

// POST /api/admin/invite — crea l'utente (se nuovo) e genera un link riutilizzabile
// per impostare la password. Nessuna email inviata.
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const { email } = await request.json()
  const cleanEmail = email?.trim()
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return NextResponse.json({ error: 'Email non valida' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Crea l'utente con email già confermata e senza password. Il profilo viene
  // creato dal trigger on_auth_user_created. Se l'utente esiste già, recuperiamo
  // il suo id e generiamo comunque un nuovo link (utile per i reset password).
  let userId: string | null = null
  let isNew = false
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: cleanEmail,
    email_confirm: true,
  })

  if (created?.user) {
    userId = created.user.id
    isNew = true
  } else {
    userId = await findUserIdByEmail(supabaseAdmin, cleanEmail)
    if (!userId) {
      return NextResponse.json(
        { error: `Impossibile creare o trovare l'utente: ${createErr?.message ?? 'errore sconosciuto'}` },
        { status: 500 }
      )
    }
  }

  // Origin della richiesta, così il link funziona sia in locale che in produzione
  const origin = request.headers.get('origin')
    ?? request.headers.get('referer')?.split('/').slice(0, 3).join('/')
    ?? ''

  const exp = Date.now() + LINK_VALIDITY_DAYS * 24 * 60 * 60 * 1000
  const token = signSetupToken({ uid: userId, email: cleanEmail, exp })
  const link = `${origin}/imposta-password?token=${encodeURIComponent(token)}`

  return NextResponse.json({
    success: true,
    link,
    message: `Link generato per ${cleanEmail}${isNew ? ' (nuovo utente)' : ' (utente esistente)'} — valido ${LINK_VALIDITY_DAYS} giorni e riutilizzabile.`,
  })
}
