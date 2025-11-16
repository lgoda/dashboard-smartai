import { supabase } from './supabaseClient'

export type SyncProgress = {
  currentPage: number
  totalFetched: number
  isComplete: boolean
  error?: string
}

export type SyncProgressCallback = (progress: SyncProgress) => void

const normalizeOutcome = (outcome: string): string => {
  const normalized = outcome?.toLowerCase().trim()
  if (normalized === 'success' || normalized === 'successful') return 'successful'
  if (normalized === 'failure' || normalized === 'failed') return 'failed'
  return 'unknown'
}

export async function fetchAllConversationsFromAPI(
  accessToken: string,
  onProgress?: SyncProgressCallback
): Promise<any[]> {
  const allConversations: any[] = []
  let cursor: string | undefined = undefined
  let pageCount = 0
  const MAX_PAGES = 1000

  try {
    while (pageCount < MAX_PAGES) {
      pageCount++

      const params = new URLSearchParams({
        page_size: '100'
      })

      if (cursor) {
        params.set('cursor', cursor)
      }

      const response = await fetch(`/api/elevenlabs/conversations?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch conversations: ${response.statusText}`)
      }

      const data = await response.json()
      const conversations = data.conversations || []

      const normalizedConversations = conversations.map((conv: any) => ({
        ...conv,
        call_successful: normalizeOutcome(conv.call_successful),
        agent_name: conv.agent_name || null,
        transcript_summary: conv.transcript_summary || null,
        call_summary_title: conv.call_summary_title || null,
        direction: conv.direction || null,
        rating: conv.rating || null,
        branch_id: conv.branch_id || null
      }))

      allConversations.push(...normalizedConversations)

      if (onProgress) {
        onProgress({
          currentPage: pageCount,
          totalFetched: allConversations.length,
          isComplete: false
        })
      }

      if (!data.cursor) {
        break
      }

      cursor = data.cursor
    }

    if (onProgress) {
      onProgress({
        currentPage: pageCount,
        totalFetched: allConversations.length,
        isComplete: true
      })
    }

    return allConversations
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    if (onProgress) {
      onProgress({
        currentPage: pageCount,
        totalFetched: allConversations.length,
        isComplete: false,
        error: errorMessage
      })
    }
    throw error
  }
}

export async function saveConversationsToSupabase(
  userId: string,
  conversations: any[]
): Promise<void> {
  if (conversations.length === 0) return

  const conversationsToInsert = conversations.map(conv => ({
    user_id: userId,
    conversation_id: conv.conversation_id,
    agent_id: conv.agent_id,
    agent_name: conv.agent_name,
    start_time_unix_secs: conv.start_time_unix_secs,
    call_duration_secs: conv.call_duration_secs,
    message_count: conv.message_count,
    status: conv.status,
    call_successful: conv.call_successful,
    transcript_summary: conv.transcript_summary,
    call_summary_title: conv.call_summary_title,
    direction: conv.direction,
    rating: conv.rating,
    branch_id: conv.branch_id,
    raw_data: conv
  }))

  const batchSize = 100
  for (let i = 0; i < conversationsToInsert.length; i += batchSize) {
    const batch = conversationsToInsert.slice(i, i + batchSize)

    const { error } = await supabase
      .from('elevenlabs_conversations')
      .upsert(batch, {
        onConflict: 'conversation_id',
        ignoreDuplicates: false
      })

    if (error) {
      console.error('Error saving conversations batch:', error)
      throw error
    }
  }
}

export async function updateSyncStatus(
  userId: string,
  data: {
    last_sync_at?: string
    total_conversations?: number
    sync_in_progress?: boolean
    last_error?: string | null
  }
): Promise<void> {
  const { error } = await supabase
    .from('elevenlabs_sync_status')
    .upsert({
      user_id: userId,
      ...data,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    })

  if (error) {
    console.error('Error updating sync status:', error)
    throw error
  }
}

export async function getSyncStatus(userId: string): Promise<any> {
  const { data, error } = await supabase
    .from('elevenlabs_sync_status')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('Error fetching sync status:', error)
    return null
  }

  return data
}

export async function performFullSync(
  userId: string,
  accessToken: string,
  onProgress?: SyncProgressCallback
): Promise<void> {
  try {
    await updateSyncStatus(userId, {
      sync_in_progress: true,
      last_error: null
    })

    const conversations = await fetchAllConversationsFromAPI(accessToken, onProgress)

    await saveConversationsToSupabase(userId, conversations)

    await updateSyncStatus(userId, {
      last_sync_at: new Date().toISOString(),
      total_conversations: conversations.length,
      sync_in_progress: false,
      last_error: null
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await updateSyncStatus(userId, {
      sync_in_progress: false,
      last_error: errorMessage
    })
    throw error
  }
}

export async function getConversationsFromSupabase(
  userId: string,
  options: {
    search?: string
    dateFrom?: Date
    dateTo?: Date
    outcome?: string
    agentId?: string
    direction?: string
    minRating?: number
    minDuration?: number
    maxDuration?: number
    sortBy?: 'date' | 'duration' | 'messages'
    sortOrder?: 'asc' | 'desc'
    page?: number
    pageSize?: number
  } = {}
): Promise<{ data: any[], count: number }> {
  let query = supabase
    .from('elevenlabs_conversations')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)

  if (options.search) {
    query = query.or(`conversation_id.ilike.%${options.search}%,agent_id.ilike.%${options.search}%,agent_name.ilike.%${options.search}%,transcript_summary.ilike.%${options.search}%,call_summary_title.ilike.%${options.search}%`)
  }

  if (options.dateFrom) {
    const unixFrom = Math.floor(options.dateFrom.getTime() / 1000)
    query = query.gte('start_time_unix_secs', unixFrom)
  }

  if (options.dateTo) {
    const unixTo = Math.floor(options.dateTo.getTime() / 1000)
    query = query.lte('start_time_unix_secs', unixTo)
  }

  if (options.outcome) {
    query = query.eq('call_successful', options.outcome)
  }

  if (options.agentId) {
    query = query.eq('agent_id', options.agentId)
  }

  if (options.direction) {
    query = query.eq('direction', options.direction)
  }

  if (options.minRating && options.minRating > 0) {
    query = query.gte('rating', options.minRating)
  }

  if (options.minDuration && options.minDuration > 0) {
    query = query.gte('call_duration_secs', options.minDuration)
  }

  if (options.maxDuration && options.maxDuration > 0) {
    query = query.lte('call_duration_secs', options.maxDuration)
  }

  const sortColumn = options.sortBy === 'duration'
    ? 'call_duration_secs'
    : options.sortBy === 'messages'
    ? 'message_count'
    : 'start_time_unix_secs'

  const ascending = options.sortOrder === 'asc'
  query = query.order(sortColumn, { ascending })

  if (options.page && options.pageSize) {
    const from = (options.page - 1) * options.pageSize
    const to = from + options.pageSize - 1
    query = query.range(from, to)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('Error fetching conversations from Supabase:', error)
    throw error
  }

  return { data: data || [], count: count || 0 }
}
