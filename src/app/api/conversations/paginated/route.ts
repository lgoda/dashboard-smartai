import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const accessToken = authHeader.replace('Bearer ', '')
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)

    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('page_size') || '100')
    const search = searchParams.get('search') || ''
    const outcome = searchParams.get('outcome') || ''
    const agentId = searchParams.get('agent_id') || ''
    const direction = searchParams.get('direction') || ''
    const minRating = parseFloat(searchParams.get('min_rating') || '0')
    const minDuration = parseInt(searchParams.get('min_duration') || '0')
    const maxDuration = parseInt(searchParams.get('max_duration') || '0')
    const dateFrom = searchParams.get('date_from') || ''
    const dateTo = searchParams.get('date_to') || ''
    const sortBy = searchParams.get('sort_by') || 'date'
    const sortOrder = searchParams.get('sort_order') || 'desc'

    let query = supabase
      .from('elevenlabs_conversations')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)

    if (search) {
      query = query.or(`agent_name.ilike.%${search}%,call_summary_title.ilike.%${search}%,transcript_summary.ilike.%${search}%`)
    }

    if (outcome) {
      query = query.eq('call_successful', outcome)
    }

    if (agentId) {
      query = query.eq('agent_id', agentId)
    }

    if (direction) {
      query = query.eq('direction', direction)
    }

    if (minRating > 0) {
      query = query.gte('rating', minRating)
    }

    if (minDuration > 0) {
      query = query.gte('call_duration_secs', minDuration)
    }

    if (maxDuration > 0) {
      query = query.lte('call_duration_secs', maxDuration)
    }

    if (dateFrom) {
      const fromUnix = Math.floor(new Date(dateFrom).getTime() / 1000)
      query = query.gte('start_time_unix_secs', fromUnix)
    }

    if (dateTo) {
      const toUnix = Math.floor(new Date(dateTo).getTime() / 1000)
      query = query.lte('start_time_unix_secs', toUnix)
    }

    let orderColumn = 'start_time_unix_secs'
    if (sortBy === 'duration') {
      orderColumn = 'call_duration_secs'
    } else if (sortBy === 'messages') {
      orderColumn = 'message_count'
    }

    query = query.order(orderColumn, { ascending: sortOrder === 'asc' })

    const offset = (page - 1) * pageSize
    query = query.range(offset, offset + pageSize - 1)

    const { data: conversations, error: queryError, count } = await query

    if (queryError) {
      console.error('[Query Error]', queryError)
      return NextResponse.json(
        { error: 'Failed to fetch conversations', details: queryError.message },
        { status: 500 }
      )
    }

    const totalPages = Math.ceil((count || 0) / pageSize)

    return NextResponse.json({
      conversations: conversations || [],
      pagination: {
        page,
        pageSize,
        totalItems: count || 0,
        totalPages,
        hasMore: page < totalPages
      }
    })

  } catch (error) {
    console.error('[API Error]', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
