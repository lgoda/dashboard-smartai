import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { retellAPIClient } from '@/app/lib/retellApi'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 401 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const {
      filter_criteria = {},
      sort_order = 'descending',
      limit = 50,
      pagination_key
    } = body

    console.log('[Retell API] Fetching token for user:', user.id)
    const { token, error: tokenError } = await retellAPIClient.getActiveToken(user.id, supabase)
    if (tokenError || !token) {
      console.error('[Retell API] Token error:', tokenError?.message || 'No token returned')
      return NextResponse.json(
        { error: tokenError?.message || 'No active Retell token found' },
        { status: 403 }
      )
    }
    console.log('[Retell API] Token retrieved successfully')

    const { data, error } = await retellAPIClient.listCalls(token, {
      filter_criteria,
      sort_order,
      limit,
      pagination_key
    })

      if (error || !data) {
      return NextResponse.json(
        { error: error?.message || 'Failed to fetch calls from Retell' },
        { status: 500 }
      )
    }

    // Return the data which already has { calls, pagination_key, hasMore } structure
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in Retell calls API route:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
