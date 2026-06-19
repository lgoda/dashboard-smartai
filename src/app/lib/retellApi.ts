import { supabase } from './supabaseClient'
import { SupabaseClient } from '@supabase/supabase-js'

export type RetellCall = {
  call_id: string
  call_type: 'web_call' | 'phone_call'
  agent_id: string
  agent_name?: string
  agent_version?: number
  call_status: 'registered' | 'not_connected' | 'ongoing' | 'ended' | 'error'
  start_timestamp?: number
  end_timestamp?: number
  duration_ms?: number
  transcript?: string
  recording_url?: string
  disconnection_reason?: string
  transfer_destination?: string | null
  call_analysis?: {
    call_summary?: string
    in_voicemail?: boolean
    user_sentiment?: string
    call_successful?: boolean
    custom_analysis_data?: Record<string, any>
  }
  call_cost?: {
    product_costs?: Array<{
      product: string
      unit_price: number
      cost: number
    }>
    total_duration_seconds?: number
    total_duration_unit_price?: number
    combined_cost?: number
  }
  metadata?: Record<string, any>
  retell_llm_dynamic_variables?: Record<string, any>
  collected_dynamic_variables?: Record<string, any>
}

export type RetellListCallsResponse = {
  calls: RetellCall[]
  pagination_key?: string
  hasMore: boolean
  // Total count of calls matching filter_criteria (ignores limit/pagination).
  // Only present when the request opts in via `include_total`.
  total?: number
}

// Retell range filter: { type: 'range', op: 'bt', value: [lowerMs, upperMs] }.
// This is the friendly INPUT shape callers use; `toV3FilterCriteria` below
// translates it into the v3 wire format. The flat start_timestamp_from/to
// fields are also accepted and converted to range/number filters for v3.
export type RetellRangeFilter = { type: 'range'; op: string; value: number[] }

export type RetellFilterCriteria = {
  agent_id?: string | string[]
  call_status?: string | string[]
  start_timestamp?: RetellRangeFilter
  end_timestamp?: RetellRangeFilter
  start_timestamp_from?: number
  start_timestamp_to?: number
  end_timestamp_from?: number
  end_timestamp_to?: number
}

// v3 list-calls endpoint (the legacy /v2/list-calls is deprecated as of 2026-06-15).
// https://docs.retellai.com/deprecation-notice/2026/06-15_legacy_list_endpoints
const RETELL_LIST_CALLS_URL = 'https://api.retellai.com/v3/list-calls'

// v3 replaces flat *_from/_to with a structured range/number filter.
function timeFilter(
  structured: RetellRangeFilter | undefined,
  from: number | undefined,
  to: number | undefined,
): Record<string, unknown> | undefined {
  if (structured) return structured // already { type:'range', op:'bt', value:[lo,hi] }
  if (from != null && to != null) return { op: 'bt', type: 'range', value: [from, to] }
  if (from != null) return { op: 'ge', type: 'number', value: from }
  if (to != null) return { op: 'le', type: 'number', value: to }
  return undefined
}

// Translate the friendly v2-style filter into the v3 wire format:
// agent_id → agent[], call_status string(s) → enum filter, flat timestamps → range.
function toV3FilterCriteria(fc: RetellFilterCriteria): Record<string, unknown> {
  const v3: Record<string, unknown> = {}

  if (fc.agent_id != null) {
    const ids = Array.isArray(fc.agent_id) ? fc.agent_id : [fc.agent_id]
    if (ids.length > 0) v3.agent = ids.map((agent_id) => ({ agent_id }))
  }

  if (fc.call_status != null) {
    const statuses = Array.isArray(fc.call_status) ? fc.call_status : [fc.call_status]
    if (statuses.length > 0) v3.call_status = { op: 'in', type: 'enum', value: statuses }
  }

  const start = timeFilter(fc.start_timestamp, fc.start_timestamp_from, fc.start_timestamp_to)
  if (start) v3.start_timestamp = start
  const end = timeFilter(fc.end_timestamp, fc.end_timestamp_from, fc.end_timestamp_to)
  if (end) v3.end_timestamp = end

  return v3
}

