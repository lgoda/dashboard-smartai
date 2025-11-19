'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import Link from 'next/link'
import DateRangePicker from '@/app/components/DateRangePicker'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

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
  const [userId, setUserId] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats[]>([])
  const [totalLeads, setTotalLeads] = useState(0)
  const [totalConvs, setTotalConvs] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
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
    const initUser = async () => {
      try {
        const { data: session } = await supabase.auth.getUser()
        const user = session?.user
        if (!user) return
        setUserId(user.id)

        const { data: servicesData } = await supabase
          .from('user_services')
          .select('has_chatbot, has_ai_calls')
          .eq('user_id', user.id)
          .maybeSingle()

        if (servicesData) {
          setUserServices(servicesData)
        }
      } catch (error) {
        console.error('Error initializing user:', error)
      }
    }
    initUser()
  }, [])

  const fetchStats = useCallback(async () => {
    if (!userId || !dateRange.from || !dateRange.to) return

    try {
      setIsLoading(true)

      const [leadsRes, convsRes] = await Promise.all([
        supabase.from('leads')
          .select('created_at', { count: 'exact' })
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString())
          .eq('user_id', userId),
        supabase.from('conversations')
          .select('created_at', { count: 'exact' })
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString())
          .eq('user_id', userId)
      ])

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
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setIsLoading(false)
    }
  }, [userId, dateRange])

  useEffect(() => {
    if (userId) {
      fetchStats()
    }
  }, [fetchStats, userId])

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
          <div className="w-8 h-8 bg-slate-200 rounded-lg loading"></div>
          <div className="h-8 bg-slate-200 rounded w-48 loading"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <div className="h-4 bg-slate-200 rounded w-24 mb-3 loading"></div>
              <div className="h-8 bg-slate-200 rounded w-16 loading"></div>
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
          <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-orange-500 rounded-xl flex items-center justify-center">
            <span className="text-white text-lg">📊</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-600 mt-1">Panoramica delle tue attività</p>
          </div>
        </div>

        <div className="sm:w-80">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Periodo di analisi
          </label>
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex items-center space-x-4">
          <label className="text-sm font-medium text-slate-700">Filtra per servizio:</label>
          <div className="flex space-x-2">
            <button
              onClick={() => setServiceFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                serviceFilter === 'all'
                  ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-orange-50 hover:text-orange-600'
              }`}
            >
              Tutti i Servizi
            </button>
            {userServices.has_chatbot && (
              <button
                onClick={() => setServiceFilter('chatbot')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  serviceFilter === 'chatbot'
                    ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-orange-50 hover:text-orange-600'
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
                    ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-orange-50 hover:text-orange-600'
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
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Totale Lead</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">{totalLeads}</p>
                  <p className="text-sm text-slate-500 mt-1">{formatDateRange}</p>
                </div>
                <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
                  <span className="text-pink-600 text-xl">📇</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Conversazioni</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">{totalConvs}</p>
                  <p className="text-sm text-slate-500 mt-1">{formatDateRange}</p>
                </div>
                <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                  <span className="text-slate-600 text-xl">💬</span>
                </div>
              </div>
            </div>

            <Link
              href="/dashboard/leads"
              className="bg-gradient-to-br from-pink-500 to-orange-500 rounded-xl p-6 text-white card-hover group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-pink-100 uppercase tracking-wide">Gestisci</p>
                  <p className="text-xl font-bold mt-2 group-hover:scale-105 transition-transform">I tuoi Lead</p>
                  <p className="text-sm text-pink-100 mt-1">Visualizza e esporta</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center group-hover:bg-white/30 transition-colors">
                  <span className="text-2xl">📥</span>
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/conversations"
              className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl p-6 text-white card-hover group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-100 uppercase tracking-wide">Analizza</p>
                  <p className="text-xl font-bold mt-2 group-hover:scale-105 transition-transform">Conversazioni</p>
                  <p className="text-sm text-amber-100 mt-1">Per sessione</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center group-hover:bg-white/30 transition-colors">
                  <span className="text-2xl">🔍</span>
                </div>
              </div>
            </Link>
          </>
        )}

        {(serviceFilter === 'all' || serviceFilter === 'ai-calls') && userServices.has_ai_calls && (
          <Link
            href="/dashboard/ai-calls"
            className="bg-gradient-to-br from-amber-500 to-yellow-500 rounded-xl p-6 text-white card-hover group"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-100 uppercase tracking-wide">Gestisci</p>
                <p className="text-xl font-bold mt-2 group-hover:scale-105 transition-transform">Chiamate IA</p>
                <p className="text-sm text-amber-100 mt-1">ElevenLabs</p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center group-hover:bg-white/30 transition-colors">
                <span className="text-2xl">📞</span>
              </div>
            </div>
          </Link>
        )}

        {!userServices.has_chatbot && !userServices.has_ai_calls && (
          <div className="col-span-full bg-slate-50 rounded-xl p-12 text-center border border-slate-200">
            <p className="text-slate-600 mb-4">Nessun servizio attivo configurato</p>
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-lg font-medium hover:from-pink-600 hover:to-orange-600 transition-colors shadow-lg"
            >
              Vai alle Impostazioni
            </Link>
          </div>
        )}
      </div>

      {(serviceFilter === 'all' || serviceFilter === 'chatbot') && userServices.has_chatbot && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Attività per periodo - Chatbot</h2>
            <p className="text-sm text-slate-600 mt-1">Riepilogo giornaliero di lead e conversazioni per {formatDateRange}</p>
          </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Data
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Lead
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Conversazioni
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Attività
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {stats.map((stat, index) => (
                <tr key={index} className="table-row">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-900">
                      {formatDate(stat.date)}
                    </div>
                    <div className="text-sm text-slate-500">
                      {stat.date}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-pink-100 text-pink-800">
                        {stat.leads}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        {stat.conversations}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex space-x-1">
                      {stat.leads > 0 && (
                        <div className="w-2 h-2 bg-pink-400 rounded-full"></div>
                      )}
                      {stat.conversations > 0 && (
                        <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                      )}
                      {stat.leads === 0 && stat.conversations === 0 && (
                        <div className="w-2 h-2 bg-slate-300 rounded-full"></div>
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
