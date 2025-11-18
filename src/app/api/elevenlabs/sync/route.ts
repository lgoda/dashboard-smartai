import { NextRequest, NextResponse } from 'next/server'
import { ElevenLabsAPIClient, createAPIErrorResponse } from '@/app/lib/elevenLabsApi'
import { supabase } from '@/app/lib/supabaseClient'

export const runtime = 'edge'
export const maxDuration = 60

type ConversationData = {
  conversation_id: string
  agent_id: string
  agent_name?: string
  start_time_unix_secs: number
  call_duration_secs: number
  message_count: number
  status: string
  call_successful: string
  transcript_summary?: string
  call_summary_title?: string
  direction?: string
  rating?: number
  branch_id?: string
}

const normalizeOutcome = (outcome: string): string => {
  const normalized = outcome?.toLowerCase().trim()
  if (normalized === 'success' || normalized === 'successful') return 'successful'
  if (normalized === 'failure' || normalized === 'failed') return 'failed'
  return 'unknown'
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        createAPIErrorResponse({
          message: 'Authorization header missing or invalid',
          status: 401,
          code: 'UNAUTHORIZED'
        }),
        { status: 401 }
      )
    }

    const client = new ElevenLabsAPIClient(authHeader)
    const { user, error: authError } = await client.authenticateUser()

    if (authError || !user) {
      return NextResponse.json(
        createAPIErrorResponse({
          message: 'Authentication failed',
          status: 401,
          code: 'UNAUTHORIZED',
          details: authError?.message
        }),
        { status: 401 }
      )
    }

    const userId = user.id

    const { data: syncStatus } = await supabase
      .from('elevenlabs_sync_status')
      .select('sync_in_progress')
      .eq('user_id', userId)
      .maybeSingle()

    if (syncStatus?.sync_in_progress) {
      return NextResponse.json({
        success: false,
        message: 'Sync already in progress',
        inProgress: true
      })
    }

    await supabase
      .from('elevenlabs_sync_status')
      .upsert({
        user_id: userId,
        sync_in_progress: true,
        last_error: null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })

    const { token, error: tokenError } = await client.getActiveToken(userId)
    if (tokenError || !token) {
      await supabase
        .from('elevenlabs_sync_status')
        .update({
          sync_in_progress: false,
          last_error: tokenError?.message || 'No active token found'
        })
        .eq('user_id', userId)

      return NextResponse.json(
        createAPIErrorResponse({
          message: tokenError?.message || 'No active ElevenLabs token found',
          status: tokenError ? 500 : 404,
          code: tokenError ? 'TOKEN_FETCH_ERROR' : 'TOKEN_NOT_FOUND'
        }),
        { status: tokenError ? 500 : 404 }
      )
    }

    let cursor: string | undefined = undefined
    let totalFetched = 0
    let totalUpserted = 0
    const MAX_PAGES = 50
    let pageCount = 0

    console.log(`[Sync Start] User: ${userId}`)

    while (pageCount < MAX_PAGES) {
      const elevenLabsUrl = new URL('https://api.elevenlabs.io/v1/convai/conversations')
      elevenLabsUrl.searchParams.set('page_size', '100')
      if (cursor) {
        elevenLabsUrl.searchParams.set('cursor', cursor)
      }

      const { data, error: apiError } = await client.callElevenLabsAPI(
        elevenLabsUrl.toString(),
        token,
        { timeout: 25000 }
      )

      if (apiError) {
        await supabase
          .from('elevenlabs_sync_status')
          .update({
            sync_in_progress: false,
            last_error: `API Error: ${apiError.message}`
          })
          .eq('user_id', userId)

        return NextResponse.json(
          createAPIErrorResponse(apiError),
          { status: apiError.status }
        )
      }

      const conversations = data?.conversations || []
      totalFetched += conversations.length

      if (conversations.length > 0) {
        const conversationsToUpsert = conversations.map((conv: any) => ({
          user_id: userId,
          conversation_id: conv.conversation_id,
          agent_id: conv.agent_id,
          agent_name: conv.metadata?.agent_name || conv.agent_name || null,
          start_time_unix_secs: conv.start_time_unix_secs,
          call_duration_secs: conv.call_duration_secs || 0,
          message_count: conv.transcript?.length || 0,
          status: conv.status || '',
          call_successful: normalizeOutcome(conv.call_successful || conv.analysis?.call_successful || 'unknown'),
          transcript_summary: conv.analysis?.transcript_summary || null,
          call_summary_title: conv.analysis?.call_summary_title || null,
          direction: conv.metadata?.direction || null,
          rating: conv.analysis?.call_quality_rating || null,
          branch_id: conv.branch_id || null,
          raw_data: conv,
          updated_at: new Date().toISOString()
        }))

        const { error: upsertError, count } = await supabase
          .from('elevenlabs_conversations')
          .upsert(conversationsToUpsert, {
            onConflict: 'conversation_id',
            count: 'exact'
          })

        if (upsertError) {
          console.error('[Sync Error] Upsert failed:', upsertError)
          await supabase
            .from('elevenlabs_sync_status')
            .update({
              sync_in_progress: false,
              last_error: `Database error: ${upsertError.message}`
            })
            .eq('user_id', userId)

          return NextResponse.json({
            success: false,
            error: 'Failed to save conversations to database',
            details: upsertError.message
          }, { status: 500 })
        }

        totalUpserted += (count || conversations.length)
      }

      pageCount++
      console.log(`[Sync Progress] Page ${pageCount}, Fetched: ${conversations.length}, Total: ${totalFetched}`)

      if (!data?.has_more || !data?.cursor) {
        break
      }

      cursor = data.cursor
    }

    const { count: totalCount } = await supabase
      .from('elevenlabs_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    await supabase
      .from('elevenlabs_sync_status')
      .upsert({
        user_id: userId,
        last_sync_at: new Date().toISOString(),
        last_sync_cursor: cursor,
        total_conversations: totalCount || 0,
        sync_in_progress: false,
        last_error: null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })

    const duration = Date.now() - startTime
    console.log(`[Sync Complete] User: ${userId}, Fetched: ${totalFetched}, Upserted: ${totalUpserted}, Duration: ${duration}ms`)

    return NextResponse.json({
      success: true,
      fetched: totalFetched,
      upserted: totalUpserted,
      totalStored: totalCount || 0,
      pages: pageCount,
      duration
    })

  } catch (error) {
    const duration = Date.now() - startTime
    console.error('[Sync Error]', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration
    })

    return NextResponse.json({
      success: false,
      error: 'Sync failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
