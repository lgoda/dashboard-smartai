import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

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

// POST /api/admin/invite — genera link di invito senza inviare email (bypass rate limit)
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const { email } = await request.json()
  if (!email?.trim() || !email.includes('@')) {
    return NextResponse.json({ error: 'Email non valida' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdmin()

  // Usa l'origin della richiesta come redirect, così il link funziona sia in locale che in produzione
  const origin = request.headers.get('origin') ?? request.headers.get('referer')?.split('/').slice(0, 3).join('/') ?? ''
  const redirectTo = origin ? `${origin}/` : undefined

  // Prova prima con tipo 'invite' (utente nuovo)
  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email: email.trim(),
    options: { redirectTo },
  })

  if (!inviteError && inviteData?.properties?.action_link) {
    return NextResponse.json({
      success: true,
      link: inviteData.properties.action_link,
      message: `Link di invito generato per ${email.trim()}`,
    })
  }

  // Utente già esistente — genera link di recupero password
  const { data: recoveryData, error: recoveryError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: email.trim(),
    options: { redirectTo },
  })

  if (recoveryError || !recoveryData?.properties?.action_link) {
    return NextResponse.json(
      { error: `Impossibile generare il link: ${recoveryError?.message ?? inviteError?.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    link: recoveryData.properties.action_link,
    message: `Link di accesso generato per ${email.trim()} (utente esistente)`,
  })
}
