import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ghlAPIClient } from '@/app/lib/ghlApi'

export const revalidate = 30

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: conversationId } = await params
    const { searchParams } = new URL(request.url)
    const lastMessageId = searchParams.get('lastMessageId') ?? undefined
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)

    const { data, error } = await ghlAPIClient.getMessages(token, locationId, conversationId, {
      limit,
      lastMessageId,
    })

    if (error || !data) {
      console.error('[GHL] getMessages error:', error?.message)
      return NextResponse.json(
        { error: error?.message ?? 'Errore nel recupero dei messaggi GHL' },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('[GHL] messages route error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Errore interno del server' },
      { status: 500 }
    )
  }
}