export class RetellAPIClient {
  private supabase = supabase
  private baseURL = 'https://api.retellai.com/v2'

  async getActiveToken(userId: string, supabaseClient?: SupabaseClient): Promise<{ token: string | null; error: Error | null }> {
    try {
      const client = supabaseClient || this.supabase
      
      const { data: tokenData, error: tokenError } = await client
        .from('retell_tokens')
        .select('api_token, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle()

      if (tokenError) {
        console.error('Error fetching Retell token:', tokenError)
        return { token: null, error: new Error(`Error fetching token: ${tokenError.message}`) }
      }

      if (!tokenData) {
        console.error('No active Retell token found for user:', userId)
        return { token: null, error: new Error('No active Retell token found') }
      }

      if (!tokenData.is_active) {
        console.error('Retell token found but is not active for user:', userId)
        return { token: null, error: new Error('Retell token is not active') }
      }

      return { token: tokenData.api_token, error: null }
    } catch (error) {
      console.error('Unexpected error in getActiveToken:', error)
      return { 
        token: null, 
        error: error instanceof Error ? error : new Error('Unexpected error fetching token') 
      }
    }
  }

  async listCalls(
    apiToken: string,
    options: {
      filter_criteria?: RetellFilterCriteria
      sort_order?: 'ascending' | 'descending'
      limit?: number
      pagination_key?: string
      include_total?: boolean
    } = {}
  ): Promise<{ data: RetellListCallsResponse | null; error: Error | null }> {
    try {
      const {
        filter_criteria = {},
        sort_order = 'descending',
        limit = 50,
        pagination_key,
        include_total
      } = options

      const body: any = {
        sort_order,
        limit
      }

      const v3Filter = toV3FilterCriteria(filter_criteria)
      if (Object.keys(v3Filter).length > 0) {
        body.filter_criteria = v3Filter
      }

      if (pagination_key) {
        body.pagination_key = pagination_key
      }

      if (include_total) {
        body.include_total = true
      }

      const response = await fetch(RETELL_LIST_CALLS_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Retell API error:', errorText)
        return {
          data: null,
          error: new Error(`Retell API error: ${response.status} ${errorText}`)
        }
      }

      // v3 wraps results in { items, pagination_key, has_more, total? }.
      const json = await response.json()
      const calls: RetellCall[] = json.items ?? []
      const hasMore = Boolean(json.has_more)
      const nextPaginationKey = hasMore ? (json.pagination_key ?? undefined) : undefined

      // v3 returns `total` as a string (e.g. "1403") — coerce to a number.
      const totalNum = json.total != null ? Number(json.total) : NaN

      return {
        data: {
          calls,
          pagination_key: nextPaginationKey,
          hasMore,
          total: Number.isFinite(totalNum) ? totalNum : undefined
        },
        error: null
      }
    } catch (error) {
      console.error('Error calling Retell API:', error)
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Unknown error calling Retell API')
      }
    }
  }

  async getCall(apiToken: string, callId: string): Promise<{ data: RetellCall | null; error: Error | null }> {
    try {
      const response = await fetch(`${this.baseURL}/get-call/${callId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiToken}`
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        return {
          data: null,
          error: new Error(`Retell API error: ${response.status} ${errorText}`)
        }
      }

      const call: RetellCall = await response.json()
      return { data: call, error: null }
    } catch (error) {
      console.error('Error calling Retell API:', error)
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Unknown error calling Retell API')
      }
    }
  }

  async verifyToken(apiToken: string): Promise<boolean> {
    try {
      const response = await fetch(RETELL_LIST_CALLS_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          limit: 1
        })
      })

      return response.ok
    } catch (error) {
      console.error('Error verifying Retell token:', error)
      return false
    }
  }
}

export const retellAPIClient = new RetellAPIClient()
