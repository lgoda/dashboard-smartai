'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DateRangePicker from '@/app/components/DateRangePicker'
import FilterBadge from '@/app/components/FilterBadge'

type AICall = {
  conversation_id: string
  agent_id: string
  start_time_unix_secs: number
  call_duration_secs: number
  message_count: number
  status: string
  call_successful: string
}

type DateRange = {
  from: Date | null
  to: Date | null
}

type Filters = {
  search: string
  dateRange: DateRange
  outcome: string
  minDuration: number
  maxDuration: number
  sortBy: 'date' | 'duration' | 'messages'
  sortOrder: 'asc' | 'desc'
}

export default function AICallsPage() {
  const [user, setUser] = useState<any>(null)
  const [hasToken, setHasToken] = useState(false)
  const [allCalls, setAllCalls] = useState<AICall[]>([])
  const [filteredCalls, setFilteredCalls] = useState<AICall[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [filters, setFilters] = useState<Filters>({
    search: '',
    dateRange: { from: null, to: null },
    outcome: '',
    minDuration: 0,
    maxDuration: 0,
    sortBy: 'date',
    sortOrder: 'desc'
  })
  const router = useRouter()

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
          await fetchCalls(userData.user)
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

  const fetchCalls = async (currentUser: any) => {
    try {
      setIsRefreshing(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      if (!token) {
        console.error('No access token available')
        return
      }

      const response = await fetch('/api/elevenlabs/conversations?page_size=100', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch calls')
      }

      const data = await response.json()
      setAllCalls(data.conversations || [])
    } catch (error) {
      console.error('Error fetching calls:', error)
    } finally {
      setIsRefreshing(false)
      setIsLoading(false)
    }
  }

  useEffect(() => {
    applyFilters()
  }, [allCalls, filters])

  const applyFilters = () => {
    let filtered = [...allCalls]

    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(call =>
        call.conversation_id.toLowerCase().includes(searchLower) ||
        call.agent_id.toLowerCase().includes(searchLower)
      )
    }

    if (filters.dateRange.from || filters.dateRange.to) {
      filtered = filtered.filter(call => {
        const callDate = new Date(call.start_time_unix_secs * 1000)
        if (filters.dateRange.from && callDate < filters.dateRange.from) return false
        if (filters.dateRange.to && callDate > filters.dateRange.to) return false
        return true
      })
    }

    if (filters.outcome) {
      filtered = filtered.filter(call => call.call_successful === filters.outcome)
    }

    if (filters.minDuration > 0) {
      filtered = filtered.filter(call => call.call_duration_secs >= filters.minDuration)
    }

    if (filters.maxDuration > 0) {
      filtered = filtered.filter(call => call.call_duration_secs <= filters.maxDuration)
    }

    filtered.sort((a, b) => {
      let aValue: number
      let bValue: number

      switch (filters.sortBy) {
        case 'duration':
          aValue = a.call_duration_secs
          bValue = b.call_duration_secs
          break
        case 'messages':
          aValue = a.message_count
          bValue = b.message_count
          break
        case 'date':
        default:
          aValue = a.start_time_unix_secs
          bValue = b.start_time_unix_secs
          break
      }

      if (aValue < bValue) return filters.sortOrder === 'asc' ? -1 : 1
      if (aValue > bValue) return filters.sortOrder === 'asc' ? 1 : -1
      return 0
    })

    setFilteredCalls(filtered)
  }

  const updateFilter = (key: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const clearAllFilters = () => {
    setFilters({
      search: '',
      dateRange: { from: null, to: null },
      outcome: '',
      minDuration: 0,
      maxDuration: 0,
      sortBy: 'date',
      sortOrder: 'desc'
    })
  }

  const handleRefresh = async () => {
    if (user) {
      await fetchCalls(user)
    }
  }

  const exportCSV = () => {
    const csv = filteredCalls.map(c => {
      const date = new Date(c.start_time_unix_secs * 1000)
      return `"${c.conversation_id}","${c.agent_id}","${date.toLocaleString('it-IT')}","${c.call_duration_secs}","${c.message_count}","${c.call_successful}","${c.status}"`
    })
    const header = 'ID Conversazione,Agent ID,Data e Ora,Durata (sec),Messaggi,Outcome,Status\n'
    const csvString = header + csv.join('\n')
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ai_calls_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const getActiveFiltersCount = () => {
    let count = 0
    if (filters.search) count++
    if (filters.dateRange.from || filters.dateRange.to) count++
    if (filters.outcome) count++
    if (filters.minDuration > 0) count++
    if (filters.maxDuration > 0) count++
    return count
  }

  const formatDateRange = (range: DateRange) => {
    if (!range.from && !range.to) return ''
    if (range.from && range.to) {
      return `${range.from.toLocaleDateString('it-IT')} - ${range.to.toLocaleDateString('it-IT')}`
    }
    if (range.from) return `Dal ${range.from.toLocaleDateString('it-IT')}`
    if (range.to) return `Fino al ${range.to.toLocaleDateString('it-IT')}`
    return ''
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  const getOutcomeBadgeColor = (outcome: string) => {
    switch (outcome) {
      case 'successful':
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-slate-100 text-slate-800'
    }
  }

  const getOutcomeLabel = (outcome: string) => {
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
  }

  if (isLoading) {
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

  const activeFiltersCount = getActiveFiltersCount()
  const totalDuration = allCalls.reduce((acc, call) => acc + call.call_duration_secs, 0)
  const successfulCalls = filteredCalls.filter(c => c.call_successful === 'successful').length
  const successRate = filteredCalls.length > 0 ? Math.round((successfulCalls / filteredCalls.length) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
            <span className="text-white text-lg">📞</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Chiamate IA</h1>
            <p className="text-slate-600 mt-1">
              {filteredCalls.length} di {allCalls.length} chiamate
              {activeFiltersCount > 0 && (
                <span className="text-blue-600 font-medium"> • {activeFiltersCount} filtri attivi</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-4 py-2 rounded-lg font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            {isRefreshing ? 'Aggiornamento...' : '🔄 Aggiorna'}
          </button>
          <button
            onClick={exportCSV}
            disabled={filteredCalls.length === 0}
            className="btn-primary text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 shadow-lg hover:shadow-xl transition-shadow"
          >
            <span>📥</span>
            <span>Esporta CSV ({filteredCalls.length})</span>
          </button>
        </div>
      </div>

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
                placeholder="Cerca per ID conversazione o agent..."
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              <option value="">Tutti gli outcome</option>
              <option value="successful">Successo</option>
              <option value="failed">Fallito</option>
              <option value="unknown">Sconosciuto</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Chiamate Totali</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{filteredCalls.length}</p>
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
                {filteredCalls.length > 0
                  ? formatDuration(Math.round(filteredCalls.reduce((acc, c) => acc + c.call_duration_secs, 0) / filteredCalls.length))
                  : '0m 0s'
                }
              </p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-purple-600">⏱️</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Totale Messaggi</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {filteredCalls.reduce((acc, c) => acc + c.message_count, 0)}
              </p>
            </div>
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <span className="text-amber-600">💬</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {filteredCalls.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-slate-400 text-2xl">📞</span>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {activeFiltersCount > 0 ? 'Nessun risultato trovato' : 'Nessuna chiamata ancora'}
            </h3>
            <p className="text-slate-600">
              {activeFiltersCount > 0
                ? 'Prova a modificare i filtri di ricerca'
                : 'Le chiamate IA appariranno qui'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    ID Conversazione
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Data e Ora
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Durata
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Messaggi
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Outcome
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredCalls.map((call) => {
                  const callDate = new Date(call.start_time_unix_secs * 1000)
                  return (
                    <tr key={call.conversation_id} className="table-row">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-slate-900 font-mono">
                          {call.conversation_id.substring(0, 8)}...
                        </div>
                        <div className="text-xs text-slate-500">
                          Agent: {call.agent_id.substring(0, 8)}...
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
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          {call.message_count}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getOutcomeBadgeColor(call.call_successful)}`}>
                          {getOutcomeLabel(call.call_successful)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link
                          href={`/dashboard/ai-calls/${call.conversation_id}`}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Dettagli →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
