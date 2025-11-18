import { createClient } from '@supabase/supabase-js'

export type ElevenLabsAPIError = {
  message: string
  status: number
  code?: string
  details?: string
}

export type APICallMetrics = {
  startTime: number
  endTime: number
  duration: number
  success: boolean
  endpoint: string
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export class ElevenLabsAPIClient {
  private supabase: any
  private metrics: APICallMetrics[] = []

  constructor(authHeader: string) {
    this.supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    })
  }

  async authenticateUser(): Promise<{ user: any; error: Error | null }> {
    const { data: { user }, error: userError } = await this.supabase.auth.getUser()

    if (userError || !user) {
      return { user: null, error: new Error('Unauthorized') }
    }

    return { user, error: null }
  }

  async getActiveToken(userId: string): Promise<{ token: string | null; error: Error | null }> {
    const { data: tokenData, error: tokenError } = await this.supabase
      .from('elevenlabs_tokens')
      .select('api_token, is_active')
      .eq('user_id', userId)
      .maybeSingle()

    if (tokenError) {
      return { token: null, error: new Error('Error fetching token') }
    }

    if (!tokenData || !tokenData.is_active) {
      return { token: null, error: new Error('No active ElevenLabs token found') }
    }

    return { token: tokenData.api_token, error: null }
  }

  async callElevenLabsAPI(
    endpoint: string,
    apiToken: string,
    options: {
      method?: string
      timeout?: number
      signal?: AbortSignal
    } = {}
  ): Promise<{ data: any; error: ElevenLabsAPIError | null; metrics: APICallMetrics }> {
    const startTime = Date.now()
    const method = options.method || 'GET'
    const timeout = options.timeout || 30000

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const signal = options.signal || controller.signal

    const metrics: APICallMetrics = {
      startTime,
      endTime: 0,
      duration: 0,
      success: false,
      endpoint
    }

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          'xi-api-key': apiToken,
          'Content-Type': 'application/json',
        },
        signal,
      })

      clearTimeout(timeoutId)
      metrics.endTime = Date.now()
      metrics.duration = metrics.endTime - metrics.startTime

      if (!response.ok) {
        const errorText = await response.text()
        metrics.success = false

        return {
          data: null,
          error: {
            message: 'ElevenLabs API error',
            status: response.status,
            details: errorText,
          },
          metrics
        }
      }

      const data = await response.json()
      metrics.success = true
      this.metrics.push(metrics)

      return { data, error: null, metrics }
    } catch (fetchError) {
      clearTimeout(timeoutId)
      metrics.endTime = Date.now()
      metrics.duration = metrics.endTime - metrics.startTime
      metrics.success = false

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return {
          data: null,
          error: {
            message: 'Request timeout',
            status: 504,
            code: 'TIMEOUT',
          },
          metrics
        }
      }

      return {
        data: null,
        error: {
          message: fetchError instanceof Error ? fetchError.message : 'Unknown error',
          status: 500,
          code: 'INTERNAL_ERROR',
        },
        metrics
      }
    }
  }

  async callElevenLabsAPIBinary(
    endpoint: string,
    apiToken: string,
    options: {
      timeout?: number
      signal?: AbortSignal
    } = {}
  ): Promise<{ blob: Blob | null; contentType: string | null; error: ElevenLabsAPIError | null }> {
    const timeout = options.timeout || 30000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const signal = options.signal || controller.signal

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'xi-api-key': apiToken,
        },
        signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        return {
          blob: null,
          contentType: null,
          error: {
            message: 'Error fetching binary data from ElevenLabs',
            status: response.status,
            details: errorText,
          }
        }
      }

      const blob = await response.blob()
      const contentType = response.headers.get('Content-Type')

      return { blob, contentType, error: null }
    } catch (fetchError) {
      clearTimeout(timeoutId)

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return {
          blob: null,
          contentType: null,
          error: {
            message: 'Request timeout',
            status: 504,
            code: 'TIMEOUT',
          }
        }
      }

      return {
        blob: null,
        contentType: null,
        error: {
          message: fetchError instanceof Error ? fetchError.message : 'Unknown error',
          status: 500,
        }
      }
    }
  }

  getMetrics(): APICallMetrics[] {
    return this.metrics
  }

  getAverageResponseTime(): number {
    if (this.metrics.length === 0) return 0
    const total = this.metrics.reduce((sum, m) => sum + m.duration, 0)
    return total / this.metrics.length
  }

  getSuccessRate(): number {
    if (this.metrics.length === 0) return 0
    const successful = this.metrics.filter(m => m.success).length
    return (successful / this.metrics.length) * 100
  }
}

export async function verifyElevenLabsToken(token: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch('https://api.elevenlabs.io/v1/convai/conversations?page_size=1', {
      method: 'GET',
      headers: {
        'xi-api-key': token,
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    return response.ok
  } catch (error) {
    return false
  }
}

export function sanitizeErrorMessage(error: any): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error?.message) return error.message
  return 'An unknown error occurred'
}

export function createAPIErrorResponse(error: ElevenLabsAPIError) {
  return {
    error: error.message,
    status: error.status,
    code: error.code,
    details: error.details,
    timestamp: new Date().toISOString(),
  }
}
