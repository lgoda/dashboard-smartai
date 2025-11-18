import { NextRequest, NextResponse } from 'next/server'
import { ElevenLabsAPIClient, createAPIErrorResponse } from '@/app/lib/elevenLabsApi'

export const runtime = 'edge'
export const revalidate = 60

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        createAPIErrorResponse({
          message: 'Authorization header missing',
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
          message: 'User authentication failed',
          status: 401,
          code: 'UNAUTHORIZED'
        }),
        { status: 401 }
      )
    }

    const { token, error: tokenError } = await client.getActiveToken(user.id)
    if (tokenError || !token) {
      return NextResponse.json(
        createAPIErrorResponse({
          message: tokenError?.message || 'No active ElevenLabs token found',
          status: tokenError ? 500 : 404,
          code: tokenError ? 'TOKEN_FETCH_ERROR' : 'TOKEN_NOT_FOUND'
        }),
        { status: tokenError ? 500 : 404 }
      )
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

    const { data, error: apiError, metrics } = await client.callElevenLabsAPI(
      elevenLabsUrl.toString(),
      token,
      { timeout: 20000 }
    )

    if (apiError) {
      console.error('[ElevenLabs API Error]', {
        endpoint: elevenLabsUrl.toString(),
        status: apiError.status,
        message: apiError.message,
        duration: metrics.duration,
      })

      return NextResponse.json(
        createAPIErrorResponse(apiError),
        { status: apiError.status }
      )
    }

    const totalDuration = Date.now() - startTime
    const responseHeaders = new Headers()
    responseHeaders.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120')
    responseHeaders.set('X-Response-Time', `${totalDuration}ms`)
    responseHeaders.set('X-API-Duration', `${metrics.duration}ms`)

    console.log('[ElevenLabs API Success]', {
      endpoint: elevenLabsUrl.toString(),
      duration: metrics.duration,
      totalDuration,
      conversationCount: data?.conversations?.length || 0,
    })

    return NextResponse.json(data, {
      headers: responseHeaders
    })
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('[API Route Error]', {
      endpoint: request.url,
      duration,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    return NextResponse.json(
      createAPIErrorResponse({
        message: 'Internal server error',
        status: 500,
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : undefined,
      }),
      { status: 500 }
    )
  }
}
