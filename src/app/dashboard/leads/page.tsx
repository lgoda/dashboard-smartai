'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import { useAuth } from '@/app/components/AuthProvider'
import DateRangePicker from '@/app/components/DateRangePicker'
import FilterBadge from '@/app/components/FilterBadge'
import Pagination from '@/app/components/Pagination'
import { useDebounce } from '@/app/lib/useDebounce'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

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
  const { user } = useAuth()
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

  const debouncedSearch = useDebounce(filters.search, 500)

  useEffect(() => {
    if (!user?.id) return
    loadSources(user.id)
  }, [user?.id])

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

  const totalPages = Math.ceil(totalCount / itemsPerPage)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-[#F0AD4E] rounded-xl flex items-center justify-center">
            <span className="text-[#1e293b] text-lg">📇</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Lead Raccolti</h1>
            <p className="text-gray-300 mt-1">
              {totalCount} lead totali
              {getActiveFiltersCount > 0 && (
                <span className="text-[#F0AD4E] font-medium"> • {getActiveFiltersCount} filtri attivi</span>
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
              <p className="text-xs text-gray-400 mt-0.5">Trova i lead che stai cercando</p>
            </div>
          </div>
          {getActiveFiltersCount > 0 && (
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
                placeholder="Cerca in nome, email, telefono, messaggio..."
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
            <label htmlFor="source" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
              <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Fonte
            </label>
            <select
              id="source"
              value={filters.source}
              onChange={(e) => updateFilter('source', e.target.value)}
              className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white shadow-sm hover:shadow-md"
            >
              <option value="">Tutte le fonti</option>
              {sources.map(source => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-5 border-t border-[#1F2124]">
          <div>
            <label htmlFor="hasMessage" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
              <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              Messaggio
            </label>
            <select
              id="hasMessage"
              value={filters.hasMessage}
              onChange={(e) => updateFilter('hasMessage', e.target.value)}
              className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white shadow-sm hover:shadow-md"
            >
              <option value="all">Tutti i lead</option>
              <option value="with">Con messaggio</option>
              <option value="without">Senza messaggio</option>
            </select>
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
              onChange={(e) => updateFilter('sortBy', e.target.value as 'date' | 'name' | 'source')}
              className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white shadow-sm hover:shadow-md"
            >
              <option value="date">Data</option>
              <option value="name">Nome</option>
              <option value="source">Fonte</option>
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

        {getActiveFiltersCount > 0 && (
          <div className="mt-6 pt-5 border-t border-[#1F2124]">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <span className="text-sm font-semibold text-gray-300">Filtri attivi ({getActiveFiltersCount})</span>
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
        <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">Lead Visibili</p>
              <p className="text-2xl font-bold text-white mt-1">{leads.length}</p>
            </div>
            <div className="w-10 h-10 bg-[#F0AD4E]/20 rounded-lg flex items-center justify-center">
              <span className="text-[#F0AD4E]">📇</span>
            </div>
          </div>
        </div>

        <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">Con Messaggio</p>
              <p className="text-2xl font-bold text-white mt-1">{leadsWithMessage}</p>
            </div>
            <div className="w-10 h-10 bg-[#5CB85C]/20 rounded-lg flex items-center justify-center">
              <span className="text-[#5CB85C]">💬</span>
            </div>
          </div>
        </div>

        <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">Fonti Uniche</p>
              <p className="text-2xl font-bold text-white mt-1">{uniqueSources}</p>
            </div>
            <div className="w-10 h-10 bg-[#F0AD4E]/20 rounded-lg flex items-center justify-center">
              <span className="text-[#F0AD4E]">🎯</span>
            </div>
          </div>
        </div>

        <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">Totale</p>
              <p className="text-2xl font-bold text-white mt-1">{totalCount}</p>
            </div>
            <div className="w-10 h-10 bg-[#3A3D42] rounded-lg flex items-center justify-center border border-[#1F2124]">
              <span className="text-gray-300">📊</span>
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

      <div className="bg-[#3A3D42] rounded-xl shadow-sm border border-[#1F2124] overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-[#1F2124] rounded loading"></div>
              ))}
            </div>
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-[#1F2124] rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-gray-500 text-2xl">📇</span>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              {getActiveFiltersCount > 0 ? 'Nessun risultato trovato' : 'Nessun lead ancora'}
            </h3>
            <p className="text-gray-400">
              {getActiveFiltersCount > 0
                ? 'Prova a modificare i filtri di ricerca'
                : 'I lead raccolti dai tuoi chatbot appariranno qui'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-[#1F2124]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Nome
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Contatti
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Messaggio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Fonte
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Data
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[#3A3D42] divide-y divide-[#1F2124]">
                {leads.map((lead) => (
                  <tr key={lead.id} className="table-row">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-[#F0AD4E] rounded-full flex items-center justify-center mr-3">
                          <span className="text-[#1e293b] font-medium text-sm">
                            {lead.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">{lead.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="text-sm text-white">{lead.email}</div>
                        {lead.phone && (
                          <div className="text-sm text-gray-400">{lead.phone}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-white max-w-xs">
                        {lead.message && lead.message.trim() ? (
                          <p className="truncate" title={lead.message}>
                            {lead.message}
                          </p>
                        ) : (
                          <span className="text-gray-500 italic">Nessun messaggio</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F0AD4E]/20 text-[#F0AD4E] border border-[#F0AD4E]/30">
                        {lead.source}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">
                        {new Date(lead.created_at).toLocaleDateString('it-IT')}
                      </div>
                      <div className="text-sm text-gray-400">
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
