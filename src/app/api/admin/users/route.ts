import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function requireAdmin(authHeader: string | null) {
  if (!authHeader) return null
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

// GET /api/admin/users — lista tutti i profili
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const { data: profiles, error } = await supabaseAdmin
    .from('profiles')
    .select('id, full_name, phone, company, role, is_active, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Arricchisce con l'email da auth.users
  const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers()
  const emailMap = Object.fromEntries(authUsers.map(u => [u.id, u.email]))

  const enriched = (profiles ?? []).map(p => ({ ...p, email: emailMap[p.id] ?? '' }))
  return NextResponse.json({ users: enriched })
}

// PATCH /api/admin/users — aggiorna is_active o role di un utente
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request.headers.get('authorization'))
  if (!admin) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const { userId, is_active, role } = await request.json()
  if (!userId) return NextResponse.json({ error: 'userId richiesto' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (typeof is_active === 'boolean') updates.is_active = is_active
  if (role === 'admin' || role === 'user') updates.role = role

  const { error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
