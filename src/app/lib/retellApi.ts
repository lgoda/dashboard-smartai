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
}

export type RetellFilterCriteria = {
  agent_id?: string
  call_status?: string
  start_timestamp_from?: number
  start_timestamp_to?: number
  end_timestamp_from?: number
  end_timestamp_to?: number
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
    } = {}
  ): Promise<{ data: RetellListCallsResponse | null; error: Error | null }> {
    try {
      const {
        filter_criteria = {},
        sort_order = 'descending',
        limit = 50,
        pagination_key
      } = options

      const body: any = {
        sort_order,
        limit
      }

      if (Object.keys(filter_criteria).length > 0) {
        body.filter_criteria = filter_criteria
      }

      if (pagination_key) {
        body.pagination_key = pagination_key
      }

      const response = await fetch(`${this.baseURL}/list-calls`, {
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

      const calls: RetellCall[] = await response.json()
      
      // Retell returns array directly, not wrapped in object
      // If we got a full page (equal to limit), there might be more
      // Use the last call_id as pagination key for next request
      const hasMore = calls.length === limit && calls.length > 0
      const nextPaginationKey = hasMore && calls.length > 0 
        ? calls[calls.length - 1].call_id 
        : undefined

      return {
        data: {
          calls,
          pagination_key: nextPaginationKey,
          hasMore
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
      const response = await fetch(`${this.baseURL}/get-call?call_id=${callId}`, {
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
      const response = await fetch(`${this.baseURL}/list-calls`, {
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
