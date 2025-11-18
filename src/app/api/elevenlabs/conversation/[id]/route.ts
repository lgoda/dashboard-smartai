import { NextRequest, NextResponse } from 'next/server'
import { ElevenLabsAPIClient, createAPIErrorResponse } from '@/app/lib/elevenLabsApi'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()

  try {
    const { id } = await params

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        createAPIErrorResponse({
          message: 'Invalid conversation ID',
          status: 400,
          code: 'INVALID_PARAMETER'
        }),
        { status: 400 }
      )
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[Auth Error - Conversation] Invalid or missing authorization header')
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
      console.error('[Auth Error - Conversation]', {
        error: authError?.message,
        conversationId: id,
        timestamp: new Date().toISOString()
      })
      return NextResponse.json(
        createAPIErrorResponse({
          message: 'Authentication failed. Your session may have expired.',
          status: 401,
          code: 'UNAUTHORIZED',
          details: authError?.message
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

    const elevenLabsUrl = `https://api.elevenlabs.io/v1/convai/conversations/${id}`

    const { data, error: apiError, metrics } = await client.callElevenLabsAPI(
      elevenLabsUrl,
      token,
      { timeout: 15000 }
    )

    if (apiError) {
      console.error('[ElevenLabs API Error]', {
        conversationId: id,
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
    responseHeaders.set('X-Response-Time', `${totalDuration}ms`)
    responseHeaders.set('X-API-Duration', `${metrics.duration}ms`)

    console.log('[ElevenLabs API Success]', {
      conversationId: id,
      duration: metrics.duration,
      totalDuration,
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
