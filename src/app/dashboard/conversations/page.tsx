'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import DateRangePicker from '@/app/components/DateRangePicker'
import FilterBadge from '@/app/components/FilterBadge'

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
  const [user, setUser] = useState<any>(null)
  const [allConversations, setAllConversations] = useState<Conversation[]>([])
  const [groupedConversations, setGroupedConversations] = useState<Record<string, Conversation[]>>({})
  const [filteredSessions, setFilteredSessions] = useState<[string, Conversation[]][]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<Filters>({
    search: '',
    dateRange: { from: null, to: null },
    minMessages: 0,
    sender: 'all',
    sortBy: 'date',
    sortOrder: 'desc'
  })
  const router = useRouter()

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData?.user) return router.push('/')
        setUser(userData.user)

        const { data: conv } = await supabase
          .from('conversations')
          .select('*')
          .eq('user_id', userData.user.id)
          .order('created_at', { ascending: true })

        if (!conv) return

        setAllConversations(conv)

        // Raggruppa per session_id
        const sessions: Record<string, Conversation[]> = {}
        conv.forEach(c => {
          if (!sessions[c.session_id]) sessions[c.session_id] = []
          sessions[c.session_id].push(c)
        })
        setGroupedConversations(sessions)
      } catch (error) {
        console.error('Errore nel caricamento delle conversazioni:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [router])

  useEffect(() => {
    applyFilters()
  }, [groupedConversations, filters])

  const applyFilters = () => {
    let sessions = Object.entries(groupedConversations)

    // Filtro per ricerca full-text
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
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

    // Filtro per tipo di mittente
    if (filters.sender !== 'all') {
      sessions = sessions.filter(([_, messages]) =>
        messages.some(msg => msg.sender === filters.sender)
      )
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
  }

  const updateFilter = (key: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const clearAllFilters = () => {
    setFilters({
      search: '',
      dateRange: { from: null, to: null },
      minMessages: 0,
      sender: 'all',
      sortBy: 'date',
      sortOrder: 'desc'
    })
  }

  const toggleSession = (sessionId: string) => {
    const newExpanded = new Set(expandedSessions)
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId)
    } else {
      newExpanded.add(sessionId)
    }
    setExpandedSessions(newExpanded)
  }

  const getActiveFiltersCount = () => {
    let count = 0
    if (filters.search) count++
    if (filters.dateRange.from || filters.dateRange.to) count++
    if (filters.minMessages > 0) count++
    if (filters.sender !== 'all') count++
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

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-slate-200 rounded-lg loading"></div>
          <div className="h-8 bg-slate-200 rounded w-48 loading"></div>
        </div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <div className="h-6 bg-slate-200 rounded w-64 mb-4 loading"></div>
              <div className="space-y-2">
                <div className="h-4 bg-slate-100 rounded loading"></div>
                <div className="h-4 bg-slate-100 rounded w-3/4 loading"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!user) return <p className="text-center mt-10 text-slate-600">Caricamento...</p>

  const totalSessions = Object.keys(groupedConversations).length
  const totalMessages = Object.values(groupedConversations).reduce((acc, messages) => acc + messages.length, 0)
  const filteredMessages = filteredSessions.reduce((acc, [_, messages]) => acc + messages.length, 0)
  const activeFiltersCount = getActiveFiltersCount()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
          <span className="text-white text-lg">💬</span>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Conversazioni</h1>
          <p className="text-slate-600 mt-1">
            {filteredSessions.length} di {totalSessions} sessioni • {filteredMessages} di {totalMessages} messaggi
            {activeFiltersCount > 0 && (
              <span className="text-blue-600 font-medium"> • {activeFiltersCount} filtri attivi</span>
            )}
          </p>
        </div>
      </div>

      {/* Filtri Avanzati */}
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
          {/* Ricerca Full-Text */}
          <div className="lg:col-span-2">
            <label htmlFor="search" className="block text-sm font-medium text-slate-700 mb-2">
              Ricerca
            </label>
            <div className="relative">
              <input
                id="search"
                type="text"
                placeholder="Cerca in ID sessione, messaggi o mittente..."
                value={filters.search}
                onChange={(e) => updateFilter('search', e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Filtro Data */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Periodo
            </label>
            <DateRangePicker
              value={filters.dateRange}
              onChange={(range) => updateFilter('dateRange', range)}
            />
          </div>

          {/* Filtro Mittente */}
          <div>
            <label htmlFor="sender" className="block text-sm font-medium text-slate-700 mb-2">
              Mittente
            </label>
            <select
              id="sender"
              value={filters.sender}
              onChange={(e) => updateFilter('sender', e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              <option value="all">Tutti i messaggi</option>
              <option value="user">Solo utente</option>
              <option value="bot">Solo bot</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Filtro Numero Messaggi */}
          <div>
            <label htmlFor="minMessages" className="block text-sm font-medium text-slate-700 mb-2">
              Messaggi minimi per sessione
            </label>
            <input
              id="minMessages"
              type="number"
              min="0"
              value={filters.minMessages}
              onChange={(e) => updateFilter('minMessages', parseInt(e.target.value) || 0)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Ordinamento */}
          <div>
            <label htmlFor="sortBy" className="block text-sm font-medium text-slate-700 mb-2">
              Ordina per
            </label>
            <select
              id="sortBy"
              value={filters.sortBy}
              onChange={(e) => updateFilter('sortBy', e.target.value as 'date' | 'messages' | 'session')}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              <option value="date">Data ultima attività</option>
              <option value="messages">Numero messaggi</option>
              <option value="session">ID sessione</option>
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

        {/* Filtri Attivi */}
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
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Sessioni Visibili</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{filteredSessions.length}</p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-purple-600">🗂️</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Messaggi Visibili</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{filteredMessages}</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-blue-600">💭</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Media per Sessione</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {filteredSessions.length > 0 ? Math.round(filteredMessages / filteredSessions.length) : 0}
              </p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-green-600">📊</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">% del Totale</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {totalSessions > 0 ? Math.round((filteredSessions.length / totalSessions) * 100) : 0}%
              </p>
            </div>
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <span className="text-amber-600">📈</span>
            </div>
          </div>
        </div>
      </div>

      {/* Conversazioni */}
      <div className="space-y-4">
        {filteredSessions.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-slate-400 text-2xl">💬</span>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {activeFiltersCount > 0 ? 'Nessun risultato trovato' : 'Nessuna conversazione ancora'}
            </h3>
            <p className="text-slate-600">
              {activeFiltersCount > 0 
                ? 'Prova a modificare i filtri di ricerca' 
                : 'Le conversazioni con i tuoi chatbot appariranno qui'
              }
            </p>
          </div>
        ) : (
          filteredSessions.map(([sessionId, messages]) => {
            const lastMsg = messages[messages.length - 1]
            const firstMsg = messages[0]
            const isExpanded = expandedSessions.has(sessionId)
            
            return (
              <div key={sessionId} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden card-hover">
                <div 
                  className="p-6 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleSession(sessionId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-purple-500 rounded-lg flex items-center justify-center">
                          <span className="text-white text-sm font-medium">
                            {sessionId.slice(-2).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">
                            Sessione: {sessionId}
                          </h3>
                          <p className="text-sm text-slate-500">
                            {messages.length} messaggi • {formatTime(firstMsg.created_at)} - {formatTime(lastMsg.created_at)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="bg-slate-50 rounded-lg p-3 mt-3">
                        <p className="text-sm text-slate-700">
                          <span className="font-medium text-slate-900">{lastMsg.sender === 'user' ? 'Utente' : 'Bot'}:</span> {lastMsg.message}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">{formatTime(lastMsg.created_at)}</p>
                      </div>
                    </div>
                    
                    <div className="ml-4 flex items-center space-x-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        {messages.length} msg
                      </span>
                      <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-200 bg-slate-50">
                    <div className="p-6">
                      <h4 className="text-sm font-medium text-slate-900 mb-4">Cronologia completa</h4>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {messages.map((msg, index) => (
                          <div 
                            key={msg.id} 
                            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                              msg.sender === 'user' 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-white text-slate-900 border border-slate-200'
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
    </div>
  )
}