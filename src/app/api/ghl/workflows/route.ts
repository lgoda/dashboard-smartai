import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ghlAPIClient } from '@/app/lib/ghlApi'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

    const { token, locationId, error: tokenError } = await ghlAPIClient.getActiveToken(user.id, supabase)
    if (tokenError || !token || !locationId) {
      return NextResponse.json({ error: 'Token GHL non configurato nelle Impostazioni' }, { status: 403 })
    }

    const { data, error } = await ghlAPIClient.getWorkflows(token, locationId)
    if (error) {
      console.error('[ghl/workflows] GHL API error:', error.message)
      return NextResponse.json({ error: error.message, workflows: [] }, { status: 500 })
    }

    return NextResponse.json({ workflows: data ?? [] })
  } catch (err) {
    console.error('[ghl/workflows] unexpected error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Errore interno' }, { status: 500 })
  }
}
