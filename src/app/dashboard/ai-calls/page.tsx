'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/components/AuthProvider'
import Link from 'next/link'
import DateRangePicker from '@/app/components/DateRangePicker'
import FilterBadge from '@/app/components/FilterBadge'
import { useDebounce } from '@/app/lib/useDebounce'
import { getConversationsFromAPI, AICall } from '@/app/lib/conversationsApi'
import { RetellCall } from '@/app/lib/retellApi'
import { UnifiedAICall, normalizeElevenLabsCall, normalizeRetellCall, getUnifiedCallStatus, getUnifiedCallSuccess, getUnifiedTerminationReason, getUnifiedSentiment, getUnifiedCost, getDisconnectionReasonLabel } from '@/app/lib/aiCallsHelper'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

type DateRange = {
  from: Date | null
  to: Date | null
}

type Provider = 'elevenlabs' | 'retell' | 'all'

type Filters = {
  search: string
  dateRange: DateRange
  outcome: string
  agentId: string
  direction: string
  minRating: number
  minDuration: number
  maxDuration: number
  callStatus: string
  terminationReason: string
  sentiment: string
  minCost: number
  maxCost: number
  sortBy: 'date' | 'duration' | 'messages' | 'cost'
  sortOrder: 'asc' | 'desc'
}

