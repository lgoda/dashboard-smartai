import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const runtime = 'edge'
export const revalidate = 60

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: tokenData, error: tokenError } = await supabase
      .from('elevenlabs_tokens')
      .select('api_token, is_active')
      .eq('user_id', user.id)
      .maybeSingle()

    if (tokenError) {
      return NextResponse.json({ error: 'Error fetching token' }, { status: 500 })
    }

    if (!tokenData || !tokenData.is_active) {
      return NextResponse.json({ error: 'No active ElevenLabs token found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')
    const callSuccessful = searchParams.get('call_successful')
    const callStartBefore = searchParams.get('call_start_before_unix')
    const callStartAfter = searchParams.get('call_start_after_unix')
    const pageSize = searchParams.get('page_size') || '100'
    const cursor = searchParams.get('cursor')

    const elevenLabsUrl = new URL('https://api.elevenlabs.io/v1/convai/conversations')
    if (agentId) elevenLabsUrl.searchParams.set('agent_id', agentId)
    if (callSuccessful) elevenLabsUrl.searchParams.set('call_successful', callSuccessful)
    if (callStartBefore) elevenLabsUrl.searchParams.set('call_start_before_unix', callStartBefore)
    if (callStartAfter) elevenLabsUrl.searchParams.set('call_start_after_unix', callStartAfter)
    elevenLabsUrl.searchParams.set('page_size', pageSize)
    if (cursor) elevenLabsUrl.searchParams.set('cursor', cursor)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const response = await fetch(elevenLabsUrl.toString(), {
        method: 'GET',
        headers: {
          'xi-api-key': tokenData.api_token,
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('ElevenLabs API error:', errorText)
        return NextResponse.json(
          { error: 'Error fetching conversations from ElevenLabs', details: errorText },
          { status: response.status }
        )
      }

      const data = await response.json()

      const responseHeaders = new Headers()
      responseHeaders.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120')

      return NextResponse.json(data, {
        headers: responseHeaders
      })
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timeout' },
          { status: 504 }
        )
      }
      throw fetchError
    }
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
