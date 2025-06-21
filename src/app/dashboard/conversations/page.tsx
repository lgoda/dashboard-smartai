'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import { useRouter } from 'next/navigation'

type Conversation = {
  id: string
  session_id: string
  sender: string
  message: string
  created_at: string
}

export default function ConversationsPage() {
  const [user, setUser] = useState<any>(null)
  const [groupedConversations, setGroupedConversations] = useState<Record<string, Conversation[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
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

  const toggleSession = (sessionId: string) => {
    const newExpanded = new Set(expandedSessions)
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId)
    } else {
      newExpanded.add(sessionId)
    }
    setExpandedSessions(newExpanded)
  }

  const getFilteredSessions = () => {
    if (!searchTerm) return Object.entries(groupedConversations)
    
    return Object.entries(groupedConversations).filter(([sessionId, messages]) =>
      sessionId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      messages.some(msg => 
        msg.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        msg.sender.toLowerCase().includes(searchTerm.toLowerCase())
      )
    )
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

  const filteredSessions = getFilteredSessions()
  const totalSessions = Object.keys(groupedConversations).length
  const totalMessages = Object.values(groupedConversations).reduce((acc, messages) => acc + messages.length, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
          <span className="text-white text-lg">💬</span>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Conversazioni</h1>
          <p className="text-slate-600 mt-1">{totalSessions} sessioni • {totalMessages} messaggi totali</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Sessioni Totali</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{totalSessions}</p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-purple-600">🗂️</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Messaggi Totali</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{totalMessages}</p>
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
                {totalSessions > 0 ? Math.round(totalMessages / totalSessions) : 0}
              </p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-green-600">📊</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <label htmlFor="search" className="block text-sm font-medium text-slate-700 mb-2">
          Cerca nelle conversazioni
        </label>
        <input
          id="search"
          type="text"
          placeholder="Cerca per ID sessione, messaggio o mittente..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
        />
        {searchTerm && (
          <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
            <span>Trovate {filteredSessions.length} sessioni per "{searchTerm}"</span>
            <button
              onClick={() => setSearchTerm('')}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Cancella ricerca
            </button>
          </div>
        )}
      </div>

      {/* Conversations */}
      <div className="space-y-4">
        {filteredSessions.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-slate-200">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-slate-400 text-2xl">💬</span>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {searchTerm ? 'Nessun risultato trovato' : 'Nessuna conversazione ancora'}
            </h3>
            <p className="text-slate-600">
              {searchTerm 
                ? 'Prova a modificare i termini di ricerca' 
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
                          <span className="font-medium text-slate-900">{lastMsg.sender}:</span> {lastMsg.message}
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