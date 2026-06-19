import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { retellAPIClient } from '@/app/lib/retellApi'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// The v3 list-calls endpoint omits the `transcript` field; it's only available
// via get-call. This route fetches the full call so the UI can show the transcript.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params

    const { token, error: tokenError } = await retellAPIClient.getActiveToken(user.id, supabase)
    if (tokenError || !token) {
      return NextResponse.json({ error: tokenError?.message || 'No active Retell token found' }, { status: 403 })
    }

    const { data, error } = await retellAPIClient.getCall(token, id)
    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Failed to fetch call from Retell' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in Retell get-call API route:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
