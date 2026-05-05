import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '').trim()
  if (!token) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  const { password } = await request.json()
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Password troppo corta (minimo 6 caratteri)' }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verify token and get user in one call using the admin client
  const { data: { user }, error: userError } = await admin.auth.getUser(token)
  if (userError || !user) {
    return NextResponse.json({ error: 'Token non valido — richiedi un nuovo link' }, { status: 401 })
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password })
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
