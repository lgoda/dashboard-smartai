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

// POST /api/admin/invite — invita un nuovo utente o reinvia accesso a uno esistente
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const { email } = await request.json()
  if (!email?.trim() || !email.includes('@')) {
    return NextResponse.json({ error: 'Email non valida' }, { status: 400 })
  }

  // Prova prima con l'invito (utente nuovo)
  const supabaseAdmin = getSupabaseAdmin()
  const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email.trim())

  if (!inviteError) {
    return NextResponse.json({ success: true, message: `Invito inviato a ${email}` })
  }

  // Se l'utente esiste già, invia una password reset email
  // resetPasswordForEmail invia effettivamente l'email (generateLink no)
  const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(
    email.trim()
  )

  if (resetError) {
    return NextResponse.json({ error: `Impossibile inviare l'accesso: ${resetError.message}` }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: `Link di accesso inviato a ${email} — l'utente può impostare la password dall'email ricevuta`,
  })
}
