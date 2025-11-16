'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import DateRangePicker from '@/app/components/DateRangePicker'
import FilterBadge from '@/app/components/FilterBadge'
import Pagination from '@/app/components/Pagination'
import { useDebounce } from '@/app/lib/useDebounce'

export const dynamic = 'force-dynamic'

type Lead = {
  id: string
  name: string
  email: string
  phone: string
  message: string
  source: string
  created_at: string
}

type DateRange = {
  from: Date | null
  to: Date | null
}

type Filters = {
  search: string
  dateRange: DateRange
  source: string
  hasMessage: string
  sortBy: 'date' | 'name' | 'source'
  sortOrder: 'asc' | 'desc'
}

export default function LeadsPage() {
  const [user, setUser] = useState<any>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [sources, setSources] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  const [filters, setFilters] = useState<Filters>({
    search: '',
    dateRange: { from: null, to: null },
    source: '',
    hasMessage: 'all',
    sortBy: 'date',
    sortOrder: 'desc'
  })
  const router = useRouter()

  const debouncedSearch = useDebounce(filters.search, 500)

  useEffect(() => {
    const initUser = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData?.user) return router.push('/')
        setUser(userData.user)
        await loadSources(userData.user.id)
      } catch (error) {
        console.error('Error initializing user:', error)
      }
    }
    initUser()
  }, [router])

  const loadSources = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('leads')
        .select('source')
        .eq('user_id', userId)
        .not('source', 'is', null)

      if (data) {
        const uniqueSources = [...new Set(data.map(d => d.source))].filter(Boolean)
        setSources(uniqueSources)
      }
    } catch (error) {
      console.error('Error loading sources:', error)
    }
  }

  const loadLeads = useCallback(async () => {
    if (!user) return

    try {
      setIsLoading(true)

      let query = supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)

      if (debouncedSearch) {
        const searchLower = debouncedSearch.toLowerCase()
        query = query.or(`name.ilike.%${searchLower}%,email.ilike.%${searchLower}%,phone.ilike.%${searchLower}%,message.ilike.%${searchLower}%,source.ilike.%${searchLower}%`)
      }

      if (filters.dateRange.from) {
        query = query.gte('created_at', filters.dateRange.from.toISOString())
      }

      if (filters.dateRange.to) {
        query = query.lte('created_at', filters.dateRange.to.toISOString())
      }

      if (filters.source) {
        query = query.eq('source', filters.source)
      }

      if (filters.hasMessage === 'with') {
        query = query.not('message', 'is', null).neq('message', '')
      } else if (filters.hasMessage === 'without') {
        query = query.or('message.is.null,message.eq.')
      }

      const sortColumn = filters.sortBy === 'date' ? 'created_at' : filters.sortBy
      query = query.order(sortColumn, { ascending: filters.sortOrder === 'asc' })

      const from = (currentPage - 1) * itemsPerPage
      const to = from + itemsPerPage - 1
      query = query.range(from, to)

      const { data, error, count } = await query

      if (error) {
        console.error('Error loading leads:', error)
      } else {
        setLeads(data || [])
        setTotalCount(count || 0)
      }
    } catch (error) {
      console.error('Error general:', error)
    } finally {
      setIsLoading(false)
    }
  }, [user, debouncedSearch, filters, currentPage, itemsPerPage])

  useEffect(() => {
    if (user) {
      loadLeads()
    }
  }, [loadLeads, user])

  const updateFilter = useCallback((key: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setCurrentPage(1)
  }, [])

  const clearAllFilters = useCallback(() => {
    setFilters({
      search: '',
      dateRange: { from: null, to: null },
      source: '',
      hasMessage: 'all',
      sortBy: 'date',
      sortOrder: 'desc'
    })
    setCurrentPage(1)
  }, [])

  const exportCSV = useCallback(async () => {
    if (!user) return

    try {
      let query = supabase
        .from('leads')
        .select('*')
        .eq('user_id', user.id)

      if (debouncedSearch) {
        const searchLower = debouncedSearch.toLowerCase()
        query = query.or(`name.ilike.%${searchLower}%,email.ilike.%${searchLower}%,phone.ilike.%${searchLower}%,message.ilike.%${searchLower}%,source.ilike.%${searchLower}%`)
      }

      if (filters.dateRange.from) {
        query = query.gte('created_at', filters.dateRange.from.toISOString())
      }

      if (filters.dateRange.to) {
        query = query.lte('created_at', filters.dateRange.to.toISOString())
      }

      if (filters.source) {
        query = query.eq('source', filters.source)
      }

      if (filters.hasMessage === 'with') {
        query = query.not('message', 'is', null).neq('message', '')
      } else if (filters.hasMessage === 'without') {
        query = query.or('message.is.null,message.eq.')
      }

      const sortColumn = filters.sortBy === 'date' ? 'created_at' : filters.sortBy
      query = query.order(sortColumn, { ascending: filters.sortOrder === 'asc' })

      const { data } = await query

      if (!data) return

      const csv = data.map(l =>
        `"${l.name}","${l.email}","${l.phone}","${l.message.replace(/"/g, '""')}","${l.source}","${l.created_at}"`
      )
      const header = 'Nome,Email,Telefono,Messaggio,Fonte,Creato il\n'
      const csvString = header + csv.join('\n')
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `leads_filtrati_${new Date().toISOString().split('T')[0]}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error exporting CSV:', error)
    }
  }, [user, debouncedSearch, filters])

  const getActiveFiltersCount = useMemo(() => {
    let count = 0
    if (filters.search) count++
    if (filters.dateRange.from || filters.dateRange.to) count++
    if (filters.source) count++
    if (filters.hasMessage !== 'all') count++
    return count
  }, [filters])

  const formatDateRange = (range: DateRange) => {
    if (!range.from && !range.to) return ''
    if (range.from && range.to) {
      return `${range.from.toLocaleDateString('it-IT')} - ${range.to.toLocaleDateString('it-IT')}`
    }
    if (range.from) return `Dal ${range.from.toLocaleDateString('it-IT')}`
    if (range.to) return `Fino al ${range.to.toLocaleDateString('it-IT')}`
    return ''
  }

  const leadsWithMessage = useMemo(() =>
    leads.filter(l => l.message && l.message.trim().length > 0).length,
    [leads]
  )

  const uniqueSources = useMemo(() =>
    new Set(leads.map(l => l.source)).size,
    [leads]
  )

  const percentageOfTotal = useMemo(() =>
    totalCount > 0 ? Math.round((leads.length / totalCount) * 100) : 0,
    [leads.length, totalCount]
  )

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

  if (!user) return <p className="text-center mt-10 text-slate-600">Caricamento...</p>

  const totalPages = Math.ceil(totalCount / itemsPerPage)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-orange-500 rounded-xl flex items-center justify-center">
            <span className="text-white text-lg">📇</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Lead Raccolti</h1>
            <p className="text-slate-600 mt-1">
              {totalCount} lead totali
              {getActiveFiltersCount > 0 && (
                <span className="text-pink-600 font-medium"> • {getActiveFiltersCount} filtri attivi</span>
              )}
            </p>
          </div>
        </div>

        <button
          onClick={exportCSV}
          disabled={totalCount === 0}
          className="btn-primary text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 shadow-lg hover:shadow-xl transition-shadow"
        >
          <span>📥</span>
          <span>Esporta CSV ({totalCount})</span>
        </button>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Filtri e Ricerca</h3>
          {getActiveFiltersCount > 0 && (
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
                placeholder="Cerca in nome, email, telefono, messaggio..."
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-colors"
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
            <label htmlFor="source" className="block text-sm font-medium text-slate-700 mb-2">
              Fonte
            </label>
            <select
              id="source"
              value={filters.source}
              onChange={(e) => updateFilter('source', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-colors"
            >
              <option value="">Tutte le fonti</option>
              {sources.map(source => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="hasMessage" className="block text-sm font-medium text-slate-700 mb-2">
              Messaggio
            </label>
            <select
              id="hasMessage"
              value={filters.hasMessage}
              onChange={(e) => updateFilter('hasMessage', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-colors"
            >
              <option value="all">Tutti i lead</option>
              <option value="with">Con messaggio</option>
              <option value="without">Senza messaggio</option>
            </select>
          </div>

          <div>
            <label htmlFor="sortBy" className="block text-sm font-medium text-slate-700 mb-2">
              Ordina per
            </label>
            <select
              id="sortBy"
              value={filters.sortBy}
              onChange={(e) => updateFilter('sortBy', e.target.value as 'date' | 'name' | 'source')}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-colors"
            >
              <option value="date">Data</option>
              <option value="name">Nome</option>
              <option value="source">Fonte</option>
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
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-colors"
            >
              <option value="desc">Decrescente</option>
              <option value="asc">Crescente</option>
            </select>
          </div>
        </div>

        {getActiveFiltersCount > 0 && (
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
              {filters.source && (
                <FilterBadge
                  label="Fonte"
                  value={filters.source}
                  onRemove={() => updateFilter('source', '')}
                />
              )}
              {filters.hasMessage !== 'all' && (
                <FilterBadge
                  label="Messaggio"
                  value={filters.hasMessage === 'with' ? 'Con messaggio' : 'Senza messaggio'}
                  onRemove={() => updateFilter('hasMessage', 'all')}
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
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Lead Visibili</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{leads.length}</p>
            </div>
            <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
              <span className="text-pink-600">📇</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Con Messaggio</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{leadsWithMessage}</p>
            </div>
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <span className="text-orange-600">💬</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Fonti Uniche</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{uniqueSources}</p>
            </div>
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <span className="text-amber-600">🎯</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Totale</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{totalCount}</p>
            </div>
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <span className="text-yellow-600">📊</span>
            </div>
          </div>
        </div>
      </div>

      {totalCount > itemsPerPage && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalCount}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(newSize) => {
            setItemsPerPage(newSize)
            setCurrentPage(1)
          }}
        />
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-slate-100 rounded loading"></div>
              ))}
            </div>
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-slate-400 text-2xl">📇</span>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {getActiveFiltersCount > 0 ? 'Nessun risultato trovato' : 'Nessun lead ancora'}
            </h3>
            <p className="text-slate-600">
              {getActiveFiltersCount > 0
                ? 'Prova a modificare i filtri di ricerca'
                : 'I lead raccolti dai tuoi chatbot appariranno qui'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Nome
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Contatti
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Messaggio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Fonte
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Data
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {leads.map((lead) => (
                  <tr key={lead.id} className="table-row">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-gradient-to-br from-pink-400 to-orange-400 rounded-full flex items-center justify-center mr-3">
                          <span className="text-white font-medium text-sm">
                            {lead.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-slate-900">{lead.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="text-sm text-slate-900">{lead.email}</div>
                        {lead.phone && (
                          <div className="text-sm text-slate-600">{lead.phone}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-900 max-w-xs">
                        {lead.message && lead.message.trim() ? (
                          <p className="truncate" title={lead.message}>
                            {lead.message}
                          </p>
                        ) : (
                          <span className="text-slate-400 italic">Nessun messaggio</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                        {lead.source}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-900">
                        {new Date(lead.created_at).toLocaleDateString('it-IT')}
                      </div>
                      <div className="text-sm text-slate-500">
                        {new Date(lead.created_at).toLocaleTimeString('it-IT', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalCount > itemsPerPage && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalCount}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
          onItemsPerPageChange={(newSize) => {
            setItemsPerPage(newSize)
            setCurrentPage(1)
          }}
        />
      )}
    </div>
  )
}
