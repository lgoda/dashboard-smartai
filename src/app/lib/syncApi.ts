export type SyncStatus = {
  id: string
  user_id: string
  last_sync_at: string | null
  last_sync_cursor: string | null
  total_conversations: number
  sync_in_progress: boolean
  last_error: string | null
  created_at: string
  updated_at: string
}

export type SyncResponse = {
  success: boolean
  fetched?: number
  upserted?: number
  totalStored?: number
  pages?: number
  duration?: number
  inProgress?: boolean
  message?: string
  error?: string
}

export type PaginatedConversation = {
  id: string
  user_id: string
  conversation_id: string
  agent_id: string
  agent_name: string | null
  start_time_unix_secs: number
  call_duration_secs: number
  message_count: number
  status: string
  call_successful: string
  transcript_summary: string | null
  call_summary_title: string | null
  direction: string | null
  rating: number | null
  branch_id: string | null
  raw_data: any
  created_at: string
  updated_at: string
}

export type PaginationInfo = {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  hasMore: boolean
}

export type PaginatedResponse = {
  conversations: PaginatedConversation[]
  pagination: PaginationInfo
}

export type GetPaginatedConversationsOptions = {
  page?: number
  pageSize?: number
  search?: string
  outcome?: string
  agentId?: string
  direction?: string
  minRating?: number
  minDuration?: number
  maxDuration?: number
  dateFrom?: Date
  dateTo?: Date
  sortBy?: 'date' | 'duration' | 'messages'
  sortOrder?: 'asc' | 'desc'
}

export async function triggerSync(accessToken: string): Promise<SyncResponse> {
  const response = await fetch('/api/elevenlabs/sync', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || errorData.message || 'Sync failed')
  }

  return await response.json()
}

export async function getPaginatedConversations(
  accessToken: string,
  options: GetPaginatedConversationsOptions = {}
): Promise<PaginatedResponse> {
  const params = new URLSearchParams()

  if (options.page) params.set('page', String(options.page))
  if (options.pageSize) params.set('page_size', String(options.pageSize))
  if (options.search) params.set('search', options.search)
  if (options.outcome) params.set('outcome', options.outcome)
  if (options.agentId) params.set('agent_id', options.agentId)
  if (options.direction) params.set('direction', options.direction)
  if (options.minRating && options.minRating > 0) params.set('min_rating', String(options.minRating))
  if (options.minDuration && options.minDuration > 0) params.set('min_duration', String(options.minDuration))
  if (options.maxDuration && options.maxDuration > 0) params.set('max_duration', String(options.maxDuration))
  if (options.dateFrom) params.set('date_from', options.dateFrom.toISOString())
  if (options.dateTo) params.set('date_to', options.dateTo.toISOString())
  if (options.sortBy) params.set('sort_by', options.sortBy)
  if (options.sortOrder) params.set('sort_order', options.sortOrder)

  const url = `/api/conversations/paginated?${params.toString()}`
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || errorData.message || 'Failed to fetch conversations')
  }

  return await response.json()
}
