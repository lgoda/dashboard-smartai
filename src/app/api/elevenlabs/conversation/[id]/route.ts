import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

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

    const elevenLabsUrl = `https://api.elevenlabs.io/v1/convai/conversations/${id}`

    const response = await fetch(elevenLabsUrl, {
      method: 'GET',
      headers: {
        'xi-api-key': tokenData.api_token,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('ElevenLabs API error:', errorText)
      return NextResponse.json(
        { error: 'Error fetching conversation from ElevenLabs', details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
