export type AICall = {
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

export type ConversationsResponse = {
  conversations: AICall[]
  cursor?: string
  hasMore: boolean
}

export type GetConversationsOptions = {
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
  pageSize?: number
  cursor?: string
}

const normalizeOutcome = (outcome: string): string => {
  const normalized = outcome?.toLowerCase().trim()
  if (normalized === 'success' || normalized === 'successful') return 'successful'
  if (normalized === 'failure' || normalized === 'failed') return 'failed'
  return 'unknown'
}

const normalizeConversation = (conv: any): AICall => ({
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
  branch_id: conv.branch_id || null
})

async function fetchWithRetry(
  url: string,
  accessToken: string,
  retries: number = 1
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })

      if (response.status === 401 && attempt < retries) {
        console.log(`Received 401 on attempt ${attempt + 1}, will retry...`)
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
        continue
      }

      return response
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error')
      if (attempt < retries) {
        console.log(`Network error on attempt ${attempt + 1}, retrying...`)
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
        continue
      }
    }
  }

  throw lastError || new Error('Failed after retries')
}

export async function getConversationsFromAPI(
  accessToken: string,
  options: GetConversationsOptions = {}
): Promise<ConversationsResponse> {
  const params = new URLSearchParams({
    page_size: String(options.pageSize || 100)
  })

  if (options.cursor) {
    params.set('cursor', options.cursor)
  }

  if (options.agentId) {
    params.set('agent_id', options.agentId)
  }

  if (options.outcome) {
    const outcomeMap: Record<string, string> = {
      'successful': 'success',
      'failed': 'failure'
    }
    const apiOutcome = outcomeMap[options.outcome] || options.outcome
    params.set('call_successful', apiOutcome)
  }

  if (options.dateFrom) {
    const unixFrom = Math.floor(options.dateFrom.getTime() / 1000)
    params.set('call_start_after_unix', String(unixFrom))
  }

  if (options.dateTo) {
    const unixTo = Math.floor(options.dateTo.getTime() / 1000)
    params.set('call_start_before_unix', String(unixTo))
  }

  const url = `/api/elevenlabs/conversations?${params.toString()}`
  const response = await fetchWithRetry(url, accessToken, 2)

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const errorMessage = errorData.error || errorData.message || response.statusText
    throw new Error(`Failed to fetch conversations (${response.status}): ${errorMessage}`)
  }

  const data = await response.json()
  let conversations = (data.conversations || []).map(normalizeConversation)

  conversations = filterConversationsClientSide(conversations, options)
  conversations = sortConversationsClientSide(conversations, options)

  return {
    conversations,
    cursor: data.cursor,
    hasMore: data.has_more !== undefined ? data.has_more : !!data.cursor
  }
}

function filterConversationsClientSide(
  conversations: AICall[],
  options: GetConversationsOptions
): AICall[] {
  let filtered = conversations

  if (options.search) {
    const searchLower = options.search.toLowerCase()
    filtered = filtered.filter(conv =>
      conv.conversation_id?.toLowerCase().includes(searchLower) ||
      conv.agent_id?.toLowerCase().includes(searchLower) ||
      conv.agent_name?.toLowerCase().includes(searchLower) ||
      conv.transcript_summary?.toLowerCase().includes(searchLower) ||
      conv.call_summary_title?.toLowerCase().includes(searchLower)
    )
  }

  if (options.direction) {
    filtered = filtered.filter(conv => conv.direction === options.direction)
  }

  if (options.minRating && options.minRating > 0) {
    filtered = filtered.filter(conv => (conv.rating || 0) >= options.minRating!)
  }

  if (options.minDuration && options.minDuration > 0) {
    filtered = filtered.filter(conv => conv.call_duration_secs >= options.minDuration!)
  }

  if (options.maxDuration && options.maxDuration > 0) {
    filtered = filtered.filter(conv => conv.call_duration_secs <= options.maxDuration!)
  }

  return filtered
}

function sortConversationsClientSide(
  conversations: AICall[],
  options: GetConversationsOptions
): AICall[] {
  if (!options.sortBy || options.sortBy === 'date') {
    return conversations
  }

  const sorted = [...conversations]
  const ascending = options.sortOrder === 'asc'

  sorted.sort((a, b) => {
    let aVal: number
    let bVal: number

    if (options.sortBy === 'duration') {
      aVal = a.call_duration_secs
      bVal = b.call_duration_secs
    } else if (options.sortBy === 'messages') {
      aVal = a.message_count
      bVal = b.message_count
    } else {
      aVal = a.start_time_unix_secs
      bVal = b.start_time_unix_secs
    }

    return ascending ? aVal - bVal : bVal - aVal
  })

  return sorted
}

export async function fetchAllConversationsForExport(
  accessToken: string,
  options: GetConversationsOptions = {},
  onProgress?: (fetched: number) => void
): Promise<AICall[]> {
  const allConversations: AICall[] = []
  let cursor: string | undefined = undefined
  const MAX_PAGES = 100
  let pageCount = 0

  try {
    while (pageCount < MAX_PAGES) {
      const response = await getConversationsFromAPI(accessToken, {
        ...options,
        cursor,
        pageSize: 100
      })

      allConversations.push(...response.conversations)
      pageCount++

      if (onProgress) {
        onProgress(allConversations.length)
      }

      if (!response.hasMore || !response.cursor) {
        break
      }

      cursor = response.cursor
    }

    return allConversations
  } catch (error) {
    console.error('Error fetching conversations for export:', error)
    throw error
  }
}
