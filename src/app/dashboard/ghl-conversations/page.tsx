'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/components/AuthProvider'
import { useDebounce } from '@/app/lib/useDebounce'
import {
  getChannelLabel,
  getChannelColor,
  type GHLConversation,
  type GHLMessage,
  type GHLCursor,
} from '@/app/lib/ghlApi'
import type { InsightResult } from '@/app/api/ghl/analyze/route'
import Link from 'next/link'
import DateRangePicker from '@/app/components/DateRangePicker'

export const dynamic = 'force-dynamic'

const ITEMS_PER_PAGE = 20

const CHANNEL_FILTERS = [
  { value: 'all', label: 'Tutti' },
  { value: 'TYPE_WHATSAPP', label: 'WhatsApp' },
  { value: 'TYPE_SMS', label: 'SMS' },
  { value: 'TYPE_EMAIL', label: 'Email' },
  { value: 'TYPE_PHONE', label: 'Telefono' },
  { value: 'TYPE_INSTAGRAM', label: 'Instagram' },
  { value: 'TYPE_FACEBOOK', label: 'Facebook' },
]

// ─── Small components ─────────────────────────────────────────────────────────

function ChannelBadge({ type }: { type: string }) {
  const label = getChannelLabel(type)
  const color = getChannelColor(type)
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ color, borderColor: `${color}44`, backgroundColor: `${color}18` }}
    >
      {label}
    </span>
  )
}

function ContactAvatar({ name }: { name?: string }) {
  const initials = name
    ? name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'
  return (
    <div className="w-10 h-10 rounded-full bg-[#F0AD4E]/20 border border-[#F0AD4E]/30 flex items-center justify-center text-[#F0AD4E] font-semibold text-sm flex-shrink-0">
      {initials}
    </div>
  )
}

