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

type Conversation = {
  id: string
  session_id: string
  sender: string
  message: string
  created_at: string
}

type DateRange = {
  from: Date | null
  to: Date | null
}

type Filters = {
  search: string
  dateRange: DateRange
  minMessages: number
  sender: string // 'all' | 'user' | 'bot'
  sortBy: 'date' | 'messages' | 'session'
  sortOrder: 'asc' | 'desc'
}

export default function ConversationsPage() {
  const { user } = useAuth()
  const [groupedConversations, setGroupedConversations] = useState<Record<string, Conversation[]>>({})
  const [filteredSessions, setFilteredSessions] = useState<[string, Conversation[]][]>([])
  const [paginatedSessions, setPaginatedSessions] = useState<[string, Conversation[]][]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(20)
  const [filters, setFilters] = useState<Filters>({
    search: '',
    dateRange: { from: null, to: null },
    minMessages: 0,
    sender: 'all',
    sortBy: 'date',
    sortOrder: 'desc'
  })

  const debouncedSearch = useDebounce(filters.search, 500)

  useEffect(() => {
    if (!user?.id) return
    setIsLoading(true)
    supabase
      .from('conversations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .then(({ data: conv }) => {
        if (!conv) return
        const sessions: Record<string, Conversation[]> = {}
        conv.forEach(c => {
          if (!sessions[c.session_id]) sessions[c.session_id] = []
          sessions[c.session_id].push(c)
        })
        setGroupedConversations(sessions)
      })
      .catch(err => console.error('Errore caricamento conversazioni:', err))
      .finally(() => setIsLoading(false))
  }, [user?.id])

  useEffect(() => {
    applyFilters()
  }, [groupedConversations, filters, debouncedSearch])

  useEffect(() => {
    applyPagination()
  }, [filteredSessions, currentPage, itemsPerPage])

  const applyPagination = () => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    setPaginatedSessions(filteredSessions.slice(startIndex, endIndex))
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1)
  }

  const applyFilters = useCallback(() => {
    let sessions = Object.entries(groupedConversations)

    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase()
      sessions = sessions.filter(([sessionId, messages]) =>
        sessionId.toLowerCase().includes(searchLower) ||
        messages.some(msg =>
          msg.message.toLowerCase().includes(searchLower) ||
          msg.sender.toLowerCase().includes(searchLower)
        )
      )
    }

    // Filtro per data
    if (filters.dateRange.from || filters.dateRange.to) {
      sessions = sessions.filter(([_, messages]) => {
        const sessionStart = new Date(messages[0].created_at)
        const sessionEnd = new Date(messages[messages.length - 1].created_at)
        
        if (filters.dateRange.from && sessionEnd < filters.dateRange.from) return false
        if (filters.dateRange.to && sessionStart > filters.dateRange.to) return false
        return true
      })
    }

    // Filtro per numero minimo di messaggi
    if (filters.minMessages > 0) {
      sessions = sessions.filter(([_, messages]) => messages.length >= filters.minMessages)
    }

    // Filtro per tipo di mittente - mostra sessioni che contengono ALMENO UN messaggio del tipo selezionato
    if (filters.sender !== 'all') {
      sessions = sessions.filter(([_, messages]) => {
        return messages.some(msg => msg.sender === filters.sender)
      })
    }

    // Ordinamento
    sessions.sort(([sessionIdA, messagesA], [sessionIdB, messagesB]) => {
      let aValue: string | number | Date
      let bValue: string | number | Date

      switch (filters.sortBy) {
        case 'session':
          aValue = sessionIdA.toLowerCase()
          bValue = sessionIdB.toLowerCase()
          break
        case 'messages':
          aValue = messagesA.length
          bValue = messagesB.length
          break
        case 'date':
        default:
          aValue = new Date(messagesA[messagesA.length - 1].created_at)
          bValue = new Date(messagesB[messagesB.length - 1].created_at)
          break
      }

      if (aValue < bValue) return filters.sortOrder === 'asc' ? -1 : 1
      if (aValue > bValue) return filters.sortOrder === 'asc' ? 1 : -1
      return 0
    })

    setFilteredSessions(sessions)
  }, [groupedConversations, debouncedSearch, filters])

  const updateFilter = useCallback((key: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setCurrentPage(1)
  }, [])

  const clearAllFilters = useCallback(() => {
    setFilters({
      search: '',
      dateRange: { from: null, to: null },
      minMessages: 0,
      sender: 'all',
      sortBy: 'date',
      sortOrder: 'desc'
    })
    setCurrentPage(1)
  }, [])

  const toggleSession = useCallback((sessionId: string) => {
    const newExpanded = new Set(expandedSessions)
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId)
    } else {
      newExpanded.add(sessionId)
    }
    setExpandedSessions(newExpanded)
  }, [expandedSessions])

  const getActiveFiltersCount = useMemo(() => {
    let count = 0
    if (filters.search) count++
    if (filters.dateRange.from || filters.dateRange.to) count++
    if (filters.minMessages > 0) count++
    if (filters.sender !== 'all') count++
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

  const formatTime = useCallback((dateString: string) => {
    return new Date(dateString).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }, [])

  const totalSessions = Object.keys(groupedConversations).length
  const filteredMessages = filteredSessions.reduce((acc, [, messages]) => acc + messages.length, 0)
  const activeFiltersCount = getActiveFiltersCount
  const totalPages = Math.ceil(filteredSessions.length / itemsPerPage)
  const startItem = filteredSessions.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, filteredSessions.length)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-[#F0AD4E] rounded-xl flex items-center justify-center">
          <span className="text-[#1e293b] text-lg">💬</span>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white">Conversazioni</h1>
          <p className="text-gray-300 mt-1">
            Mostrando {startItem}-{endItem} di {filteredSessions.length} sessioni ({totalSessions} totali) • {filteredMessages} messaggi
            {activeFiltersCount > 0 && (
              <span className="text-[#F0AD4E] font-medium"> • {activeFiltersCount} filtri attivi</span>
            )}
          </p>
        </div>
      </div>

      {/* Filtri Avanzati */}
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
              <p className="text-xs text-gray-400 mt-0.5">Trova le conversazioni che stai cercando</p>
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
          {/* Ricerca Full-Text */}
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
                placeholder="Cerca in ID sessione, messaggi o mittente..."
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white placeholder-gray-500 shadow-sm hover:shadow-md"
              />
              <svg className="absolute left-3.5 top-3 w-4 h-4 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Filtro Data */}
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

          {/* Filtro Mittente */}
          <div>
            <label htmlFor="sender" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
              <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Mittente
            </label>
            <select
              id="sender"
              value={filters.sender}
              onChange={(e) => updateFilter('sender', e.target.value)}
              className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 font-medium text-white shadow-sm hover:shadow-md"
            >
              <option value="all">Tutti i messaggi</option>
              <option value="user">Solo utente</option>
              <option value="bot">Solo bot</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-5 border-t border-[#1F2124]">
          {/* Filtro Numero Messaggi */}
          <div>
            <label htmlFor="minMessages" className="flex items-center gap-2 text-sm font-semibold text-gray-300 mb-2.5">
              <svg className="w-4 h-4 text-[#F0AD4E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              Messaggi minimi per sessione
            </label>
            <input
              id="minMessages"
              type="number"
              min="0"
              value={filters.minMessages}
              onChange={(e) => updateFilter('minMessages', parseInt(e.target.value) || 0)}
              className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 text-white shadow-sm hover:shadow-md"
            />
          </div>

          {/* Ordinamento */}
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
              onChange={(e) => updateFilter('sortBy', e.target.value as 'date' | 'messages' | 'session')}
              className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 font-medium text-white shadow-sm hover:shadow-md"
            >
              <option value="date">Data ultima attività</option>
              <option value="messages">Numero messaggi</option>
              <option value="session">ID sessione</option>
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
              className="w-full px-4 py-2.5 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E]/50 focus:border-[#F0AD4E] transition-all duration-200 font-medium text-white shadow-sm hover:shadow-md"
            >
              <option value="desc">Decrescente</option>
              <option value="asc">Crescente</option>
            </select>
          </div>
        </div>

        {/* Filtri Attivi */}
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
              {filters.minMessages > 0 && (
                <FilterBadge
                  label="Min messaggi"
                  value={filters.minMessages.toString()}
                  onRemove={() => updateFilter('minMessages', 0)}
                />
              )}
              {filters.sender !== 'all' && (
                <FilterBadge
                  label="Mittente"
                  value={filters.sender === 'user' ? 'Utente' : 'Bot'}
                  onRemove={() => updateFilter('sender', 'all')}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Statistiche Filtrate */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">Sessioni Visibili</p>
              <p className="text-2xl font-bold text-white mt-1">{filteredSessions.length}</p>
            </div>
            <div className="w-10 h-10 bg-[#F0AD4E]/20 rounded-lg flex items-center justify-center">
              <span className="text-[#F0AD4E]">🗂️</span>
            </div>
          </div>
        </div>

        <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">Messaggi Visibili</p>
              <p className="text-2xl font-bold text-white mt-1">{filteredMessages}</p>
            </div>
            <div className="w-10 h-10 bg-[#5CB85C]/20 rounded-lg flex items-center justify-center">
              <span className="text-[#5CB85C]">💭</span>
            </div>
          </div>
        </div>

        <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">Media per Sessione</p>
              <p className="text-2xl font-bold text-white mt-1">
                {filteredSessions.length > 0 ? Math.round(filteredMessages / filteredSessions.length) : 0}
              </p>
            </div>
            <div className="w-10 h-10 bg-[#F0AD4E]/20 rounded-lg flex items-center justify-center">
              <span className="text-[#F0AD4E]">📊</span>
            </div>
          </div>
        </div>

        <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">% del Totale</p>
              <p className="text-2xl font-bold text-white mt-1">
                {totalSessions > 0 ? Math.round((filteredSessions.length / totalSessions) * 100) : 0}%
              </p>
            </div>
            <div className="w-10 h-10 bg-[#3A3D42] rounded-lg flex items-center justify-center border border-[#1F2124]">
              <span className="text-gray-300">📈</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pagination Top */}
      {filteredSessions.length > itemsPerPage && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredSessions.length}
          itemsPerPage={itemsPerPage}
          onPageChange={handlePageChange}
          onItemsPerPageChange={handleItemsPerPageChange}
        />
      )}

      {/* Conversazioni */}
      <div className="space-y-4">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="bg-[#3A3D42] rounded-xl p-6 border border-[#1F2124]">
              <div className="h-5 bg-[#1F2124] rounded w-64 mb-3 loading"></div>
              <div className="h-4 bg-[#1F2124] rounded w-full mb-2 loading"></div>
              <div className="h-4 bg-[#1F2124] rounded w-3/4 loading"></div>
            </div>
          ))
        ) : paginatedSessions.length === 0 && filteredSessions.length === 0 ? (
          <div className="bg-[#3A3D42] rounded-xl p-12 text-center shadow-sm border border-[#1F2124]">
            <div className="w-16 h-16 bg-[#1F2124] rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-gray-500 text-2xl">💬</span>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              {activeFiltersCount > 0 ? 'Nessun risultato trovato' : 'Nessuna conversazione ancora'}
            </h3>
            <p className="text-gray-400">
              {activeFiltersCount > 0 
                ? 'Prova a modificare i filtri di ricerca' 
                : 'Le conversazioni con i tuoi chatbot appariranno qui'
              }
            </p>
          </div>
        ) : paginatedSessions.length === 0 ? (
          <div className="bg-[#3A3D42] rounded-xl p-12 text-center shadow-sm border border-[#1F2124]">
            <div className="w-16 h-16 bg-[#1F2124] rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-gray-500 text-2xl">📄</span>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              Nessun risultato in questa pagina
            </h3>
            <p className="text-gray-400">
              Prova a cambiare pagina o modificare i filtri
            </p>
          </div>
        ) : (
          paginatedSessions.map(([sessionId, messages]) => {
            const lastMsg = messages[messages.length - 1]
            const firstMsg = messages[0]
            const isExpanded = expandedSessions.has(sessionId)
            
            return (
              <div key={sessionId} className="bg-[#3A3D42] rounded-xl shadow-sm border border-[#1F2124] overflow-hidden card-hover">
                <div 
                  className="p-6 cursor-pointer hover:bg-[#1F2124] transition-colors"
                  onClick={() => toggleSession(sessionId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="w-8 h-8 bg-[#F0AD4E] rounded-lg flex items-center justify-center">
                          <span className="text-[#1e293b] text-sm font-medium">
                            {sessionId.slice(-2).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white">
                            Sessione: {sessionId}
                          </h3>
                          <p className="text-sm text-gray-400">
                            {messages.length} messaggi • {formatTime(firstMsg.created_at)} - {formatTime(lastMsg.created_at)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="bg-[#1F2124] rounded-lg p-3 mt-3">
                        <p className="text-sm text-gray-300">
                          <span className="font-medium text-white">{lastMsg.sender === 'user' ? 'Utente' : 'Bot'}:</span> {lastMsg.message}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{formatTime(lastMsg.created_at)}</p>
                      </div>
                    </div>
                    
                    <div className="ml-4 flex items-center space-x-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F0AD4E]/20 text-[#F0AD4E] border border-[#F0AD4E]/30">
                        {messages.length} msg
                      </span>
                      <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-[#1F2124] bg-[#1F2124]">
                    <div className="p-6">
                      <h4 className="text-sm font-medium text-white mb-4">Cronologia completa</h4>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {messages.map((msg) => (
                          <div 
                            key={msg.id} 
                            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                              msg.sender === 'user' 
                                ? 'bg-[#F0AD4E] text-[#1e293b]' 
                                : 'bg-[#3A3D42] text-white border border-[#1F2124]'
                            }`}>
                              <div className="flex items-center space-x-2 mb-1">
                                <span className="text-xs font-medium opacity-75">
                                  {msg.sender === 'user' ? 'Utente' : 'Bot'}
                                </span>
                                <span className="text-xs opacity-60">
                                  {formatTime(msg.created_at)}
                                </span>
                              </div>
                              <p className="text-sm">{msg.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Pagination Bottom */}
      {filteredSessions.length > itemsPerPage && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredSessions.length}
          itemsPerPage={itemsPerPage}
          onPageChange={handlePageChange}
          onItemsPerPageChange={handleItemsPerPageChange}
        />
      )}
    </div>
  )
}