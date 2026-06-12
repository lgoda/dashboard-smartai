import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySetupToken } from '@/app/lib/setupToken'

export const dynamic = 'force-dynamic'

// POST /api/auth/set-password-by-token
// Imposta la password di un utente partendo dal token firmato del link admin.
// È stateless e non tocca la sessione del browser: chi è già loggato (es. admin)
// resta loggato. Il token è riutilizzabile finché non scade.
export async function POST(request: NextRequest) {
  const { token, password } = await request.json()

  if (!token) {
    return NextResponse.json({ error: 'Token mancante' }, { status: 400 })
  }
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Password troppo corta (minimo 6 caratteri)' }, { status: 400 })
  }

  const payload = verifySetupToken(token)
  if (!payload) {
    return NextResponse.json(
      { error: 'Link non valido o scaduto — chiedi un nuovo link all\'amministratore' },
      { status: 401 }
    )
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { error } = await admin.auth.admin.updateUserById(payload.uid, { password })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, email: payload.email })
}
