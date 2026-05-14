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
  const [filtersOpen, setFiltersOpen] = useState(false)
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
          ? 'bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30'
          : 'bg-[#F59E0B]/30 text-[#F59E0B] border border-[#F59E0B]/40'
      }`}>
        {isInbound ? '📥 In' : '📤 Out'}
      </span>
    )
  }, [])

  const renderRating = useCallback((rating?: number | null) => {
    if (!rating) return <span className="text-gray-500 text-xs">N/A</span>

    return (
      <div className="flex items-center space-x-1">
        <span className="text-[#F59E0B]">★</span>
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
          <div className="w-8 h-8 bg-[#222428] rounded-lg loading"></div>
          <div className="h-8 bg-[#222428] rounded w-48 loading"></div>
        </div>
        <div className="bg-[#222428] rounded-xl p-6 shadow-sm border border-[#141517]">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-[#141517] rounded loading"></div>
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
          <div className="w-12 h-12 bg-[#F59E0B] rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-[#1e293b] text-xl">📞</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Chiamate IA</h1>
            <p className="text-gray-300 mt-1">Gestione chiamate ElevenLabs / Retell AI</p>
          </div>
        </div>

        <div className="bg-[#222428] rounded-xl p-12 text-center shadow-sm border border-[#141517]">
          <div className="w-16 h-16 bg-[#F59E0B]/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-[#F59E0B] text-2xl">📞</span>
          </div>
          <h3 className="text-lg font-medium text-white mb-2">
            Servizio non configurato
          </h3>
          <p className="text-gray-300 mb-6">
            Per utilizzare il servizio di chiamate IA, devi prima configurare un token (ElevenLabs o Retell AI) nelle impostazioni.
          </p>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center px-6 py-3 bg-[#F59E0B] text-[#1e293b] rounded-lg font-medium hover:bg-[#D97706] transition-colors shadow-md"
          >
            Vai alle Impostazioni
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#F59E0B] rounded-xl flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-[#1e293b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Chiamate IA</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {calls.length} chiamate
              {activeFiltersCount > 0 && <span className="text-[#F59E0B]"> · {activeFiltersCount} filtri attivi</span>}
            </p>
          </div>
        </div>

        {(hasElevenLabsToken || hasRetellToken) && hasElevenLabsToken && hasRetellToken && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Provider:</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="px-3 py-1.5 bg-[#222428] border border-[#141517] rounded-lg text-white text-sm focus:ring-2 focus:ring-[#F59E0B]/50 focus:border-[#F59E0B]"
            >
              <option value="all">Tutti</option>
              {hasElevenLabsToken && <option value="elevenlabs">ElevenLabs</option>}
              {hasRetellToken && <option value="retell">Retell AI</option>}
            </select>
          </div>
        )}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
          <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-red-400 flex-1">{error}</p>
          <button onClick={() => { setError(null); loadCalls(true) }} className="text-xs text-[#F59E0B] hover:underline">Riprova</button>
          <button onClick={() => setError(null)} className="text-gray-500 hover:text-gray-300"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
      )}

      {/* ── Filter bar (sempre visibile) ── */}
      <div className="bg-[#222428] rounded-xl border border-[#141517] overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Cerca agent, titolo..."
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#F59E0B] transition-colors"
            />
          </div>

          {/* DateRangePicker */}
          <div className="shrink-0">
            <DateRangePicker value={filters.dateRange} onChange={(range) => updateFilter('dateRange', range)} />
          </div>

          {/* Filtri avanzati toggle */}
          <button
            onClick={() => setFiltersOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
              filtersOpen || activeFiltersCount > 0
                ? 'bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30'
                : 'bg-[#141517] text-gray-300 border border-[#141517] hover:text-white'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Filtri
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#F59E0B] text-[#1e293b] text-[10px] font-bold flex items-center justify-center">{activeFiltersCount}</span>
            )}
            <svg className={`w-3 h-3 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Sort */}
          <select
            value={filters.sortBy}
            onChange={(e) => updateFilter('sortBy', e.target.value as 'date' | 'duration' | 'messages' | 'cost')}
            className="shrink-0 px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-sm text-white focus:outline-none focus:border-[#F59E0B] transition-colors"
          >
            <option value="date">↓ Data</option>
            <option value="duration">↓ Durata</option>
            <option value="messages">↓ Messaggi</option>
            <option value="cost">↓ Costo</option>
          </select>
          <select
            value={filters.sortOrder}
            onChange={(e) => updateFilter('sortOrder', e.target.value as 'asc' | 'desc')}
            className="shrink-0 px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-sm text-white focus:outline-none focus:border-[#F59E0B] transition-colors"
          >
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>

          {activeFiltersCount > 0 && (
            <button onClick={clearAllFilters} className="shrink-0 text-xs text-gray-400 hover:text-red-400 transition-colors px-2">
              Cancella tutti
            </button>
          )}
        </div>

        {/* Active filter chips */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-3">
            {filters.search && <FilterBadge label="Ricerca" value={filters.search} onRemove={() => updateFilter('search', '')} />}
            {(filters.dateRange.from || filters.dateRange.to) && <FilterBadge label="Periodo" value={formatDateRange(filters.dateRange)} onRemove={() => updateFilter('dateRange', { from: null, to: null })} />}
            {filters.outcome && <FilterBadge label="Outcome" value={getOutcomeLabel(filters.outcome)} onRemove={() => updateFilter('outcome', '')} />}
            {filters.agentId && <FilterBadge label="Agente" value={agents.find(a => a.id === filters.agentId)?.name || filters.agentId.substring(0, 8) + '...'} onRemove={() => updateFilter('agentId', '')} />}
            {filters.callStatus && <FilterBadge label="Stato" value={filters.callStatus} onRemove={() => updateFilter('callStatus', '')} />}
            {filters.terminationReason && <FilterBadge label="Terminazione" value={filters.terminationReason.replace(/_/g, ' ')} onRemove={() => updateFilter('terminationReason', '')} />}
            {filters.sentiment && <FilterBadge label="Sentiment" value={filters.sentiment} onRemove={() => updateFilter('sentiment', '')} />}
            {filters.direction && <FilterBadge label="Direzione" value={filters.direction === 'inbound' ? 'Inbound' : 'Outbound'} onRemove={() => updateFilter('direction', '')} />}
            {filters.minRating > 0 && <FilterBadge label="Rating min" value={`★ ${filters.minRating}`} onRemove={() => updateFilter('minRating', 0)} />}
            {filters.minDuration > 0 && <FilterBadge label="Durata min" value={`${filters.minDuration}s`} onRemove={() => updateFilter('minDuration', 0)} />}
            {filters.maxDuration > 0 && <FilterBadge label="Durata max" value={`${filters.maxDuration}s`} onRemove={() => updateFilter('maxDuration', 0)} />}
            {filters.minCost > 0 && <FilterBadge label="Costo min" value={`${(provider === 'retell' || provider === 'all') ? '$' : '€'}${filters.minCost.toFixed(2)}`} onRemove={() => updateFilter('minCost', 0)} />}
            {filters.maxCost > 0 && <FilterBadge label="Costo max" value={`${(provider === 'retell' || provider === 'all') ? '$' : '€'}${filters.maxCost.toFixed(2)}`} onRemove={() => updateFilter('maxCost', 0)} />}
          </div>
        )}

        {/* ── Pannello filtri avanzati (collassabile) ── */}
        {filtersOpen && (
          <div className="border-t border-[#141517] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Outcome */}
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 block">Outcome</label>
              <select value={filters.outcome} onChange={(e) => updateFilter('outcome', e.target.value)} className="w-full px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-sm text-white focus:outline-none focus:border-[#F59E0B]">
                <option value="">Tutti</option>
                <option value="successful">Successo</option>
                <option value="failed">Fallito</option>
                <option value="unknown">Sconosciuto</option>
              </select>
            </div>
            {/* Agente */}
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 block">Agente</label>
              <select value={filters.agentId} onChange={(e) => updateFilter('agentId', e.target.value)} className="w-full px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-sm text-white focus:outline-none focus:border-[#F59E0B]">
                <option value="">Tutti</option>
                {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name || agent.id.substring(0, 8) + '...'}</option>)}
              </select>
            </div>
            {/* Direzione */}
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 block">Direzione</label>
              <select value={filters.direction} onChange={(e) => updateFilter('direction', e.target.value)} className="w-full px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-sm text-white focus:outline-none focus:border-[#F59E0B]">
                <option value="">Tutte</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
            </div>
            {/* Rating min */}
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 block">Rating minimo</label>
              <input type="number" min="0" max="5" step="0.1" value={filters.minRating} onChange={(e) => updateFilter('minRating', parseFloat(e.target.value) || 0)} placeholder="0" className="w-full px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-sm text-white focus:outline-none focus:border-[#F59E0B]" />
            </div>
            {/* Durata min/max */}
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 block">Durata min (sec)</label>
              <input type="number" min="0" value={filters.minDuration} onChange={(e) => updateFilter('minDuration', parseInt(e.target.value) || 0)} placeholder="0" className="w-full px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-sm text-white focus:outline-none focus:border-[#F59E0B]" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 block">Durata max (sec)</label>
              <input type="number" min="0" value={filters.maxDuration} onChange={(e) => updateFilter('maxDuration', parseInt(e.target.value) || 0)} placeholder="0" className="w-full px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-sm text-white focus:outline-none focus:border-[#F59E0B]" />
            </div>
            {/* Retell-specific */}
            {(provider === 'retell' || provider === 'all') && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 block">Stato Chiamata</label>
                  <select value={filters.callStatus} onChange={(e) => updateFilter('callStatus', e.target.value)} className="w-full px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-sm text-white focus:outline-none focus:border-[#F59E0B]">
                    <option value="">Tutti</option>
                    {callStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 block">Terminazione</label>
                  <select value={filters.terminationReason} onChange={(e) => updateFilter('terminationReason', e.target.value)} className="w-full px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-sm text-white focus:outline-none focus:border-[#F59E0B]">
                    <option value="">Tutti</option>
                    {terminationReasons.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 block">Sentiment</label>
                  <select value={filters.sentiment} onChange={(e) => updateFilter('sentiment', e.target.value)} className="w-full px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-sm text-white focus:outline-none focus:border-[#F59E0B]">
                    <option value="">Tutti</option>
                    {sentiments.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 block">Costo min</label>
                    <input type="number" min="0" step="0.01" value={filters.minCost} onChange={(e) => updateFilter('minCost', parseFloat(e.target.value) || 0)} placeholder="0" className="w-full px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-sm text-white focus:outline-none focus:border-[#F59E0B]" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 block">Costo max</label>
                    <input type="number" min="0" step="0.01" value={filters.maxCost} onChange={(e) => updateFilter('maxCost', parseFloat(e.target.value) || 0)} placeholder="0" className="w-full px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-sm text-white focus:outline-none focus:border-[#F59E0B]" />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Stat cards (compatte) ── */}
      <div className={`grid grid-cols-2 ${hasRetellToken || provider === 'retell' || provider === 'all' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3`}>
        {[
          { label: 'Chiamate', value: calls.length, sub: null, color: '#F59E0B' },
          { label: 'Successo', value: `${successRate}%`, sub: `${successfulCalls}/${calls.length}`, color: '#22C55E' },
          { label: 'Durata media', value: calls.length > 0 ? formatDuration(Math.round(calls.reduce((acc, c) => acc + (c.duration_secs || 0), 0) / calls.length)) : '—', sub: null, color: '#F59E0B' },
          { label: 'Messaggi', value: calls.reduce((acc, c) => acc + (c.message_count || 0), 0).toLocaleString('it-IT'), sub: null, color: '#F59E0B' },
        ].map(stat => (
          <div key={stat.label} className="bg-[#222428] rounded-xl px-4 py-3.5 border border-[#141517] flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{stat.label}</p>
              <p className="text-xl font-bold text-white mt-0.5">{stat.value}</p>
              {stat.sub && <p className="text-xs text-gray-500 mt-0.5">{stat.sub}</p>}
            </div>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${stat.color}20` }}>
              <div className="w-2 h-2 rounded-full" style={{ background: stat.color }} />
            </div>
          </div>
        ))}
        {(hasRetellToken || provider === 'retell' || provider === 'all') && (
          <div className="bg-[#222428] rounded-xl px-4 py-3.5 border border-[#141517] flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Costo totale</p>
              <p className="text-xl font-bold text-white mt-0.5">{calls.some(c => c.provider === 'retell') ? '$' : '€'}{totalCost.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-0.5">media {calls.some(c => c.provider === 'retell') ? '$' : '€'}{averageCost.toFixed(2)}</p>
            </div>
            <div className="w-8 h-8 bg-[#F59E0B]/20 rounded-lg flex items-center justify-center shrink-0">
              <div className="w-2 h-2 rounded-full bg-[#F59E0B]" />
            </div>
          </div>
        )}
      </div>

      {/* ── Lista chiamate ── */}
      <div className="bg-[#222428] rounded-xl border border-[#141517] overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-2 border-[#F59E0B] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Caricamento chiamate...</p>
          </div>
        ) : calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 bg-[#141517] rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-white">{activeFiltersCount > 0 ? 'Nessun risultato' : 'Nessuna chiamata disponibile'}</p>
            <p className="text-xs text-gray-500">{activeFiltersCount > 0 ? 'Prova a modificare i filtri' : 'Le chiamate appariranno qui'}</p>
          </div>
        ) : (
          <div className="divide-y divide-[#141517]">
            {calls.map((call) => {
              const callDate = new Date(call.start_time * 1000)
              const isExpanded = expandedRow === call.id
              const terminationReason = getUnifiedTerminationReason(call)
              const sentiment = getUnifiedSentiment(call)
              const cost = getUnifiedCost(call)
              const isRetell = call.provider === 'retell'
              const isSuccess = getUnifiedCallSuccess(call)

              return (
                <div key={call.id}>
                  {/* ── Riga chiamata ── */}
                  <div
                    onClick={() => toggleRowExpansion(call.id)}
                    className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors group ${isExpanded ? 'bg-[#141517]' : 'hover:bg-[#1a1b1e]'}`}
                  >
                    {/* Status dot */}
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isSuccess ? 'bg-[#22C55E]' : 'bg-red-500'}`} />

                    {/* Info sinistra */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Provider badge */}
                        {isRetell ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/25 leading-tight">Retell</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/25 leading-tight">ElevenLabs</span>
                        )}
                        {/* Direction */}
                        {call.direction && (
                          <span className="text-[10px] text-gray-500">
                            {call.direction === 'inbound' ? '↙ In' : '↗ Out'}
                          </span>
                        )}
                        {/* Title */}
                        <span className="text-sm font-semibold text-white truncate">
                          {call.call_summary_title || 'Chiamata senza titolo'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 flex-wrap">
                        <span>{call.agent_name || 'Agent sconosciuto'}</span>
                        <span>·</span>
                        <span>{callDate.toLocaleDateString('it-IT')} {callDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    {/* Badges destra */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {/* Outcome */}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${isSuccess ? 'bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/25' : 'bg-red-500/15 text-red-400 border-red-500/25'}`}>
                        {isSuccess ? 'Successo' : 'Fallito'}
                      </span>
                      {/* Sentiment */}
                      {sentiment && (
                        <span className={`hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          sentiment.toLowerCase() === 'positive' ? 'bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/25'
                          : sentiment.toLowerCase() === 'negative' ? 'bg-red-500/15 text-red-400 border-red-500/25'
                          : 'bg-gray-500/15 text-gray-400 border-gray-500/25'
                        }`}>{sentiment}</span>
                      )}
                      {/* Rating */}
                      {call.rating && (
                        <span className="hidden sm:flex items-center gap-0.5 text-xs text-[#F59E0B]">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                          {call.rating.toFixed(1)}
                        </span>
                      )}
                      {/* Duration */}
                      <span className="text-xs text-gray-400">{formatDuration(call.duration_secs || 0)}</span>
                      {/* Cost */}
                      {cost ? <span className="hidden sm:block text-xs text-gray-400">{isRetell ? '$' : '€'}{cost.toFixed(2)}</span> : null}
                      {/* Chevron */}
                      <svg className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* ── Panel espanso ── */}
                  {isExpanded && (
                    <div className="bg-[#141517] border-t border-[#18191C] px-4 py-5 space-y-4" onClick={(e) => e.stopPropagation()}>

                      {/* Summary */}
                      {call.transcript_summary && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Sommario</p>
                          <p className="text-sm text-gray-300 leading-relaxed">{call.transcript_summary}</p>
                        </div>
                      )}

                      {/* Transcript (Retell) */}
                      {isRetell && call.transcript && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Transcript</p>
                          <div className="bg-[#18191C] rounded-lg p-3 max-h-64 overflow-y-auto">
                            <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{call.transcript}</p>
                          </div>
                        </div>
                      )}

                      {/* Dettagli grid */}
                      {isRetell && (terminationReason || sentiment || call.call_analysis?.call_successful !== undefined) && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {terminationReason && terminationReason !== 'unknown' && (
                            <div className="bg-[#18191C] rounded-lg px-3 py-2">
                              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Terminazione</p>
                              <p className="text-sm text-white font-medium">{getDisconnectionReasonLabel(terminationReason)}</p>
                            </div>
                          )}
                          {sentiment && (
                            <div className="bg-[#18191C] rounded-lg px-3 py-2">
                              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Sentiment</p>
                              <p className="text-sm text-white font-medium">{sentiment}</p>
                            </div>
                          )}
                          {call.call_analysis?.call_successful !== undefined && (
                            <div className="bg-[#18191C] rounded-lg px-3 py-2">
                              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Esito</p>
                              <p className={`text-sm font-medium ${call.call_analysis.call_successful ? 'text-[#22C55E]' : 'text-red-400'}`}>
                                {call.call_analysis.call_successful ? '✓ Successo' : '✗ Fallita'}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Costo breakdown (Retell) */}
                      {isRetell && call.call_cost && cost && (
                        <div className="bg-[#18191C] rounded-lg p-3">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Costo dettagliato (USD)</p>
                          <div className="space-y-1">
                            {call.call_cost.product_costs?.map((product, idx) => {
                              const productCost = isRetell ? product.cost / 100 : product.cost
                              return (
                                <div key={idx} className="flex justify-between text-xs">
                                  <span className="text-gray-400">{product.product}</span>
                                  <span className="text-white">${productCost.toFixed(4)}</span>
                                </div>
                              )
                            })}
                            <div className="flex justify-between text-sm pt-1.5 border-t border-[#141517] font-semibold">
                              <span className="text-gray-300">Totale</span>
                              <span className="text-[#F59E0B]">${cost.toFixed(4)}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Analisi (Retell) */}
                      {isRetell && call.call_analysis?.call_summary && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Analisi AI</p>
                          <p className="text-sm text-gray-300 leading-relaxed">{call.call_analysis.call_summary}</p>
                        </div>
                      )}

                      {/* Audio & azioni */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {isRetell && call.recording_url && (
                          <div className="w-full space-y-2">
                            <audio controls className="w-full max-w-lg" src={call.recording_url}>
                              Il tuo browser non supporta l&apos;elemento audio.
                            </audio>
                            <a href={call.recording_url} download className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#F59E0B] transition-colors">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              Scarica registrazione
                            </a>
                          </div>
                        )}

                        {call.provider === 'elevenlabs' && (
                          <>
                            <button
                              onClick={() => loadAudio(call.id)}
                              disabled={loadingAudio[call.id]}
                              className="flex items-center gap-2 px-3 py-2 bg-[#F59E0B] text-[#1e293b] rounded-lg text-sm font-medium hover:bg-[#D97706] transition-colors disabled:opacity-50"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536a5 5 0 000 7.072" /></svg>
                              {loadingAudio[call.id] ? 'Caricamento...' : 'Ascolta Audio'}
                            </button>
                            <Link href={`/dashboard/ai-calls/${call.id}`} className="flex items-center gap-2 px-3 py-2 bg-[#18191C] text-white rounded-lg text-sm font-medium hover:bg-[#222428] transition-colors">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              Transcript completo
                            </Link>
                          </>
                        )}

                        <button
                          onClick={() => {
                            const text = isRetell && call.transcript ? call.transcript : call.transcript_summary || ''
                            if (text) navigator.clipboard.writeText(text)
                          }}
                          className="flex items-center gap-2 px-3 py-2 bg-[#18191C] text-gray-300 rounded-lg text-sm hover:text-white hover:bg-[#222428] transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          {isRetell && call.transcript ? 'Copia transcript' : 'Copia summary'}
                        </button>
                      </div>

                      {call.provider === 'elevenlabs' && audioUrls[call.id] && (
                        <audio controls className="w-full max-w-lg" src={audioUrls[call.id]}>
                          Il tuo browser non supporta l&apos;elemento audio.
                        </audio>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Load more */}
        {!isLoading && calls.length > 0 && (
          <div className="px-4 py-5 border-t border-[#141517] flex items-center justify-center">
            {hasMore ? (
              <div ref={observerTarget}>
                {isLoadingMore ? (
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <div className="w-4 h-4 border-2 border-[#F59E0B] border-t-transparent rounded-full animate-spin" />
                    Caricamento...
                  </div>
                ) : (
                  <button onClick={() => loadCalls(false)} className="px-5 py-2 bg-[#141517] text-gray-300 rounded-lg text-sm font-medium hover:text-white hover:bg-[#18191C] border border-[#141517] transition-colors">
                    Carica altre chiamate
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-500">{calls.length} chiamate caricate · fine</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