export default function AICallsPage() {
  const { user, loading: authLoading } = useAuth()
  const [hasElevenLabsToken, setHasElevenLabsToken] = useState(false)
  const [hasRetellToken, setHasRetellToken] = useState(false)
  const [provider, setProvider] = useState<Provider>('all')
  const [calls, setCalls] = useState<UnifiedAICall[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const isLoading = authLoading || dataLoading
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [nextPaginationKey, setNextPaginationKey] = useState<string | undefined>(undefined)
  const [hasMore, setHasMore] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [loadingAudio, setLoadingAudio] = useState<Record<string, boolean>>({})
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({})
  const [filters, setFilters] = useState<Filters>({
    search: '',
    dateRange: { from: null, to: null },
    outcome: '',
    agentId: '',
    direction: '',
    minRating: 0,
    minDuration: 0,
    maxDuration: 0,
    callStatus: '',
    terminationReason: '',
    sentiment: '',
    minCost: 0,
    maxCost: 0,
    sortBy: 'date',
    sortOrder: 'desc'
  })
  const router = useRouter()
  const observerTarget = useRef<HTMLDivElement>(null)
  const hasMoreRef = useRef(false)
  const isLoadingMoreRef = useRef(false)
  const isLoadingRef = useRef(false)
  const nextCursorRef = useRef<string | undefined>(undefined)
  const nextPaginationKeyRef = useRef<string | undefined>(undefined)

  const debouncedSearch = useDebounce(filters.search, 500)
  
  // Keep refs in sync with state
  useEffect(() => {
    hasMoreRef.current = hasMore
  }, [hasMore])
  
  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore
  }, [isLoadingMore])
  
  useEffect(() => {
    isLoadingRef.current = isLoading
  }, [isLoading])
  
  useEffect(() => {
    nextCursorRef.current = nextCursor
  }, [nextCursor])
  
  useEffect(() => {
    nextPaginationKeyRef.current = nextPaginationKey
  }, [nextPaginationKey])

  useEffect(() => {
    if (!user?.id) return
    const checkTokens = async () => {
      try {
        const [elevenLabsTokenRes, retellTokenRes] = await Promise.all([
          supabase.from('elevenlabs_tokens').select('is_active').eq('user_id', user.id).maybeSingle(),
          supabase.from('retell_tokens').select('is_active').eq('user_id', user.id).maybeSingle(),
        ])
        setHasElevenLabsToken(elevenLabsTokenRes.data?.is_active ?? false)
        setHasRetellToken(retellTokenRes.data?.is_active ?? false)
        if (!elevenLabsTokenRes.data?.is_active && !retellTokenRes.data?.is_active) {
          setDataLoading(false)
        }
      } catch (error) {
        console.error('Error checking tokens:', error)
        setDataLoading(false)
      }
    }
    checkTokens()
  }, [user?.id])

  const getValidSession = useCallback(async () => {
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !sessionData?.session) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError || !refreshData?.session) {
          throw new Error('Session expired')
        }
        return refreshData.session
      }

      return sessionData.session
    } catch (error) {
      console.error('Error getting valid session:', error)
      throw error
    }
  }, [])

  const loadRetellCalls = useCallback(async (reset: boolean = false, skipStateUpdate: boolean = false): Promise<UnifiedAICall[] | void> => {
    if (!user || !hasRetellToken) return

    try {
      if (!skipStateUpdate) {
        if (reset) {
          setDataLoading(true)
          setCalls([])
          setNextPaginationKey(undefined)
          setHasMore(true)
        } else {
          if (!hasMoreRef.current || !nextPaginationKeyRef.current) {
            setHasMore(false)
            return []
          }
          setIsLoadingMore(true)
        }
      }
      setError(null)

      const session = await getValidSession()
      const token = session?.access_token
      if (!token) throw new Error('No access token available')

      const filterCriteria: any = {}
      if (filters.agentId) filterCriteria.agent_id = filters.agentId
      if (filters.callStatus) filterCriteria.call_status = filters.callStatus
      if (filters.dateRange.from) filterCriteria.start_timestamp_from = filters.dateRange.from.getTime()
      if (filters.dateRange.to) filterCriteria.start_timestamp_to = filters.dateRange.to.getTime()

      const response = await fetch('/api/retell/calls', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter_criteria: Object.keys(filterCriteria).length > 0 ? filterCriteria : undefined,
          sort_order: filters.sortOrder === 'asc' ? 'ascending' : 'descending',
          limit: 50,
          pagination_key: reset ? undefined : nextPaginationKeyRef.current
        })
      })

      if (!response.ok) {
        throw new Error('Failed to fetch Retell calls')
      }

      const data = await response.json()
      const normalizedCalls = data.calls.map((call: RetellCall) => normalizeRetellCall(call))

      // Apply client-side filters
      let filteredCalls = normalizedCalls
      if (debouncedSearch) {
        const searchLower = debouncedSearch.toLowerCase()
        filteredCalls = filteredCalls.filter((call: UnifiedAICall) =>
          call.agent_name?.toLowerCase().includes(searchLower) ||
          call.transcript_summary?.toLowerCase().includes(searchLower) ||
          call.id.toLowerCase().includes(searchLower)
        )
      }
      if (filters.terminationReason) {
        filteredCalls = filteredCalls.filter((call: UnifiedAICall) =>
          getUnifiedTerminationReason(call) === filters.terminationReason
        )
      }
      if (filters.sentiment) {
        filteredCalls = filteredCalls.filter((call: UnifiedAICall) =>
          getUnifiedSentiment(call) === filters.sentiment
        )
      }
      if (filters.minDuration > 0) {
        filteredCalls = filteredCalls.filter((call: UnifiedAICall) =>
          (call.duration_secs || 0) >= filters.minDuration
        )
      }
      if (filters.maxDuration > 0) {
        filteredCalls = filteredCalls.filter((call: UnifiedAICall) =>
          (call.duration_secs || 0) <= filters.maxDuration
        )
      }
      if (filters.minCost > 0) {
        filteredCalls = filteredCalls.filter((call: UnifiedAICall) =>
          (getUnifiedCost(call) || 0) >= filters.minCost
        )
      }
      if (filters.maxCost > 0) {
        filteredCalls = filteredCalls.filter((call: UnifiedAICall) =>
          (getUnifiedCost(call) || 0) <= filters.maxCost
        )
      }

      if (!skipStateUpdate) {
        if (reset) {
          setCalls(filteredCalls)
        } else {
          setCalls(prev => [...prev, ...filteredCalls])
        }

        setNextPaginationKey(data.pagination_key)
        setHasMore(data.hasMore)
      } else {
        // Anche quando skipStateUpdate è true, aggiorniamo i ref per la paginazione
        nextPaginationKeyRef.current = data.pagination_key
        hasMoreRef.current = data.hasMore
      }
      
      return filteredCalls
    } catch (error) {
      console.error('Error loading Retell calls:', error)
      setError(error instanceof Error ? error.message : 'Failed to load calls')
      if (!skipStateUpdate && reset) {
        setCalls([])
        setHasMore(false)
      }
      return []
    } finally {
      if (!skipStateUpdate) {
        setDataLoading(false)
        setIsLoadingMore(false)
      }
    }
  }, [user, hasRetellToken, debouncedSearch, filters, getValidSession])

  const loadElevenLabsCalls = useCallback(async (reset: boolean = false, skipStateUpdate: boolean = false): Promise<UnifiedAICall[] | void> => {
    if (!user || !hasElevenLabsToken) return

    try {
      if (!skipStateUpdate) {
        if (reset) {
          setDataLoading(true)
          setCalls([])
          setNextCursor(undefined)
          setHasMore(true)
        } else {
          if (!hasMoreRef.current || !nextCursorRef.current) {
            setHasMore(false)
            return []
          }
          setIsLoadingMore(true)
        }
      }
      setError(null)

      const session = await getValidSession()
      const token = session?.access_token
      if (!token) throw new Error('No access token available')

      const cursorToUse = reset ? undefined : nextCursorRef.current

      // Filter out Retell-specific filters and 'cost' from sortBy (ElevenLabs doesn't support it)
      const elevenLabsSortBy = filters.sortBy === 'cost' ? 'date' : filters.sortBy
      const elevenLabsSortByValidated: 'date' | 'duration' | 'messages' = 
        elevenLabsSortBy === 'duration' || elevenLabsSortBy === 'messages' 
          ? elevenLabsSortBy 
          : 'date'

      const response = await getConversationsFromAPI(token, {
        cursor: cursorToUse,
        pageSize: 100,
        search: debouncedSearch,
        dateFrom: filters.dateRange.from || undefined,
        dateTo: filters.dateRange.to || undefined,
        outcome: filters.outcome,
        agentId: filters.agentId,
        direction: filters.direction,
        minRating: filters.minRating,
        minDuration: filters.minDuration,
        maxDuration: filters.maxDuration,
        sortBy: elevenLabsSortByValidated,
        sortOrder: filters.sortOrder
      })

      const normalizedCalls = response.conversations.map(normalizeElevenLabsCall)

      if (!skipStateUpdate) {
        if (reset) {
          setCalls(normalizedCalls)
        } else {
          setCalls(prev => [...prev, ...normalizedCalls])
        }

        setNextCursor(response.cursor)
        setHasMore(response.hasMore)
      } else {
        // Anche quando skipStateUpdate è true, aggiorniamo i ref per la paginazione
        nextCursorRef.current = response.cursor
        hasMoreRef.current = response.hasMore
      }
      
      return normalizedCalls
    } catch (error) {
      console.error('Error loading ElevenLabs calls:', error)
      setError(error instanceof Error ? error.message : 'Failed to load calls')
      if (!skipStateUpdate && reset) {
        setCalls([])
        setHasMore(false)
      }
      return []
    } finally {
      if (!skipStateUpdate) {
        setDataLoading(false)
        setIsLoadingMore(false)
      }
    }
  }, [user, hasElevenLabsToken, debouncedSearch, filters, getValidSession])

  const loadCalls = useCallback(async (reset: boolean = false) => {
    if (!user) return
    if (!hasElevenLabsToken && !hasRetellToken) return

    if (provider === 'elevenlabs' && hasElevenLabsToken) {
      await loadElevenLabsCalls(reset)
    } else if (provider === 'retell' && hasRetellToken) {
      await loadRetellCalls(reset)
    } else if (provider === 'all') {
      // Load both providers in parallel
      if (reset) {
        setDataLoading(true)
        setCalls([])
        setError(null)
      }
      
      const promises: Promise<UnifiedAICall[] | void>[] = []
      
      if (hasElevenLabsToken) {
        promises.push(loadElevenLabsCalls(reset, true)) // skipStateUpdate = true
      }
      
      if (hasRetellToken) {
        promises.push(loadRetellCalls(reset, true)) // skipStateUpdate = true
      }
      
      const results = await Promise.all(promises)
      
      // Extract calls from results
      const allCalls: UnifiedAICall[] = []
      results.forEach(result => {
        if (result && Array.isArray(result)) {
          allCalls.push(...result)
        }
      })
      
      // Sort merged calls based on sortBy and sortOrder
      allCalls.sort((a, b) => {
        let aVal: number
        let bVal: number
        
        if (filters.sortBy === 'duration') {
          aVal = a.duration_secs || 0
          bVal = b.duration_secs || 0
        } else if (filters.sortBy === 'messages') {
          aVal = a.message_count || 0
          bVal = b.message_count || 0
        } else if (filters.sortBy === 'cost') {
          aVal = getUnifiedCost(a) || 0
          bVal = getUnifiedCost(b) || 0
        } else {
          // Default to date
          aVal = a.start_time || 0
          bVal = b.start_time || 0
        }
        
        if (filters.sortOrder === 'desc') {
          return bVal - aVal
        }
        return aVal - bVal
      })

      if (reset) {
        setCalls(allCalls)
        setDataLoading(false)
      } else {
        // Quando reset === false, aggiungiamo le nuove chiamate a quelle esistenti
        setCalls(prev => {
          // Evitiamo duplicati usando un Set
          const existingIds = new Set(prev.map(c => c.id))
          const newCalls = allCalls.filter(c => !existingIds.has(c.id))
          const merged = [...prev, ...newCalls]
          
          // Riordiniamo dopo il merge
          merged.sort((a, b) => {
            let aVal: number
            let bVal: number
            
            if (filters.sortBy === 'duration') {
              aVal = a.duration_secs || 0
              bVal = b.duration_secs || 0
            } else if (filters.sortBy === 'messages') {
              aVal = a.message_count || 0
              bVal = b.message_count || 0
            } else if (filters.sortBy === 'cost') {
              aVal = getUnifiedCost(a) || 0
              bVal = getUnifiedCost(b) || 0
            } else {
              aVal = a.start_time || 0
              bVal = b.start_time || 0
            }
            
            return filters.sortOrder === 'desc' ? bVal - aVal : aVal - bVal
          })
          
          return merged
        })
        setIsLoadingMore(false)
        
        // Aggiorniamo hasMore basandoci sui risultati
        // Se non abbiamo ricevuto chiamate nuove, non c'è più da caricare
        const hasMoreElevenLabs = hasElevenLabsToken && nextCursorRef.current !== undefined
        const hasMoreRetell = hasRetellToken && nextPaginationKeyRef.current !== undefined
        setHasMore(hasMoreElevenLabs || hasMoreRetell)
        
        // Se non ci sono nuove chiamate, non c'è più da caricare
        if (allCalls.length === 0) {
          setHasMore(false)
        }
      }
    }
  }, [user, provider, hasElevenLabsToken, hasRetellToken, loadElevenLabsCalls, loadRetellCalls, filters.sortBy, filters.sortOrder])

  useEffect(() => {
    if (user && (hasElevenLabsToken || hasRetellToken)) {
      // Reset pagination state when filters or provider change
      setNextCursor(undefined)
      setNextPaginationKey(undefined)
      setHasMore(true)
      loadCalls(true)
    }
  }, [user, hasElevenLabsToken, hasRetellToken, provider, debouncedSearch, filters.dateRange, filters.outcome, filters.agentId, filters.direction, filters.callStatus, filters.terminationReason, filters.sentiment, filters.minRating, filters.minDuration, filters.maxDuration, filters.minCost, filters.maxCost, filters.sortBy, filters.sortOrder, loadCalls])

  useEffect(() => {
    // Don't set up observer if we're loading or there's no more data
    if (isLoadingMoreRef.current || isLoadingRef.current || !hasMoreRef.current) {
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        // Use refs to get the latest values (avoid closure issues)
        if (
          entries[0].isIntersecting &&
          hasMoreRef.current &&
          !isLoadingMoreRef.current &&
          !isLoadingRef.current &&
          nextCursorRef.current // Ensure we have a cursor to use
        ) {
          console.log('[IntersectionObserver] Triggering load more with cursor:', nextCursorRef.current)
          loadCalls(false)
        } else {
          console.log('[IntersectionObserver] Not loading - hasMore:', hasMoreRef.current, 'isLoadingMore:', isLoadingMoreRef.current, 'isLoading:', isLoadingRef.current, 'cursor:', nextCursorRef.current)
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
      observer.disconnect()
    }
  }, [hasMore, isLoadingMore, isLoading, loadCalls]) // Keep in deps to re-setup observer when these change

  const updateFilter = useCallback((key: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }, [])

  const clearAllFilters = useCallback(() => {
    setFilters({
      search: '',
      dateRange: { from: null, to: null },
      outcome: '',
      agentId: '',
      direction: '',
      minRating: 0,
      minDuration: 0,
      maxDuration: 0,
      callStatus: '',
      terminationReason: '',
      sentiment: '',
      minCost: 0,
      maxCost: 0,
      sortBy: 'date',
      sortOrder: 'desc'
    })
  }, [])

  const getActiveFiltersCount = useMemo(() => {
    let count = 0
    if (filters.search) count++
    if (filters.dateRange.from || filters.dateRange.to) count++
    if (filters.outcome) count++
    if (filters.agentId) count++
    if (filters.direction) count++
    if (filters.callStatus) count++
    if (filters.terminationReason) count++
    if (filters.sentiment) count++
    if (filters.minRating > 0) count++
    if (filters.minDuration > 0) count++
    if (filters.maxDuration > 0) count++
    if (filters.minCost > 0) count++
    if (filters.maxCost > 0) count++
    return count
  }, [filters])

  const formatDateRange = useCallback((range: DateRange) => {
    if (!range.from && !range.to) return ''
    if (range.from && range.to) {
      return `${range.from.toLocaleDateString('it-IT')} - ${range.to.toLocaleDateString('it-IT')}`
    }
    if (range.from) return `Dal ${range.from.toLocaleDateString('it-IT')}`
    if (range.to) return `Fino al ${range.to.toLocaleDateString('it-IT')}`
    return ''
  }, [])

  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }, [])

  const getOutcomeBadgeColor = useCallback((outcome: string) => {
    switch (outcome) {
      case 'successful':
        return 'bg-green-50 text-green-700 border border-green-200'
      case 'failed':
        return 'bg-red-50 text-red-700 border border-red-200'
      default:
        return 'bg-gray-100 text-gray-600 border border-gray-200'
    }
  }, [])

  const getOutcomeLabel = useCallback((outcome: string) => {
    switch (outcome) {
      case 'successful':
        return 'Successo'
      case 'failed':
        return 'Fallito'
      case 'unknown':
        return 'Sconosciuto'
      default:
        return outcome
    }
  }, [])

  const toggleRowExpansion = useCallback((callId: string) => {
    setExpandedRow(prev => prev === callId ? null : callId)
  }, [])

  const loadAudio = useCallback(async (callId: string) => {
    if (audioUrls[callId] || loadingAudio[callId]) return

    setLoadingAudio(prev => ({ ...prev, [callId]: true }))
    try {
      const session = await getValidSession()
      const token = session?.access_token

      if (!token) {
        console.error('No access token available')
        setError('Session expired. Please refresh the page.')
        return
      }

      const response = await fetch(`/api/elevenlabs/audio/${callId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch audio')
      }

      const audioBlob = await response.blob()
      const url = URL.createObjectURL(audioBlob)
      setAudioUrls(prev => ({ ...prev, [callId]: url }))
    } catch (error) {
      console.error('Error loading audio:', error)
      setError('Failed to load audio. Please try again.')
    } finally {
      setLoadingAudio(prev => ({ ...prev, [callId]: false }))
    }
  }, [audioUrls, loadingAudio, getValidSession])

  const getDirectionBadge = useCallback((direction?: string) => {
    if (!direction) return null

    const isInbound = direction === 'inbound'
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        isInbound
          ? 'bg-[#F0AD4E]/20 text-[#F0AD4E] border border-[#F0AD4E]/30'
          : 'bg-[#F0AD4E]/30 text-[#F0AD4E] border border-[#F0AD4E]/40'
      }`}>
        {isInbound ? '📥 In' : '📤 Out'}
      </span>
    )
  }, [])

  const renderRating = useCallback((rating?: number | null) => {
    if (!rating) return <span className="text-gray-500 text-xs">N/A</span>

    return (
      <div className="flex items-center space-x-1">
        <span className="text-[#F0AD4E]">★</span>
        <span className="text-sm font-medium text-white">{rating.toFixed(1)}</span>
      </div>
    )
  }, [])

  // All hooks must be called before any conditional returns
  const activeFiltersCount = getActiveFiltersCount
  const successfulCalls = calls.filter(c => getUnifiedCallSuccess(c)).length
  const successRate = calls.length > 0 ? Math.round((successfulCalls / calls.length) * 100) : 0
  
  // Get unique termination reasons for filter
  const terminationReasons = useMemo(() => {
    const reasons = new Set<string>()
    calls.forEach(call => {
      const reason = getUnifiedTerminationReason(call)
      if (reason && reason !== 'unknown') reasons.add(reason)
    })
    return Array.from(reasons).sort()
  }, [calls])
  
  // Get unique sentiments for filter
  const sentiments = useMemo(() => {
    const sentSet = new Set<string>()
    calls.forEach(call => {
      const sentiment = getUnifiedSentiment(call)
      if (sentiment) sentSet.add(sentiment)
    })
    return Array.from(sentSet).sort()
  }, [calls])
  
  // Get unique call statuses for filter
  const callStatuses = useMemo(() => {
    const statusSet = new Set<string>()
    calls.forEach(call => {
      const status = getUnifiedCallStatus(call)
      if (status) statusSet.add(status)
    })
    return Array.from(statusSet).sort()
  }, [calls])
  
  // Get unique agents for filter
  const agents = useMemo(() => {
    const agentMap = new Map<string, { id: string; name?: string }>()
    calls.forEach(call => {
      if (call.agent_id && !agentMap.has(call.agent_id)) {
        agentMap.set(call.agent_id, {
          id: call.agent_id,
          name: call.agent_name
        })
      }
    })
    return Array.from(agentMap.values()).sort((a, b) => {
      const nameA = a.name || a.id
      const nameB = b.name || b.id
      return nameA.localeCompare(nameB)
    })
  }, [calls])
  
  const totalCost = useMemo(() => {
    return calls.reduce((sum, call) => {
      const cost = getUnifiedCost(call)
      return sum + (cost || 0)
    }, 0)
  }, [calls])
  
  const averageCost = useMemo(() => {
    const callsWithCost = calls.filter(c => getUnifiedCost(c) && getUnifiedCost(c)! > 0)
    if (callsWithCost.length === 0) return 0
    return totalCost / callsWithCost.length
  }, [calls, totalCost])

  if (isLoading && !user) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-[#3A3D42] rounded-lg loading"></div>
          <div className="h-8 bg-[#3A3D42] rounded w-48 loading"></div>
        </div>
        <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-[#1F2124] rounded loading"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!hasElevenLabsToken && !hasRetellToken) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-[#F0AD4E] rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-[#1e293b] text-xl">📞</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Chiamate IA</h1>
            <p className="text-gray-300 mt-1">Gestione chiamate ElevenLabs / Retell AI</p>
          </div>
        </div>

        <div className="bg-[#3A3D42] rounded-xl p-12 text-center shadow-sm border border-[#1F2124]">
          <div className="w-16 h-16 bg-[#F0AD4E]/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-[#F0AD4E] text-2xl">📞</span>
          </div>
          <h3 className="text-lg font-medium text-white mb-2">
            Servizio non configurato
          </h3>
          <p className="text-gray-300 mb-6">
            Per utilizzare il servizio di chiamate IA, devi prima configurare un token (ElevenLabs o Retell AI) nelle impostazioni.
          </p>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center px-6 py-3 bg-[#F0AD4E] text-[#1e293b] rounded-lg font-medium hover:bg-[#E09A3D] transition-colors shadow-md"
          >
            Vai alle Impostazioni
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-[#3A3D42] rounded-xl p-6 shadow-lg border border-[#1F2124]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-[#F0AD4E] rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-[#1e293b] text-xl">📞</span>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Chiamate IA</h1>
              <p className="text-gray-300 mt-1">
                {calls.length} chiamate caricate
                {activeFiltersCount > 0 && (
                  <span className="text-[#F0AD4E] font-medium"> • {activeFiltersCount} filtri attivi</span>
                )}
              </p>
            </div>
          </div>
          
          {(hasElevenLabsToken || hasRetellToken) && (
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-300">Provider:</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
                className="px-4 py-2 bg-[#1F2124] border border-[#1F2124] rounded-lg text-white text-sm font-medium focus:ring-2 focus:ring-[#F0AD4E] focus:border-[#F0AD4E]"
              >
                {hasElevenLabsToken && hasRetellToken && <option value="all">Tutti</option>}
                {hasElevenLabsToken && <option value="elevenlabs">ElevenLabs</option>}
                {hasRetellToken && <option value="retell">Retell AI</option>}
              </select>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-red-400 text-lg">⚠️</span>
                <p className="text-sm font-semibold text-red-400">Errore nel caricamento</p>
              </div>
              <p className="text-sm text-red-300 mb-3">{error}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    setError(null)
                    loadCalls(true)
                  }}
                  className="px-4 py-2 bg-[#F0AD4E] text-[#1e293b] rounded-lg text-sm font-medium hover:bg-[#E09A3D] transition-colors shadow-md"
                >
                  Riprova
                </button>
                <button
                  onClick={() => setError(null)}
                  className="px-4 py-2 bg-[#1F2124] text-gray-300 rounded-lg text-sm font-medium hover:bg-[#2C2E31] transition-colors"
                >
                  Chiudi
                </button>
              </div>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-300 ml-4"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="bg-gradient-to-br from-[#3A3D42] to-[#2C2E31] rounded-xl p-6 shadow-lg border border-[#1F2124] hover:border-[#F0AD4E]/20 transition-all duration-300">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#1F2124]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F0AD4E]/10 rounded-lg flex items-center justify-center border border-[#F0AD4E]/20">
              <svg className="w-5 h-5 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Filtri e Ricerca</h3>
              <p className="text-xs text-gray-400 mt-0.5">Trova le chiamate che stai cercando</p>
            </div>
          </div>
          {activeFiltersCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:text-[#F0AD4E] font-medium rounded-lg hover:bg-[#1F2124] transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancella tutti
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
          <div className="lg:col-span-2">
            <label htmlFor="search" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
              <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Ricerca
            </label>
            <div className="relative">
              <input
                id="search"
                type="text"
                placeholder="Cerca per agent, titolo, summary..."
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white placeholder-gray-500 shadow-sm hover:shadow-md"
              />
              <svg className="absolute left-3.5 top-3 w-4 h-4 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
              <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Periodo
            </label>
            <DateRangePicker
              value={filters.dateRange}
              onChange={(range) => updateFilter('dateRange', range)}
            />
          </div>

          <div>
            <label htmlFor="outcome" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
              <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Outcome
            </label>
            <select
              id="outcome"
              value={filters.outcome}
              onChange={(e) => updateFilter('outcome', e.target.value)}
              className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white shadow-sm hover:shadow-md"
            >
              <option value="">Tutti gli outcome</option>
              <option value="successful">Successo</option>
              <option value="failed">Fallito</option>
              <option value="unknown">Sconosciuto</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="agentId" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
              <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Agente
            </label>
            <select
              id="agentId"
              value={filters.agentId}
              onChange={(e) => updateFilter('agentId', e.target.value)}
              className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white shadow-sm hover:shadow-md"
            >
              <option value="">Tutti gli agenti</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.name || agent.id.substring(0, 8) + '...'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mt-5 pt-5 border-t border-[#1F2124]">
          {/* Retell-specific filters */}
          {provider === 'retell' || provider === 'all' ? (
            <>
              <div>
                <label htmlFor="callStatus" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
                  <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Stato Chiamata
                </label>
                <select
                  id="callStatus"
                  value={filters.callStatus}
                  onChange={(e) => updateFilter('callStatus', e.target.value)}
                  className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white shadow-sm hover:shadow-md"
                >
                  <option value="">Tutti gli stati</option>
                  {callStatuses.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label htmlFor="terminationReason" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
                  <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Motivo Terminazione
                </label>
                <select
                  id="terminationReason"
                  value={filters.terminationReason}
                  onChange={(e) => updateFilter('terminationReason', e.target.value)}
                  className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white shadow-sm hover:shadow-md"
                >
                  <option value="">Tutti i motivi</option>
                  {terminationReasons.map(reason => (
                    <option key={reason} value={reason}>{reason.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label htmlFor="sentiment" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
                  <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Sentiment
                </label>
                <select
                  id="sentiment"
                  value={filters.sentiment}
                  onChange={(e) => updateFilter('sentiment', e.target.value)}
                  className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white shadow-sm hover:shadow-md"
                >
                  <option value="">Tutti i sentiment</option>
                  {sentiments.map(sent => (
                    <option key={sent} value={sent}>{sent}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label htmlFor="minCost" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
                  <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Costo Min {(provider === 'retell' || provider === 'all') ? '($)' : '(€)'}
                </label>
                <input
                  id="minCost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.minCost}
                  onChange={(e) => updateFilter('minCost', parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white placeholder-gray-500 shadow-sm hover:shadow-md"
                  placeholder="0"
                />
              </div>
              
              <div>
                <label htmlFor="maxCost" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
                  <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Costo Max {(provider === 'retell' || provider === 'all') ? '($)' : '(€)'}
                </label>
                <input
                  id="maxCost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.maxCost}
                  onChange={(e) => updateFilter('maxCost', parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white placeholder-gray-500 shadow-sm hover:shadow-md"
                  placeholder="0"
                />
              </div>
            </>
          ) : null}
          
          <div>
            <label htmlFor="direction" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
              <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Direzione
            </label>
            <select
              id="direction"
              value={filters.direction}
              onChange={(e) => updateFilter('direction', e.target.value)}
              className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white shadow-sm hover:shadow-md"
            >
              <option value="">Tutte le direzioni</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
          </div>

          <div>
            <label htmlFor="minRating" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
              <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              Rating minimo
            </label>
            <input
              id="minRating"
              type="number"
              min="0"
              max="5"
              step="0.1"
              value={filters.minRating}
              onChange={(e) => updateFilter('minRating', parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white placeholder-gray-500 shadow-sm hover:shadow-md"
              placeholder="0"
            />
          </div>
          <div>
            <label htmlFor="minDuration" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
              <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Durata minima (sec)
            </label>
            <input
              id="minDuration"
              type="number"
              min="0"
              value={filters.minDuration}
              onChange={(e) => updateFilter('minDuration', parseInt(e.target.value) || 0)}
              className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white placeholder-gray-500 shadow-sm hover:shadow-md"
              placeholder="0"
            />
          </div>

          <div>
            <label htmlFor="maxDuration" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
              <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Durata massima (sec)
            </label>
            <input
              id="maxDuration"
              type="number"
              min="0"
              value={filters.maxDuration}
              onChange={(e) => updateFilter('maxDuration', parseInt(e.target.value) || 0)}
              className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white placeholder-gray-500 shadow-sm hover:shadow-md"
              placeholder="0"
            />
          </div>

          <div>
            <label htmlFor="sortBy" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
              <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
              Ordina per
            </label>
            <select
              id="sortBy"
              value={filters.sortBy}
              onChange={(e) => updateFilter('sortBy', e.target.value as 'date' | 'duration' | 'messages' | 'cost')}
              className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white shadow-sm hover:shadow-md"
            >
              <option value="date">Data</option>
              <option value="duration">Durata</option>
              <option value="messages">Messaggi</option>
              <option value="cost">Costo</option>
            </select>
          </div>

          <div>
            <label htmlFor="sortOrder" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
              <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              Direzione
            </label>
            <select
              id="sortOrder"
              value={filters.sortOrder}
              onChange={(e) => updateFilter('sortOrder', e.target.value as 'asc' | 'desc')}
              className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white shadow-sm hover:shadow-md"
            >
              <option value="desc">Decrescente</option>
              <option value="asc">Crescente</option>
            </select>
          </div>
        </div>

        {activeFiltersCount > 0 && (
          <div className="mt-6 pt-5 border-t border-[#1F2124]">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <span className="text-sm font-semibold text-gray-300">Filtri attivi ({activeFiltersCount})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {filters.search && (
                <FilterBadge
                  label="Ricerca"
                  value={filters.search}
                  onRemove={() => updateFilter('search', '')}
                />
              )}
              {(filters.dateRange.from || filters.dateRange.to) && (
                <FilterBadge
                  label="Periodo"
                  value={formatDateRange(filters.dateRange)}
                  onRemove={() => updateFilter('dateRange', { from: null, to: null })}
                />
              )}
              {filters.outcome && (
                <FilterBadge
                  label="Outcome"
                  value={getOutcomeLabel(filters.outcome)}
                  onRemove={() => updateFilter('outcome', '')}
                />
              )}
              {filters.agentId && (
                <FilterBadge
                  label="Agente"
                  value={agents.find(a => a.id === filters.agentId)?.name || filters.agentId.substring(0, 8) + '...'}
                  onRemove={() => updateFilter('agentId', '')}
                />
              )}
              {filters.callStatus && (
                <FilterBadge
                  label="Stato"
                  value={filters.callStatus}
                  onRemove={() => updateFilter('callStatus', '')}
                />
              )}
              {filters.terminationReason && (
                <FilterBadge
                  label="Terminazione"
                  value={filters.terminationReason.replace(/_/g, ' ')}
                  onRemove={() => updateFilter('terminationReason', '')}
                />
              )}
              {filters.sentiment && (
                <FilterBadge
                  label="Sentiment"
                  value={filters.sentiment}
                  onRemove={() => updateFilter('sentiment', '')}
                />
              )}
              {filters.direction && (
                <FilterBadge
                  label="Direzione"
                  value={filters.direction === 'inbound' ? 'Inbound' : 'Outbound'}
                  onRemove={() => updateFilter('direction', '')}
                />
              )}
              {filters.minRating > 0 && (
                <FilterBadge
                  label="Rating min"
                  value={`★ ${filters.minRating}`}
                  onRemove={() => updateFilter('minRating', 0)}
                />
              )}
              {filters.minDuration > 0 && (
                <FilterBadge
                  label="Durata min"
                  value={`${filters.minDuration}s`}
                  onRemove={() => updateFilter('minDuration', 0)}
                />
              )}
              {filters.maxDuration > 0 && (
                <FilterBadge
                  label="Durata max"
                  value={`${filters.maxDuration}s`}
                  onRemove={() => updateFilter('maxDuration', 0)}
                />
              )}
              {filters.minCost > 0 && (
                <FilterBadge
                  label="Costo min"
                  value={`${(provider === 'retell' || provider === 'all') ? '$' : '€'}${filters.minCost.toFixed(2)}`}
                  onRemove={() => updateFilter('minCost', 0)}
                />
              )}
              {filters.maxCost > 0 && (
                <FilterBadge
                  label="Costo max"
                  value={`${(provider === 'retell' || provider === 'all') ? '$' : '€'}${filters.maxCost.toFixed(2)}`}
                  onRemove={() => updateFilter('maxCost', 0)}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className={`grid grid-cols-1 md:grid-cols-${hasRetellToken || provider === 'retell' || provider === 'all' ? '5' : '4'} gap-6`}>
        <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">Chiamate Caricate</p>
              <p className="text-2xl font-bold text-white mt-1">{calls.length}</p>
            </div>
            <div className="w-12 h-12 bg-[#F0AD4E]/20 rounded-lg flex items-center justify-center">
              <span className="text-[#F0AD4E] text-xl">📞</span>
            </div>
          </div>
        </div>

        <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">Tasso Successo</p>
              <p className="text-2xl font-bold text-white mt-1">{successRate}%</p>
            </div>
            <div className="w-12 h-12 bg-[#5CB85C]/20 rounded-lg flex items-center justify-center">
              <span className="text-[#5CB85C] text-xl font-bold">✓</span>
            </div>
          </div>
        </div>

        <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">Durata Media</p>
              <p className="text-2xl font-bold text-white mt-1">
                {calls.length > 0
                  ? formatDuration(Math.round(calls.reduce((acc, c) => acc + (c.duration_secs || 0), 0) / calls.length))
                  : '0m 0s'
                }
              </p>
            </div>
            <div className="w-12 h-12 bg-[#F0AD4E]/20 rounded-lg flex items-center justify-center">
              <span className="text-[#F0AD4E] text-xl">⏱️</span>
            </div>
          </div>
        </div>

        <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124] hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">Totale Messaggi</p>
              <p className="text-2xl font-bold text-white mt-1">
                {calls.reduce((acc, c) => acc + (c.message_count || 0), 0).toLocaleString('it-IT')}
              </p>
            </div>
            <div className="w-12 h-12 bg-[#F0AD4E]/20 rounded-lg flex items-center justify-center">
              <span className="text-[#F0AD4E] text-xl">💬</span>
            </div>
          </div>
        </div>
        
        {(hasRetellToken || provider === 'retell' || provider === 'all') && (
          <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124] hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                  Costo Totale {provider === 'retell' || (provider === 'all' && calls.some(c => c.provider === 'retell')) ? '(USD)' : ''}
                </p>
                <p className="text-2xl font-bold text-white mt-1">
                  {(provider === 'retell' || (provider === 'all' && calls.some(c => c.provider === 'retell'))) ? '$' : '€'}{totalCost.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Media: {(provider === 'retell' || (provider === 'all' && calls.some(c => c.provider === 'retell'))) ? '$' : '€'}{averageCost.toFixed(2)}
                </p>
              </div>
              <div className="w-12 h-12 bg-[#F0AD4E]/20 rounded-lg flex items-center justify-center">
                <span className="text-[#F0AD4E] text-xl">💰</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-[#3A3D42] rounded-xl shadow-sm border border-[#1F2124] overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 border-4 border-[#F0AD4E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-300">Caricamento chiamate...</p>
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-[#1F2124] rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-gray-500 text-2xl">📞</span>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              {activeFiltersCount > 0 ? 'Nessun risultato trovato' : 'Nessuna chiamata disponibile'}
            </h3>
            <p className="text-gray-400 mb-4">
              {activeFiltersCount > 0
                ? 'Prova a modificare i filtri di ricerca'
                : 'Non ci sono chiamate disponibili'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-[#1F2124]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Provider & Titolo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Agent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Data e Ora
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Durata
                  </th>
                  {(hasRetellToken || provider === 'retell' || provider === 'all') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Terminazione
                    </th>
                  )}
                  {(hasRetellToken || provider === 'retell' || provider === 'all') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Costo
                    </th>
                  )}
                  {(hasRetellToken || provider === 'retell' || provider === 'all') && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Sentiment
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Direzione
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Rating
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Outcome
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-10">
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[#3A3D42]">
                {calls.map((call) => {
                  const callDate = new Date(call.start_time * 1000)
                  const isExpanded = expandedRow === call.id
                  const terminationReason = getUnifiedTerminationReason(call)
                  const sentiment = getUnifiedSentiment(call)
                  const cost = getUnifiedCost(call)
                  const isRetell = call.provider === 'retell'

                  return (
                    <>
                      <tr
                        key={call.id}
                        className="border-b border-[#1F2124] hover:bg-[#1F2124] transition-colors cursor-pointer"
                        onClick={() => toggleRowExpansion(call.id)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                            {isRetell && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#F0AD4E]/20 text-[#F0AD4E] border border-[#F0AD4E]/30">
                                Retell
                              </span>
                            )}
                            {call.provider === 'elevenlabs' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                ElevenLabs
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-white mb-1 mt-1">
                            {call.call_summary_title || 'Chiamata senza titolo'}
                          </div>
                          <div className="text-xs text-gray-400 line-clamp-2">
                            {call.transcript_summary || 'Nessun summary disponibile'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-white font-medium">
                            {call.agent_name || 'Agent sconosciuto'}
                          </div>
                          <div className="text-xs text-gray-500 font-mono">
                            {call.agent_id.substring(0, 8)}...
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-white">
                            {callDate.toLocaleDateString('it-IT')}
                          </div>
                          <div className="text-sm text-gray-400">
                            {callDate.toLocaleTimeString('it-IT', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-white">
                            {formatDuration(call.duration_secs || 0)}
                          </div>
                        </td>
                        {(hasRetellToken || provider === 'retell' || provider === 'all') && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            {terminationReason && terminationReason !== 'unknown' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F0AD4E]/20 text-[#F0AD4E] border border-[#F0AD4E]/30" title={terminationReason}>
                                {getDisconnectionReasonLabel(terminationReason)}
                              </span>
                            ) : (
                              <span className="text-gray-500 text-xs">-</span>
                            )}
                          </td>
                        )}
                        {(hasRetellToken || provider === 'retell' || provider === 'all') && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            {cost ? (
                              <span className="text-sm text-white font-medium">
                                {isRetell ? '$' : '€'}{cost.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-gray-500 text-xs">-</span>
                            )}
                          </td>
                        )}
                        {(hasRetellToken || provider === 'retell' || provider === 'all') && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            {sentiment ? (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                sentiment.toLowerCase() === 'positive'
                                  ? 'bg-[#5CB85C]/20 text-[#5CB85C] border border-[#5CB85C]/30'
                                  : sentiment.toLowerCase() === 'negative'
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                  : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                              }`}>
                                {sentiment}
                              </span>
                            ) : (
                              <span className="text-gray-500 text-xs">-</span>
                            )}
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getDirectionBadge(call.direction)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {renderRating(call.rating)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            getUnifiedCallSuccess(call)
                              ? 'bg-[#5CB85C]/20 text-[#5CB85C] border border-[#5CB85C]/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}>
                            {getUnifiedCallSuccess(call) ? 'Successo' : 'Fallito'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`text-gray-400 transition-transform duration-200 inline-block ${isExpanded ? 'rotate-180' : ''}`}>
                            ▼
                          </span>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={`${call.id}-expanded`}>
                          <td colSpan={hasRetellToken || provider === 'retell' || provider === 'all' ? 11 : 8} className="px-6 py-6 bg-[#1F2124] border-b border-[#1F2124]">
                            <div className="space-y-4">
                              <div>
                                <h4 className="text-sm font-semibold text-white mb-2">Transcript Summary Completo</h4>
                                <p className="text-sm text-gray-300 leading-relaxed">
                                  {call.transcript_summary || 'Nessun summary disponibile per questa chiamata.'}
                                </p>
                              </div>

                              {/* Retell-specific details */}
                              {isRetell && (
                                <>
                                  {/* Transcript completo per Retell */}
                                  {call.transcript && (
                                    <div>
                                      <h4 className="text-sm font-semibold text-white mb-2">Transcript Completo</h4>
                                      <div className="bg-[#3A3D42] rounded-lg p-4 max-h-96 overflow-y-auto">
                                        <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                                          {call.transcript}
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Dettagli chiamata */}
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                                    {terminationReason && terminationReason !== 'unknown' && (
                                      <div className="bg-[#3A3D42] rounded-lg p-3">
                                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Motivo Terminazione</p>
                                        <p className="text-sm text-white font-medium">{getDisconnectionReasonLabel(terminationReason)}</p>
                                      </div>
                                    )}
                                    {sentiment && (
                                      <div className="bg-[#3A3D42] rounded-lg p-3">
                                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Sentiment</p>
                                        <p className="text-sm text-white font-medium">{sentiment}</p>
                                      </div>
                                    )}
                                    {call.call_analysis?.call_successful !== undefined && (
                                      <div className="bg-[#3A3D42] rounded-lg p-3">
                                        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Esito Chiamata</p>
                                        <p className={`text-sm font-medium ${
                                          call.call_analysis.call_successful 
                                            ? 'text-[#5CB85C]' 
                                            : 'text-red-400'
                                        }`}>
                                          {call.call_analysis.call_successful ? '✓ Successo' : '✗ Fallita'}
                                        </p>
                                      </div>
                                    )}
                                  </div>

                                  {/* Dettagli costo */}
                                  {call.call_cost && (
                                    <div className="bg-[#3A3D42] rounded-lg p-4">
                                      <h4 className="text-sm font-semibold text-white mb-3">Dettagli Costo {isRetell ? '(USD)' : '(EUR)'}</h4>
                                      <div className="space-y-2">
                                        {call.call_cost.product_costs && call.call_cost.product_costs.length > 0 && (
                                          <div>
                                            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Costi per Prodotto</p>
                                            <div className="space-y-1">
                                              {call.call_cost.product_costs.map((product, idx) => {
                                                // Retell: i costi sono in centesimi, convertiamo in dollari
                                                const productCost = isRetell ? product.cost / 100 : product.cost
                                                const unitPrice = isRetell ? product.unit_price / 100 : product.unit_price
                                                const currency = isRetell ? '$' : '€'
                                                
                                                return (
                                                  <div key={idx} className="flex justify-between text-sm">
                                                    <span className="text-gray-300">{product.product}</span>
                                                    <span className="text-white font-medium">
                                                      {currency}{productCost.toFixed(4)} 
                                                      {unitPrice && ` (${currency}${unitPrice.toFixed(4)}/unità)`}
                                                    </span>
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          </div>
                                        )}
                                        {call.call_cost.total_duration_seconds && call.call_cost.total_duration_unit_price && (
                                          <div className="flex justify-between text-sm pt-2 border-t border-[#1F2124]">
                                            <span className="text-gray-300">
                                              Durata ({call.call_cost.total_duration_seconds}s)
                                            </span>
                                            <span className="text-white font-medium">
                                              {(() => {
                                                // Retell: i costi sono in centesimi, convertiamo in dollari
                                                const durationCost = isRetell 
                                                  ? (call.call_cost.total_duration_seconds * call.call_cost.total_duration_unit_price) / 100
                                                  : call.call_cost.total_duration_seconds * call.call_cost.total_duration_unit_price
                                                const currency = isRetell ? '$' : '€'
                                                return `${currency}${durationCost.toFixed(4)}`
                                              })()}
                                            </span>
                                          </div>
                                        )}
                                        {cost && (
                                          <div className="flex justify-between text-sm pt-2 border-t border-[#1F2124] font-semibold">
                                            <span className="text-white">Costo Totale</span>
                                            <span className="text-[#F0AD4E] text-lg">
                                              {isRetell ? '$' : '€'}{cost.toFixed(2)}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  {/* Analisi completa */}
                                  {call.call_analysis && (
                                    <div className="bg-[#3A3D42] rounded-lg p-4">
                                      <h4 className="text-sm font-semibold text-white mb-3">Analisi Chiamata</h4>
                                      <div className="space-y-2 text-sm">
                                        {call.call_analysis.call_summary && (
                                          <div>
                                            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Riassunto</p>
                                            <p className="text-gray-300 leading-relaxed">{call.call_analysis.call_summary}</p>
                                          </div>
                                        )}
                                        {call.call_analysis.in_voicemail !== undefined && (
                                          <div className="flex items-center space-x-2">
                                            <span className="text-xs text-gray-400 uppercase tracking-wide">Segreteria:</span>
                                            <span className={`text-sm font-medium ${
                                              call.call_analysis.in_voicemail ? 'text-[#F0AD4E]' : 'text-gray-300'
                                            }`}>
                                              {call.call_analysis.in_voicemail ? 'Sì' : 'No'}
                                            </span>
                                          </div>
                                        )}
                                        {call.call_analysis.custom_analysis_data && Object.keys(call.call_analysis.custom_analysis_data).length > 0 && (
                                          <div>
                                            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Dati Personalizzati</p>
                                            <pre className="text-xs text-gray-300 bg-[#1F2124] p-2 rounded overflow-x-auto">
                                              {JSON.stringify(call.call_analysis.custom_analysis_data, null, 2)}
                                            </pre>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}

                              <div className="flex flex-wrap gap-3 pt-2">
                                {/* Audio player per Retell (inline) */}
                                {isRetell && call.recording_url && (
                                  <div className="w-full">
                                    <h4 className="text-sm font-semibold text-white mb-2">Registrazione Audio</h4>
                                    <audio
                                      controls
                                      className="w-full max-w-2xl"
                                      src={call.recording_url}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Il tuo browser non supporta l&apos;elemento audio.
                                    </audio>
                                    <a
                                      href={call.recording_url}
                                      download
                                      onClick={(e) => e.stopPropagation()}
                                      className="mt-2 inline-flex items-center text-xs text-gray-400 hover:text-[#F0AD4E] transition-colors"
                                    >
                                      <span>⬇️</span>
                                      <span className="ml-1">Scarica registrazione</span>
                                    </a>
                                  </div>
                                )}
                                
                                {/* Audio per ElevenLabs */}
                                {call.provider === 'elevenlabs' && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        loadAudio(call.id)
                                      }}
                                      disabled={loadingAudio[call.id]}
                                      className="px-4 py-2 bg-[#F0AD4E] text-[#1e293b] rounded-lg text-sm font-medium hover:bg-[#E09A3D] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 shadow-md"
                                    >
                                      <span>🔊</span>
                                      <span>{loadingAudio[call.id] ? 'Caricamento...' : 'Ascolta Audio'}</span>
                                    </button>

                                    <Link
                                      href={`/dashboard/ai-calls/${call.id}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="px-4 py-2 bg-[#1F2124] text-white rounded-lg text-sm font-medium hover:bg-[#2C2E31] transition-colors flex items-center space-x-2"
                                    >
                                      <span>📄</span>
                                      <span>Transcript Completo</span>
                                    </Link>
                                  </>
                                )}

                                {/* Copia transcript o summary */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const textToCopy = isRetell && call.transcript 
                                      ? call.transcript 
                                      : call.transcript_summary || ''
                                    if (textToCopy) {
                                      navigator.clipboard.writeText(textToCopy)
                                    }
                                  }}
                                  className="px-4 py-2 bg-[#3A3D42] text-gray-300 rounded-lg text-sm font-medium hover:bg-[#2C2E31] transition-colors flex items-center space-x-2"
                                >
                                  <span>📋</span>
                                  <span>{isRetell && call.transcript ? 'Copia Transcript' : 'Copia Summary'}</span>
                                </button>
                              </div>

                              {/* Audio player per ElevenLabs (dopo caricamento) */}
                              {call.provider === 'elevenlabs' && audioUrls[call.id] && (
                                <div className="pt-3">
                                  <audio
                                    controls
                                    className="w-full max-w-2xl"
                                    src={audioUrls[call.id]}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Il tuo browser non supporta l&apos;elemento audio.
                                  </audio>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && calls.length > 0 && (
          <div className="py-8 text-center border-t border-[#1F2124]">
            {hasMore ? (
              <div ref={observerTarget}>
                {isLoadingMore ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-5 h-5 border-2 border-[#F0AD4E] border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-sm text-gray-300">Caricamento altre chiamate...</p>
                  </div>
                ) : (
                  <button
                    onClick={() => loadCalls(false)}
                    className="px-6 py-2 bg-[#F0AD4E] text-[#1e293b] rounded-lg font-medium hover:bg-[#E09A3D] transition-colors shadow-md"
                  >
                    Carica altre chiamate
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-2">
                <div className="w-12 h-12 bg-[#5CB85C]/20 rounded-full flex items-center justify-center border border-[#5CB85C]/30">
                  <span className="text-[#5CB85C] text-xl font-bold">✓</span>
                </div>
                <p className="text-sm font-medium text-white">Tutte le chiamate sono state caricate</p>
                <p className="text-xs text-gray-400">{calls.length} chiamate totali visualizzate</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