function formatDate(dateString?: string | null) {
  if (!dateString) return '—'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return '—'
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const hours = diff / 1000 / 60 / 60
  if (hours < 24) return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  if (hours < 24 * 7)
    return date.toLocaleDateString('it-IT', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function MessageBubble({ message }: { message: GHLMessage }) {
  const isOutbound = message.type === 2
  const time = formatDate(message.dateAdded)
  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className="max-w-[75%]">
        <div
          className={`px-4 py-2 rounded-2xl text-sm ${
            isOutbound
              ? 'bg-[#F0AD4E] text-[#1e293b] rounded-br-sm'
              : 'bg-[#1F2124] text-gray-200 rounded-bl-sm'
          }`}
        >
          {message.body ?? <span className="italic opacity-50">[allegato]</span>}
        </div>
        <p className={`text-xs text-gray-500 mt-1 ${isOutbound ? 'text-right' : 'text-left'}`}>{time}</p>
      </div>
    </div>
  )
}

function ConversationSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-[#3A3D42] rounded-xl p-4 border border-[#1F2124] flex items-center space-x-4">
          <div className="w-10 h-10 rounded-full bg-[#1F2124] loading flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-[#1F2124] rounded w-1/3 loading" />
            <div className="h-3 bg-[#1F2124] rounded w-2/3 loading" />
          </div>
          <div className="space-y-2 text-right">
            <div className="h-3 bg-[#1F2124] rounded w-12 loading" />
            <div className="h-5 bg-[#1F2124] rounded w-16 loading" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GHLConversationsPage() {
  const router = useRouter()
  const { accessToken } = useAuth()
  const [isLoading, setIsLoading] = useState(true)
  const [hasToken, setHasToken] = useState<boolean | null>(null)
  const [conversations, setConversations] = useState<GHLConversation[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cursor stack for back/forward navigation
  const [cursorHistory, setCursorHistory] = useState<GHLCursor[]>([]) // cursors used to get to each page
  const [nextCursor, setNextCursor] = useState<GHLCursor | undefined>(undefined)
  const pageIndex = cursorHistory.length // 0-based, used for display

  // Filters
  const [channelFilter, setChannelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'close'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearch = useDebounce(searchQuery, 500)

  // Date range filter (client-side)
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null })

  // Opportunity analysis
  const [insights, setInsights] = useState<Record<string, InsightResult>>({})
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  // Selected conversation / messages
  const [selectedConversation, setSelectedConversation] = useState<GHLConversation | null>(null)
  const [messages, setMessages] = useState<GHLMessage[]>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Check token on mount
  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) return router.push('/')

      const { data: tokenData } = await supabase
        .from('ghl_tokens')
        .select('is_active')
        .eq('user_id', userData.user.id)
        .eq('is_active', true)
        .maybeSingle()

      setHasToken(!!tokenData)
      setIsLoading(false)
    }
    init()
  }, [router])

  // Core fetch — accepts an explicit cursor (undefined = first page)
  const fetchConversations = useCallback(
    async (cursor?: GHLCursor) => {
      if (!hasToken) return
      setIsFetching(true)
      setError(null)
      try {
        if (!accessToken) return

        const params = new URLSearchParams({
          limit: String(ITEMS_PER_PAGE),
          status: statusFilter,
        })
        if (channelFilter !== 'all') params.set('type', channelFilter)
        if (debouncedSearch) params.set('query', debouncedSearch)
        if (cursor) {
          params.set('startAfter', cursor.startAfter)
          params.set('startAfterDate', String(cursor.startAfterDate))
        }

        const res = await fetch(`/api/ghl/conversations?${params.toString()}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        if (!res.ok) {
          const body = await res.json()
          throw new Error(body.error ?? 'Errore nel caricamento delle conversazioni')
        }

        const json = await res.json()
        setConversations(json.conversations ?? [])
        setTotal(json.total ?? 0)
        setHasMore(json.hasMore ?? false)
        setNextCursor(json.nextCursor ?? undefined)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Errore sconosciuto')
      } finally {
        setIsFetching(false)
      }
    },
    [hasToken, channelFilter, statusFilter, debouncedSearch]
  )

  // When filters change, reset to first page
  useEffect(() => {
    if (hasToken === true) {
      setCursorHistory([])
      setNextCursor(undefined)
      fetchConversations(undefined)
    }
  }, [hasToken, fetchConversations])

  const handleNextPage = useCallback(() => {
    if (!nextCursor) return
    setCursorHistory((prev) => [...prev, nextCursor!])
    fetchConversations(nextCursor)
  }, [nextCursor, fetchConversations])

  const handlePrevPage = useCallback(() => {
    if (cursorHistory.length === 0) return
    const newHistory = cursorHistory.slice(0, -1)
    const prevCursor = newHistory.length > 0 ? newHistory[newHistory.length - 1] : undefined
    setCursorHistory(newHistory)
    fetchConversations(prevCursor)
  }, [cursorHistory, fetchConversations])

  // Fetch messages when a conversation is selected
  const fetchMessages = useCallback(async (conversation: GHLConversation) => {
    setSelectedConversation(conversation)
    setMessages([])
    setIsLoadingMessages(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) return

      const res = await fetch(`/api/ghl/conversation/${conversation.id}/messages`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Errore nel caricamento dei messaggi')
      }

      const json = await res.json()
      const msgs: GHLMessage[] = json.messages?.messages ?? []
      setMessages([...msgs].reverse()) // oldest first
    } catch (err) {
      console.error('Error fetching messages:', err)
    } finally {
      setIsLoadingMessages(false)
    }
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (conversations.length === 0) return
    setIsAnalyzing(true)
    setAnalyzeError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) return

      const res = await fetch('/api/ghl/analyze', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversations }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Errore durante l\'analisi')
      }

      const json = await res.json()
      setInsights((prev) => ({ ...prev, ...(json.results ?? {}) }))
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Errore sconosciuto')
    } finally {
      setIsAnalyzing(false)
    }
  }, [conversations])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Client-side channel + date range filter
  const filteredConversations = conversations.filter((c) => {
    if (channelFilter !== 'all' && c.type !== channelFilter) return false
    if (!dateRange.from && !dateRange.to) return true
    const d = c.lastMessageDate ? new Date(c.lastMessageDate) : null
    if (!d) return false
    if (dateRange.from && d < dateRange.from) return false
    if (dateRange.to && d > dateRange.to) return false
    return true
  })

  // Metrics derived from loaded conversations
  const channelBreakdown = conversations.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] ?? 0) + 1
    return acc
  }, {})
  const topChannel = Object.entries(channelBreakdown).sort((a, b) => b[1] - a[1])[0]
  const unreadCount = conversations.filter((c) => c.unreadCount > 0).length

  const currentPageDisplay = pageIndex + 1

  // ─── Loading / no-token states ──────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-[#3A3D42] rounded-xl loading" />
          <div className="h-8 bg-[#3A3D42] rounded w-56 loading" />
        </div>
        <ConversationSkeleton />
      </div>
    )
  }

  if (hasToken === false) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-[#F0AD4E] rounded-xl flex items-center justify-center">
            <span className="text-[#1e293b] text-lg">💬</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Conversazioni CRM</h1>
            <p className="text-gray-300 mt-1">Conversazioni dal tuo CRM GoHighLevel</p>
          </div>
        </div>
        <div className="bg-[#3A3D42] rounded-xl p-8 border border-[#F0AD4E]/30 text-center">
          <div className="w-16 h-16 bg-[#F0AD4E]/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🔗</span>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">GoHighLevel non configurato</h2>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            Per visualizzare le conversazioni CRM devi prima configurare il tuo token GoHighLevel e il Location ID.
          </p>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center px-6 py-3 bg-[#F0AD4E] text-[#1e293b] rounded-lg font-medium hover:bg-[#E09A3D] transition-colors"
          >
            Vai alle Impostazioni
          </Link>
        </div>
      </div>
    )
  }

  // ─── Main UI ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-[#F0AD4E] rounded-xl flex items-center justify-center">
            <span className="text-[#1e293b] text-lg">💬</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Conversazioni CRM</h1>
            <p className="text-gray-300 mt-1">Conversazioni dal tuo CRM GoHighLevel</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || conversations.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#3A3D42] border border-[#F0AD4E]/40 text-[#F0AD4E] rounded-xl font-medium text-sm hover:bg-[#F0AD4E]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isAnalyzing ? (
              <>
                <span className="w-4 h-4 border-2 border-[#F0AD4E]/40 border-t-[#F0AD4E] rounded-full animate-spin" />
                Analisi in corso...
              </>
            ) : (
              <>🔍 Analizza opportunità</>
            )}
          </button>
          {analyzeError && (
            <p className="text-xs text-red-400">{analyzeError}</p>
          )}
          {Object.values(insights).some((i) => i.is_hot_lead) && !isAnalyzing && (
            <p className="text-xs text-[#F0AD4E]">
              🔥 {Object.values(insights).filter((i) => i.is_hot_lead).length} opportunità trovate
            </p>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#3A3D42] rounded-xl p-4 border border-[#1F2124]">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Totale</p>
          <p className="text-2xl font-bold text-white">{total}</p>
        </div>
        <div className="bg-[#3A3D42] rounded-xl p-4 border border-[#1F2124]">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Non lette</p>
          <p className="text-2xl font-bold text-[#5CB85C]">{unreadCount}</p>
        </div>
        <div className="bg-[#3A3D42] rounded-xl p-4 border border-[#1F2124]">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Canale principale</p>
          <p className="text-2xl font-bold text-[#F0AD4E]">
            {topChannel ? getChannelLabel(topChannel[0]) : '—'}
          </p>
        </div>
        <div className="bg-[#3A3D42] rounded-xl p-4 border border-[#1F2124]">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Canali attivi</p>
          <p className="text-2xl font-bold text-white">{Object.keys(channelBreakdown).length}</p>
        </div>
      </div>

      <div className={`flex gap-6 items-start`}>
        {/* Left: filters + list */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Filters */}
          <div className="bg-[#3A3D42] rounded-xl p-4 border border-[#1F2124] space-y-3">
            {/* Channel tabs */}
            <div className="flex flex-wrap gap-2">
              {CHANNEL_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setChannelFilter(f.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    channelFilter === f.value
                      ? 'bg-[#F0AD4E] text-[#1e293b]'
                      : 'bg-[#1F2124] text-gray-300 hover:text-white hover:bg-[#2C2E31]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Status + search */}
            <div className="flex gap-3 flex-wrap">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'open' | 'close')}
                className="px-3 py-2 bg-[#1F2124] border border-[#1F2124] rounded-lg text-sm text-gray-300 focus:ring-2 focus:ring-[#F0AD4E] focus:border-[#F0AD4E]"
              >
                <option value="all">Tutti gli stati</option>
                <option value="open">Aperte</option>
                <option value="close">Chiuse</option>
              </select>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cerca contatto..."
                className="flex-1 min-w-[140px] px-4 py-2 bg-[#1F2124] border border-[#1F2124] rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-[#F0AD4E] focus:border-[#F0AD4E]"
              />
            </div>

            {/* Date range */}
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* List */}
          {isFetching ? (
            <ConversationSkeleton />
          ) : filteredConversations.length === 0 ? (
            <div className="bg-[#3A3D42] rounded-xl p-8 border border-[#1F2124] text-center">
              <p className="text-gray-400">Nessuna conversazione trovata</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredConversations.map((conv) => {
                const isSelected = selectedConversation?.id === conv.id
                const displayName = conv.fullName || conv.email || conv.phone || 'Contatto sconosciuto'
                return (
                  <button
                    key={conv.id}
                    onClick={() => fetchMessages(conv)}
                    className={`w-full text-left bg-[#3A3D42] rounded-xl p-4 border transition-colors flex items-center gap-4 ${
                      isSelected
                        ? 'border-[#F0AD4E]/50 bg-[#F0AD4E]/5'
                        : 'border-[#1F2124] hover:border-[#F0AD4E]/30 hover:bg-[#3A3D42]/80'
                    }`}
                  >
                    <ContactAvatar name={conv.fullName} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-white truncate">{displayName}</span>
                        {conv.unreadCount > 0 && (
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#F0AD4E] text-[#1e293b] text-xs flex items-center justify-center font-bold">
                            {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                          </span>
                        )}
                      </div>
                      {/* Phone number if available and different from display name */}
                      {conv.phone && conv.phone !== displayName && (
                        <p className="text-xs text-gray-500 mb-0.5">{conv.phone}</p>
                      )}
                      <p className="text-sm text-gray-400 truncate">
                        {conv.lastMessageBody ?? 'Nessun messaggio'}
                      </p>
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                      <span className="text-xs text-gray-500">{formatDate(conv.lastMessageDate)}</span>
                      <ChannelBadge type={conv.type} />
                      {insights[conv.id]?.is_hot_lead && (
                        <div className="group relative">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                            🔥 Opportunità
                          </span>
                          {/* Tooltip */}
                          <div className="absolute right-0 top-full mt-1 w-56 bg-[#1F2124] border border-[#3A3D42] rounded-lg p-3 text-xs text-gray-300 shadow-xl z-10 hidden group-hover:block">
                            {insights[conv.id].missing_action && (
                              <p className="mb-1"><span className="text-orange-400 font-medium">Manca:</span> {insights[conv.id].missing_action}</p>
                            )}
                            {insights[conv.id].suggested_followup && (
                              <p><span className="text-[#F0AD4E] font-medium">Suggerimento:</span> {insights[conv.id].suggested_followup}</p>
                            )}
                            <p className="mt-1.5 text-gray-500">Score: {insights[conv.id].intent_score}/100</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-gray-400">
              Pagina {currentPageDisplay} · {filteredConversations.length} risultati
              {(dateRange.from || dateRange.to || channelFilter !== 'all') && conversations.length !== filteredConversations.length && (
                <span className="text-[#F0AD4E] ml-1">
                  ({conversations.length - filteredConversations.length} nascosti dai filtri)
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handlePrevPage}
                disabled={pageIndex === 0 || isFetching}
                className="px-4 py-2 rounded-lg bg-[#3A3D42] border border-[#1F2124] text-sm text-gray-300 disabled:opacity-40 hover:border-[#F0AD4E]/40 transition-colors"
              >
                ← Precedente
              </button>
              <button
                onClick={handleNextPage}
                disabled={!hasMore || isFetching}
                className="px-4 py-2 rounded-lg bg-[#3A3D42] border border-[#1F2124] text-sm text-gray-300 disabled:opacity-40 hover:border-[#F0AD4E]/40 transition-colors"
              >
                Successiva →
              </button>
            </div>
          </div>
        </div>

        {/* Right: chat panel */}
        {selectedConversation && (
          <div
            className="w-full md:w-[400px] flex-shrink-0 bg-[#3A3D42] rounded-xl border border-[#1F2124] flex flex-col sticky top-20"
            style={{ height: '72vh' }}
          >
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1F2124]">
              <ContactAvatar name={selectedConversation.fullName} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white truncate">
                  {selectedConversation.fullName || selectedConversation.email || selectedConversation.phone || 'Contatto sconosciuto'}
                </p>
                {selectedConversation.phone && (
                  <p className="text-xs text-gray-400 truncate">{selectedConversation.phone}</p>
                )}
                <div className="mt-0.5">
                  <ChannelBadge type={selectedConversation.type} />
                </div>
              </div>
              <button
                onClick={() => { setSelectedConversation(null); setMessages([]) }}
                className="text-gray-400 hover:text-white transition-colors text-lg leading-none px-1 flex-shrink-0"
                aria-label="Chiudi chat"
              >
                ✕
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-400 text-sm">Caricamento messaggi...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-500 text-sm">Nessun messaggio</p>
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
