'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import { useAuth } from '@/app/components/AuthProvider'
import { pageCache } from '@/app/lib/pageCache'
import Link from 'next/link'
import DateRangePicker from '@/app/components/DateRangePicker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const dynamicParams = true

type Stats = {
  date: string
  leads: number
  conversations: number
}

type DateRange = {
  from: Date | null
  to: Date | null
}

type ServiceFilter = 'all' | 'chatbot' | 'ai-calls'

type UserServices = {
  has_chatbot: boolean
  has_ai_calls: boolean
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth()
  const [stats, setStats] = useState<Stats[]>([])
  const [totalLeads, setTotalLeads] = useState(0)
  const [totalConvs, setTotalConvs] = useState(0)
  const [dataLoading, setDataLoading] = useState(false)
  const isLoading = authLoading || dataLoading
  const fetchIdRef = useRef(0)

  // Safety net: force dataLoading false after 12s to prevent infinite skeleton.
  useEffect(() => {
    if (!dataLoading) return
    const t = setTimeout(() => setDataLoading(false), 12_000)
    return () => clearTimeout(t)
  }, [dataLoading])
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>('all')
  const [userServices, setUserServices] = useState<UserServices>({ has_chatbot: true, has_ai_calls: false })
  const [dateRange, setDateRange] = useState<DateRange>({
    from: (() => {
      const date = new Date()
      date.setDate(date.getDate() - 6)
      date.setHours(0, 0, 0, 0)
      return date
    })(),
    to: (() => {
      const date = new Date()
      date.setHours(23, 59, 59, 999)
      return date
    })()
  })

  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('user_services')
      .select('has_chatbot, has_ai_calls')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setUserServices(data) })
  }, [user?.id])

  const fetchStats = useCallback(async () => {
    if (!user?.id || !dateRange.from || !dateRange.to) return

    const myId = ++fetchIdRef.current

    const cacheKey = `dashboard:${user.id}:${dateRange.from.toISOString().slice(0,10)}:${dateRange.to.toISOString().slice(0,10)}`
    const cached = pageCache.get<{ stats: Stats[]; totalLeads: number; totalConvs: number }>(cacheKey)
    if (cached) {
      setStats(cached.stats)
      setTotalLeads(cached.totalLeads)
      setTotalConvs(cached.totalConvs)
      setDataLoading(false)
    }

    try {
      if (!cached) setDataLoading(true)

      const [leadsRes, convsRes] = await Promise.all([
        supabase.from('leads')
          .select('created_at', { count: 'exact' })
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString())
          .eq('user_id', user.id),
        supabase.from('conversations')
          .select('created_at', { count: 'exact' })
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString())
          .eq('user_id', user.id)
      ])

      // A newer fetch was started — discard these stale results.
      if (fetchIdRef.current !== myId) return

      if (leadsRes.error || convsRes.error) {
        console.error(leadsRes.error || convsRes.error)
        return
      }

      const format = (date: Date) => date.toISOString().slice(0, 10)
      const range: Stats[] = []
      const current = new Date(dateRange.from)

      while (current <= dateRange.to) {
        range.push({ date: format(current), leads: 0, conversations: 0 })
        current.setDate(current.getDate() + 1)
      }

      const countByDay = (arr: any[]) => {
        return arr.reduce((acc, curr) => {
          const d = format(new Date(curr.created_at))
          acc[d] = (acc[d] || 0) + 1
          return acc
        }, {} as Record<string, number>)
      }

      const leadCount = countByDay(leadsRes.data || [])
      const convCount = countByDay(convsRes.data || [])

      const updated = range.map(day => ({
        date: day.date,
        leads: leadCount[day.date] || 0,
        conversations: convCount[day.date] || 0,
      }))

      setStats(updated)
      setTotalLeads(leadsRes.count || 0)
      setTotalConvs(convsRes.count || 0)
      pageCache.set(cacheKey, { stats: updated, totalLeads: leadsRes.count || 0, totalConvs: convsRes.count || 0 })
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      if (fetchIdRef.current === myId) setDataLoading(false)
    }
  }, [user?.id, dateRange])

  useEffect(() => {
    if (user?.id) fetchStats()
  }, [fetchStats, user?.id])

  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('it-IT', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    })
  }, [])

  const formatDateRange = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return 'Seleziona periodo'
    return `${dateRange.from.toLocaleDateString('it-IT')} - ${dateRange.to.toLocaleDateString('it-IT')}`
  }, [dateRange])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-[#3A3D42] rounded-lg loading"></div>
          <div className="h-8 bg-[#3A3D42] rounded w-48 loading"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
              <div className="h-4 bg-[#1F2124] rounded w-24 mb-3 loading"></div>
              <div className="h-8 bg-[#1F2124] rounded w-16 loading"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-[#F0AD4E] rounded-xl flex items-center justify-center">
            <span className="text-[#1e293b] text-lg">📊</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-gray-300 mt-1">Panoramica delle tue attività</p>
          </div>
        </div>

        <div className="sm:w-80">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Periodo di analisi
          </label>
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
          />
        </div>
      </div>

      <div className="bg-[#3A3D42] rounded-xl p-4 shadow-sm border border-[#1F2124]">
        <div className="flex items-center space-x-4">
          <label className="text-sm font-medium text-gray-300">Filtra per servizio:</label>
          <div className="flex space-x-2">
            <button
              onClick={() => setServiceFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                serviceFilter === 'all'
                  ? 'bg-[#F0AD4E] text-[#1e293b]'
                  : 'bg-[#1F2124] text-gray-300 hover:bg-[#3A3D42] hover:text-[#F0AD4E]'
              }`}
            >
              Tutti i Servizi
            </button>
            {userServices.has_chatbot && (
              <button
                onClick={() => setServiceFilter('chatbot')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  serviceFilter === 'chatbot'
                    ? 'bg-[#F0AD4E] text-[#1e293b]'
                    : 'bg-[#1F2124] text-gray-300 hover:bg-[#3A3D42] hover:text-[#F0AD4E]'
                }`}
              >
                Chatbot
              </button>
            )}
            {userServices.has_ai_calls && (
              <button
                onClick={() => setServiceFilter('ai-calls')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  serviceFilter === 'ai-calls'
                    ? 'bg-[#F0AD4E] text-[#1e293b]'
                    : 'bg-[#1F2124] text-gray-300 hover:bg-[#3A3D42] hover:text-[#F0AD4E]'
                }`}
              >
                Chiamate IA
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {(serviceFilter === 'all' || serviceFilter === 'chatbot') && userServices.has_chatbot && (
          <>
            <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124] card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">Totale Lead</p>
                  <p className="text-3xl font-bold text-white mt-2">{totalLeads}</p>
                  <p className="text-sm text-gray-400 mt-1">{formatDateRange}</p>
                </div>
                <div className="w-12 h-12 bg-[#F0AD4E]/20 rounded-lg flex items-center justify-center">
                  <span className="text-[#F0AD4E] text-xl">📇</span>
                </div>
              </div>
            </div>

            <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124] card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-400 uppercase tracking-wide">Conversazioni</p>
                  <p className="text-3xl font-bold text-white mt-2">{totalConvs}</p>
                  <p className="text-sm text-gray-400 mt-1">{formatDateRange}</p>
                </div>
                <div className="w-12 h-12 bg-[#3A3D42] rounded-lg flex items-center justify-center border border-[#1F2124]">
                  <span className="text-gray-300 text-xl">💬</span>
                </div>
              </div>
            </div>

            <Link
              href="/dashboard/leads"
              className="bg-[#F0AD4E] rounded-xl p-6 text-[#1e293b] card-hover group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#1e293b]/80 uppercase tracking-wide">Gestisci</p>
                  <p className="text-xl font-bold mt-2 group-hover:scale-105 transition-transform">I tuoi Lead</p>
                  <p className="text-sm text-[#1e293b]/70 mt-1">Visualizza e esporta</p>
                </div>
                <div className="w-12 h-12 bg-[#1e293b]/20 rounded-lg flex items-center justify-center group-hover:bg-[#1e293b]/30 transition-colors">
                  <span className="text-2xl">📥</span>
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/conversations"
              className="bg-[#F0AD4E] rounded-xl p-6 text-[#1e293b] card-hover group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[#1e293b]/80 uppercase tracking-wide">Analizza</p>
                  <p className="text-xl font-bold mt-2 group-hover:scale-105 transition-transform">Conversazioni</p>
                  <p className="text-sm text-[#1e293b]/70 mt-1">Per sessione</p>
                </div>
                <div className="w-12 h-12 bg-[#1e293b]/20 rounded-lg flex items-center justify-center group-hover:bg-[#1e293b]/30 transition-colors">
                  <span className="text-2xl">🔍</span>
                </div>
              </div>
            </Link>
          </>
        )}

        {(serviceFilter === 'all' || serviceFilter === 'ai-calls') && userServices.has_ai_calls && (
          <Link
            href="/dashboard/ai-calls"
            className="bg-[#F0AD4E] rounded-xl p-6 text-[#1e293b] card-hover group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#1e293b]/80 uppercase tracking-wide">Gestisci</p>
                <p className="text-xl font-bold mt-2 group-hover:scale-105 transition-transform">Chiamate IA</p>
                <p className="text-sm text-[#1e293b]/70 mt-1">ElevenLabs</p>
              </div>
              <div className="w-12 h-12 bg-[#1e293b]/20 rounded-lg flex items-center justify-center group-hover:bg-[#1e293b]/30 transition-colors">
                <span className="text-2xl">📞</span>
              </div>
            </div>
          </Link>
        )}

        {!userServices.has_chatbot && !userServices.has_ai_calls && (
          <div className="col-span-full bg-[#3A3D42] rounded-xl p-12 text-center border border-[#1F2124]">
            <p className="text-gray-300 mb-4">Nessun servizio attivo configurato</p>
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center px-6 py-3 bg-[#F0AD4E] text-[#1e293b] rounded-lg font-medium hover:bg-[#E09A3D] transition-colors shadow-lg"
            >
              Vai alle Impostazioni
            </Link>
          </div>
        )}
      </div>

      {(serviceFilter === 'all' || serviceFilter === 'chatbot') && userServices.has_chatbot && (
        <div className="bg-[#3A3D42] rounded-xl shadow-sm border border-[#1F2124] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#1F2124]">
            <h2 className="text-lg font-semibold text-white">Attività per periodo - Chatbot</h2>
            <p className="text-sm text-gray-400 mt-1">Riepilogo giornaliero di lead e conversazioni per {formatDateRange}</p>
          </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-[#1F2124]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Data
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Lead
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Conversazioni
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Attività
                </th>
              </tr>
            </thead>
            <tbody className="bg-[#3A3D42] divide-y divide-[#1F2124]">
              {stats.map((stat, index) => (
                <tr key={index} className="table-row">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-white">
                      {formatDate(stat.date)}
                    </div>
                    <div className="text-sm text-gray-400">
                      {stat.date}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F0AD4E]/20 text-[#F0AD4E] border border-[#F0AD4E]/30">
                        {stat.leads}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#5CB85C]/20 text-[#5CB85C] border border-[#5CB85C]/30">
                        {stat.conversations}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex space-x-1">
                      {stat.leads > 0 && (
                        <div className="w-2 h-2 bg-[#F0AD4E] rounded-full"></div>
                      )}
                      {stat.conversations > 0 && (
                        <div className="w-2 h-2 bg-[#5CB85C] rounded-full"></div>
                      )}
                      {stat.leads === 0 && stat.conversations === 0 && (
                        <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  )
}
