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

    const elevenLabsUrl = `https://api.elevenlabs.io/v1/convai/conversations/${id}/audio`

    const { blob, contentType, error: apiError } = await client.callElevenLabsAPIBinary(
      elevenLabsUrl,
      token,
      { timeout: 30000 }
    )

    if (apiError || !blob) {
      console.error('[ElevenLabs API Error - Audio]', {
        conversationId: id,
        status: apiError?.status,
        message: apiError?.message,
      })

      return NextResponse.json(
        createAPIErrorResponse(apiError || {
          message: 'Failed to fetch audio',
          status: 500,
          code: 'AUDIO_FETCH_ERROR'
        }),
        { status: apiError?.status || 500 }
      )
    }

    const totalDuration = Date.now() - startTime
    const responseHeaders = new Headers()
    responseHeaders.set('Content-Type', contentType || 'audio/mpeg')
    responseHeaders.set('X-Response-Time', `${totalDuration}ms`)
    responseHeaders.set('Cache-Control', 'private, max-age=3600')

    console.log('[ElevenLabs API Success - Audio]', {
      conversationId: id,
      duration: totalDuration,
      contentType,
      size: blob.size,
    })

    return new NextResponse(blob, {
      headers: responseHeaders,
    })
  } catch (error) {
    const duration = Date.now() - startTime
    console.error('[API Route Error - Audio]', {
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
