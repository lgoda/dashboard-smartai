'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DateRangePicker from '@/app/components/DateRangePicker'
import FilterBadge from '@/app/components/FilterBadge'
import { useDebounce } from '@/app/lib/useDebounce'
import { getConversationsFromAPI, AICall } from '@/app/lib/conversationsApi'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

type DateRange = {
  from: Date | null
  to: Date | null
}

type Filters = {
  search: string
  dateRange: DateRange
  outcome: string
  agentId: string
  direction: string
  minRating: number
  minDuration: number
  maxDuration: number
  sortBy: 'date' | 'duration' | 'messages'
  sortOrder: 'asc' | 'desc'
}

export default function AICallsPage() {
  const [user, setUser] = useState<any>(null)
  const [hasToken, setHasToken] = useState(false)
  const [calls, setCalls] = useState<AICall[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
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
    sortBy: 'date',
    sortOrder: 'desc'
  })
  const router = useRouter()
  const observerTarget = useRef<HTMLDivElement>(null)

  const debouncedSearch = useDebounce(filters.search, 500)

  useEffect(() => {
    const checkToken = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData?.user) return router.push('/')
        setUser(userData.user)

        const { data: tokenData } = await supabase
          .from('elevenlabs_tokens')
          .select('is_active')
          .eq('user_id', userData.user.id)
          .maybeSingle()

        if (tokenData?.is_active) {
          setHasToken(true)
        } else {
          setIsLoading(false)
        }
      } catch (error) {
        console.error('Error checking token:', error)
        setIsLoading(false)
      }
    }

    checkToken()
  }, [router])

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

  const loadCalls = useCallback(async (reset: boolean = false) => {
    if (!user || !hasToken) return

    try {
      if (reset) {
        setIsLoading(true)
        setCalls([])
        setNextCursor(undefined)
      } else {
        setIsLoadingMore(true)
      }
      setError(null)

      const session = await getValidSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('No access token available')
      }

      const response = await getConversationsFromAPI(token, {
        cursor: reset ? undefined : nextCursor,
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
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder
      })

      if (reset) {
        setCalls(response.conversations)
      } else {
        setCalls(prev => [...prev, ...response.conversations])
      }

      setNextCursor(response.cursor)
      setHasMore(response.hasMore)

      console.log('[Pagination Debug]', {
        loadedCount: response.conversations.length,
        totalCallsNow: reset ? response.conversations.length : calls.length + response.conversations.length,
        hasMore: response.hasMore,
        cursor: response.cursor,
        reset
      })
    } catch (error) {
      console.error('Error loading calls:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to load calls'
      setError(errorMessage)
      if (reset) {
        setCalls([])
      }
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }, [user, hasToken, nextCursor, debouncedSearch, filters, getValidSession])

  useEffect(() => {
    if (user && hasToken) {
      loadCalls(true)
    }
  }, [user, hasToken, debouncedSearch, filters.dateRange, filters.outcome, filters.agentId, filters.direction, filters.minRating, filters.minDuration, filters.maxDuration, filters.sortBy, filters.sortOrder])

  useEffect(() => {
    if (!hasMore || isLoadingMore || isLoading) {
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          loadCalls(false)
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
  }, [hasMore, isLoadingMore, isLoading, loadCalls])

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
    if (filters.minRating > 0) count++
    if (filters.minDuration > 0) count++
    if (filters.maxDuration > 0) count++
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
        return 'bg-slate-50 text-slate-600 border border-slate-200'
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

  const toggleRowExpansion = useCallback((conversationId: string) => {
    setExpandedRow(prev => prev === conversationId ? null : conversationId)
  }, [])

  const loadAudio = useCallback(async (conversationId: string) => {
    if (audioUrls[conversationId] || loadingAudio[conversationId]) return

    setLoadingAudio(prev => ({ ...prev, [conversationId]: true }))
    try {
      const session = await getValidSession()
      const token = session?.access_token

      if (!token) {
        console.error('No access token available')
        setError('Session expired. Please refresh the page.')
        return
      }

      const response = await fetch(`/api/elevenlabs/audio/${conversationId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch audio')
      }

      const audioBlob = await response.blob()
      const url = URL.createObjectURL(audioBlob)
      setAudioUrls(prev => ({ ...prev, [conversationId]: url }))
    } catch (error) {
      console.error('Error loading audio:', error)
      setError('Failed to load audio. Please try again.')
    } finally {
      setLoadingAudio(prev => ({ ...prev, [conversationId]: false }))
    }
  }, [audioUrls, loadingAudio, getValidSession])

  const getDirectionBadge = useCallback((direction?: string) => {
    if (!direction) return null

    const isInbound = direction === 'inbound'
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        isInbound
          ? 'bg-blue-50 text-blue-700 border border-blue-200'
          : 'bg-amber-50 text-amber-700 border border-amber-200'
      }`}>
        {isInbound ? '📥 In' : '📤 Out'}
      </span>
    )
  }, [])

  const renderRating = useCallback((rating?: number | null) => {
    if (!rating) return <span className="text-slate-400 text-xs">N/A</span>

    return (
      <div className="flex items-center space-x-1">
        <span className="text-yellow-500">★</span>
        <span className="text-sm font-medium text-slate-700">{rating.toFixed(1)}</span>
      </div>
    )
  }, [])

  if (isLoading && !user) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-slate-200 rounded-lg loading"></div>
          <div className="h-8 bg-slate-200 rounded w-48 loading"></div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-100 rounded loading"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!hasToken) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
            <span className="text-white text-lg">📞</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Chiamate IA</h1>
            <p className="text-slate-600 mt-1">Gestione chiamate ElevenLabs</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-slate-200">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-slate-400 text-2xl">📞</span>
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-2">
            Servizio non configurato
          </h3>
          <p className="text-slate-600 mb-6">
            Per utilizzare il servizio di chiamate IA, devi prima configurare il token ElevenLabs nelle impostazioni.
          </p>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Vai alle Impostazioni
          </Link>
        </div>
      </div>
    )
  }

  const activeFiltersCount = getActiveFiltersCount
  const successfulCalls = calls.filter(c => c.call_successful === 'successful').length
  const successRate = calls.length > 0 ? Math.round((successfulCalls / calls.length) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-yellow-500 rounded-xl flex items-center justify-center">
            <span className="text-white text-lg">📞</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Chiamate IA</h1>
            <p className="text-slate-600 mt-1">
              {calls.length} chiamate caricate
              {activeFiltersCount > 0 && (
                <span className="text-blue-600 font-medium"> • {activeFiltersCount} filtri attivi</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-red-600 text-lg">⚠️</span>
                <p className="text-sm font-semibold text-red-900">Errore nel caricamento</p>
              </div>
              <p className="text-sm text-red-800 mb-3">{error}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    setError(null)
                    loadCalls(true)
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Riprova
                </button>
                <button
                  onClick={() => setError(null)}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
                >
                  Chiudi
                </button>
              </div>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 ml-4"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Filtri e Ricerca</h3>
          {activeFiltersCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="text-sm text-slate-500 hover:text-slate-700 font-medium"
            >
              Cancella tutti i filtri
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="lg:col-span-2">
            <label htmlFor="search" className="block text-sm font-medium text-slate-700 mb-2">
              Ricerca
            </label>
            <div className="relative">
              <input
                id="search"
                type="text"
                placeholder="Cerca per agent, titolo, summary..."
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-slate-900 placeholder:text-slate-400"
              />
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Periodo
            </label>
            <DateRangePicker
              value={filters.dateRange}
              onChange={(range) => updateFilter('dateRange', range)}
            />
          </div>

          <div>
            <label htmlFor="outcome" className="block text-sm font-medium text-slate-700 mb-2">
              Outcome
            </label>
            <select
              id="outcome"
              value={filters.outcome}
              onChange={(e) => updateFilter('outcome', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-slate-900"
            >
              <option value="">Tutti gli outcome</option>
              <option value="successful">Successo</option>
              <option value="failed">Fallito</option>
              <option value="unknown">Sconosciuto</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mt-4">
          <div>
            <label htmlFor="direction" className="block text-sm font-medium text-slate-700 mb-2">
              Direzione
            </label>
            <select
              id="direction"
              value={filters.direction}
              onChange={(e) => updateFilter('direction', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-slate-900"
            >
              <option value="">Tutte le direzioni</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
          </div>

          <div>
            <label htmlFor="minRating" className="block text-sm font-medium text-slate-700 mb-2">
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
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-slate-900 placeholder:text-slate-400"
              placeholder="0"
            />
          </div>
          <div>
            <label htmlFor="minDuration" className="block text-sm font-medium text-slate-700 mb-2">
              Durata minima (sec)
            </label>
            <input
              id="minDuration"
              type="number"
              min="0"
              value={filters.minDuration}
              onChange={(e) => updateFilter('minDuration', parseInt(e.target.value) || 0)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-slate-900 placeholder:text-slate-400"
              placeholder="0"
            />
          </div>

          <div>
            <label htmlFor="maxDuration" className="block text-sm font-medium text-slate-700 mb-2">
              Durata massima (sec)
            </label>
            <input
              id="maxDuration"
              type="number"
              min="0"
              value={filters.maxDuration}
              onChange={(e) => updateFilter('maxDuration', parseInt(e.target.value) || 0)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-slate-900 placeholder:text-slate-400"
              placeholder="0"
            />
          </div>

          <div>
            <label htmlFor="sortBy" className="block text-sm font-medium text-slate-700 mb-2">
              Ordina per
            </label>
            <select
              id="sortBy"
              value={filters.sortBy}
              onChange={(e) => updateFilter('sortBy', e.target.value as 'date' | 'duration' | 'messages')}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-slate-900"
            >
              <option value="date">Data</option>
              <option value="duration">Durata</option>
              <option value="messages">Messaggi</option>
            </select>
          </div>

          <div>
            <label htmlFor="sortOrder" className="block text-sm font-medium text-slate-700 mb-2">
              Direzione
            </label>
            <select
              id="sortOrder"
              value={filters.sortOrder}
              onChange={(e) => updateFilter('sortOrder', e.target.value as 'asc' | 'desc')}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-slate-900"
            >
              <option value="desc">Decrescente</option>
              <option value="asc">Crescente</option>
            </select>
          </div>
        </div>

        {activeFiltersCount > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200">
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
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Chiamate Caricate</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{calls.length}</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-green-600">📞</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Tasso Successo</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{successRate}%</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-blue-600">✓</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Durata Media</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {calls.length > 0
                  ? formatDuration(Math.round(calls.reduce((acc, c) => acc + c.call_duration_secs, 0) / calls.length))
                  : '0m 0s'
                }
              </p>
            </div>
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <span className="text-amber-600">⏱️</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Totale Messaggi</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {calls.reduce((acc, c) => acc + c.message_count, 0).toLocaleString('it-IT')}
              </p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-purple-600">💬</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600">Caricamento chiamate...</p>
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-slate-400 text-2xl">📞</span>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {activeFiltersCount > 0 ? 'Nessun risultato trovato' : 'Nessuna chiamata disponibile'}
            </h3>
            <p className="text-slate-600 mb-4">
              {activeFiltersCount > 0
                ? 'Prova a modificare i filtri di ricerca'
                : 'Non ci sono chiamate disponibili'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Titolo & Summary
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Agent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Data e Ora
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Durata
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Direzione
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Rating
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Outcome
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-10">
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {calls.map((call) => {
                  const callDate = new Date(call.start_time_unix_secs * 1000)
                  const isExpanded = expandedRow === call.conversation_id

                  return (
                    <>
                      <tr
                        key={call.conversation_id}
                        className="border-b border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => toggleRowExpansion(call.conversation_id)}
                      >
                        <td className="px-6 py-4">
                          <div className="text-sm font-semibold text-slate-900 mb-1">
                            {call.call_summary_title || 'Chiamata senza titolo'}
                          </div>
                          <div className="text-xs text-slate-600 line-clamp-2">
                            {call.transcript_summary || 'Nessun summary disponibile'}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-slate-900 font-medium">
                            {call.agent_name || 'Agent sconosciuto'}
                          </div>
                          <div className="text-xs text-slate-500 font-mono">
                            {call.agent_id.substring(0, 8)}...
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-900">
                            {callDate.toLocaleDateString('it-IT')}
                          </div>
                          <div className="text-sm text-slate-500">
                            {callDate.toLocaleTimeString('it-IT', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-900">
                            {formatDuration(call.call_duration_secs)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getDirectionBadge(call.direction)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {renderRating(call.rating)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getOutcomeBadgeColor(call.call_successful)}`}>
                            {getOutcomeLabel(call.call_successful)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`text-slate-400 transition-transform duration-200 inline-block ${isExpanded ? 'rotate-180' : ''}`}>
                            ▼
                          </span>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr key={`${call.conversation_id}-expanded`}>
                          <td colSpan={8} className="px-6 py-6 bg-slate-50 border-b border-slate-200">
                            <div className="space-y-4">
                              <div>
                                <h4 className="text-sm font-semibold text-slate-900 mb-2">Transcript Summary Completo</h4>
                                <p className="text-sm text-slate-700 leading-relaxed">
                                  {call.transcript_summary || 'Nessun summary disponibile per questa chiamata.'}
                                </p>
                              </div>

                              <div className="flex flex-wrap gap-3 pt-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    loadAudio(call.conversation_id)
                                  }}
                                  disabled={loadingAudio[call.conversation_id]}
                                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                                >
                                  <span>🔊</span>
                                  <span>{loadingAudio[call.conversation_id] ? 'Caricamento...' : 'Ascolta Audio'}</span>
                                </button>

                                <Link
                                  href={`/dashboard/ai-calls/${call.conversation_id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors flex items-center space-x-2"
                                >
                                  <span>📄</span>
                                  <span>Transcript Completo</span>
                                </Link>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (call.transcript_summary) {
                                      navigator.clipboard.writeText(call.transcript_summary)
                                    }
                                  }}
                                  className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300 transition-colors flex items-center space-x-2"
                                >
                                  <span>📋</span>
                                  <span>Copia Summary</span>
                                </button>
                              </div>

                              {audioUrls[call.conversation_id] && (
                                <div className="pt-3">
                                  <audio
                                    controls
                                    className="w-full max-w-2xl"
                                    src={audioUrls[call.conversation_id]}
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
          <div className="py-8 text-center border-t border-slate-200">
            {hasMore ? (
              <div ref={observerTarget}>
                {isLoadingMore ? (
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-sm text-slate-600">Caricamento altre chiamate...</p>
                  </div>
                ) : (
                  <button
                    onClick={() => loadCalls(false)}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    Carica altre chiamate
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-2">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                  <span className="text-slate-400 text-xl">✓</span>
                </div>
                <p className="text-sm font-medium text-slate-700">Tutte le chiamate sono state caricate</p>
                <p className="text-xs text-slate-500">{calls.length} chiamate totali visualizzate</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
