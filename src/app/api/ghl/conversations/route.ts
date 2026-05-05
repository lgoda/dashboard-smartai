import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ghlAPIClient } from '@/app/lib/ghlApi'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const { token, locationId, error: tokenError } = await ghlAPIClient.getActiveToken(user.id, supabase)
    if (tokenError || !token || !locationId) {
      return NextResponse.json(
        { error: tokenError?.message ?? 'Nessun token GHL attivo trovato' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') ?? '20', 10)
    // type is not forwarded to GHL — the API ignores it; filtering is done client-side
    const status = (searchParams.get('status') ?? 'all') as 'open' | 'close' | 'all'
    const query = searchParams.get('query') ?? undefined

    // Cursor-based pagination
    const startAfter = searchParams.get('startAfter') ?? undefined
    const startAfterDate = searchParams.get('startAfterDate')
    const cursor = startAfter && startAfterDate
      ? { startAfter, startAfterDate: parseInt(startAfterDate, 10) }
      : undefined

    const { data, error } = await ghlAPIClient.listConversations(token, locationId, {
      limit,
      cursor,
      status,
      query,
    })

    if (error || !data) {
      console.error('[GHL] listConversations error:', error?.message)
      return NextResponse.json(
        { error: error?.message ?? 'Errore nel recupero delle conversazioni GHL' },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('[GHL] conversations route error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Errore interno del server' },
      { status: 500 }
    )
  }
}
