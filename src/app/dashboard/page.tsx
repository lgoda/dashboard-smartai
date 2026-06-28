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

// ── Inline single-stroke icons (no icon dependency) ──────────────────────────
type IconProps = { className?: string }
const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}
const Users = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
)
const MessageSquare = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" {...stroke}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
)
const ArrowUpRight = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M7 7h10v10" /></svg>
)
const TrendingUp = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M7 7h10v10" /></svg>
)

// ── Real-data derivations for the readouts ───────────────────────────────────
function sparkPoints(series: number[], w = 84, h = 26, pad = 3): string {
  if (series.length === 0) return ''
  const max = Math.max(1, ...series)
  const n = series.length
  return series
    .map((v, i) => {
      const x = n === 1 ? w / 2 : (i / (n - 1)) * w
      const y = pad + (1 - v / max) * (h - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

// First half vs second half of the period — a real, defensible trend figure.
// Returns null when the period is too short or the baseline is zero.
function trendDelta(series: number[]): number | null {
  if (series.length < 4) return null
  const mid = Math.floor(series.length / 2)
  const first = series.slice(0, mid).reduce((a, b) => a + b, 0)
  const second = series.slice(mid).reduce((a, b) => a + b, 0)
  if (first === 0) return null
  return Math.round(((second - first) / first) * 100)
}

function Readout({
  label,
  value,
  series,
  delta,
  color,
  icon,
}: {
  label: string
  value: number
  series: number[]
  delta: number | null
  color: string
  icon: React.ReactNode
}) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-[18px]">
      <div className="font-mono text-[10.5px] tracking-[.12em] uppercase text-[var(--mute)] flex items-center gap-2">
        <span className="text-[var(--mute-2)]">{icon}</span>
        {label}
      </div>
      <div className="font-mono font-semibold text-[38px] leading-none tracking-tight mt-3.5 tabular-nums text-[var(--text)]">
        {value}
      </div>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--line-soft)]">
        {delta === null ? (
          <span className="font-mono text-[12px] text-[var(--mute-2)]">—</span>
        ) : (
          <span
            className="font-mono text-[12px] flex items-center gap-1"
            style={{ color: delta >= 0 ? 'var(--live)' : '#F87171' }}
          >
            <TrendingUp className={`w-3 h-3 ${delta >= 0 ? '' : 'rotate-90'}`} />
            {delta >= 0 ? '+' : ''}{delta}%
          </span>
        )}
        <svg width="84" height="26" viewBox="0 0 84 26" fill="none" aria-hidden="true">
          <polyline points={sparkPoints(series)} stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}

function ActionCard({ href, kicker, title, desc }: { href: string; kicker: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-[18px] flex flex-col justify-between min-h-[128px] transition-all duration-200 hover:border-[rgba(245,158,11,0.55)] hover:-translate-y-0.5 hover:bg-[rgba(245,158,11,0.05)] group"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-[10.5px] tracking-[.12em] uppercase text-[var(--mute)]">{kicker}</div>
          <div className="font-display font-semibold text-[19px] tracking-tight mt-0.5 text-[var(--text)]">{title}</div>
          <div className="text-[12.5px] text-[var(--mute)] mt-0.5">{desc}</div>
        </div>
        <span className="w-8 h-8 rounded-[9px] grid place-items-center bg-[rgba(245,158,11,0.12)] text-[var(--amber)] border border-[rgba(245,158,11,0.25)] group-hover:bg-[rgba(245,158,11,0.2)] transition-colors">
          <ArrowUpRight className="w-4 h-4" />
        </span>
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const { user, loading: authLoading, accessToken } = useAuth()
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
      .then(({ data }) => { if (data) setUserServices(data) }, () => {})
  }, [user?.id])

  const fetchStats = useCallback(async () => {
    if (!user?.id || !accessToken || !dateRange.from || !dateRange.to) return

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
  }, [user?.id, accessToken, dateRange])

  useEffect(() => {
    if (user?.id && accessToken) fetchStats()
  }, [fetchStats, user?.id, accessToken])

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

  // ── Real-data derivations (all from `stats`, no invented figures) ──────────
  const leadsSeries = useMemo(() => stats.map(s => s.leads), [stats])
  const convsSeries = useMemo(() => stats.map(s => s.conversations), [stats])
  const maxLeads = useMemo(() => Math.max(1, ...leadsSeries), [leadsSeries])
  const maxConvs = useMemo(() => Math.max(1, ...convsSeries), [convsSeries])
  const leadsDelta = useMemo(() => trendDelta(leadsSeries), [leadsSeries])
  const convsDelta = useMemo(() => trendDelta(convsSeries), [convsSeries])
  const todayISO = new Date().toISOString().slice(0, 10)
  const todayStat = useMemo(() => stats.find(s => s.date === todayISO), [stats, todayISO])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="h-9 bg-[var(--surface)] rounded-lg w-48 loading"></div>
        </div>
        <div className="h-[52px] bg-[var(--surface)] rounded-2xl loading border border-[var(--line)]"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[var(--surface)] rounded-2xl p-[18px] border border-[var(--line)]">
              <div className="h-3 bg-[var(--surface-2)] rounded w-24 mb-4 loading"></div>
              <div className="h-9 bg-[var(--surface-2)] rounded w-16 loading"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
        <div>
          <h1 className="font-display font-bold text-[34px] leading-[1.05] tracking-tight text-[var(--text)]">Dashboard</h1>
          <p className="text-[var(--mute)] text-sm mt-1.5">Panoramica delle tue attività</p>
        </div>

        <div className="sm:w-80">
          <label className="block font-mono text-[10.5px] tracking-[.16em] uppercase text-[var(--mute-2)] mb-1.5">
            Periodo
          </label>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {/* Signature: live / today signal strip — derived from real data only */}
      {todayStat ? (
        <div className="signal-top relative overflow-hidden bg-[var(--surface)] border border-[var(--line)] rounded-2xl px-[18px] py-[15px] flex items-center gap-5 flex-wrap">
          <span className="flex items-center gap-2.5 font-mono text-[11.5px] tracking-[.14em] uppercase text-[var(--live)]">
            <span className="live-dot" />
            Oggi
          </span>
          <span className="flex items-baseline gap-2 text-[13.5px] text-[var(--mute)]">
            <b className="font-mono font-semibold text-[15px] text-[var(--text)] tabular-nums">{todayStat.leads}</b> lead
          </span>
          <span className="w-px h-5 bg-[var(--line)]" />
          <span className="flex items-baseline gap-2 text-[13.5px] text-[var(--mute)]">
            <b className="font-mono font-semibold text-[15px] text-[var(--text)] tabular-nums">{todayStat.conversations}</b> conversazioni
          </span>
          <span className="eq ml-auto" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        </div>
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl px-[18px] py-[15px] flex items-center gap-5 flex-wrap">
          <span className="font-mono text-[11.5px] tracking-[.14em] uppercase text-[var(--mute-2)]">Periodo</span>
          <span className="flex items-baseline gap-2 text-[13.5px] text-[var(--mute)]">
            <b className="font-mono font-semibold text-[15px] text-[var(--text)] tabular-nums">{totalLeads}</b> lead
          </span>
          <span className="w-px h-5 bg-[var(--line)]" />
          <span className="flex items-baseline gap-2 text-[13.5px] text-[var(--mute)]">
            <b className="font-mono font-semibold text-[15px] text-[var(--text)] tabular-nums">{totalConvs}</b> conversazioni
          </span>
        </div>
      )}

      {/* Service filter — segmented console control */}
      <div className="flex items-center gap-3.5 flex-wrap">
        <span className="font-mono text-[10.5px] tracking-[.16em] uppercase text-[var(--mute-2)]">Servizio</span>
        <div className="inline-flex bg-[var(--surface)] border border-[var(--line)] rounded-xl p-[3px]">
          {([
            { key: 'all', label: 'Tutti i servizi', show: true },
            { key: 'chatbot', label: 'Chatbot', show: userServices.has_chatbot },
            { key: 'ai-calls', label: 'Chiamate IA', show: userServices.has_ai_calls },
          ] as const).filter(t => t.show).map(t => (
            <button
              key={t.key}
              onClick={() => setServiceFilter(t.key)}
              className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                serviceFilter === t.key
                  ? 'bg-[rgba(245,158,11,0.12)] text-[var(--amber)]'
                  : 'text-[var(--mute)] hover:text-[var(--text)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Readouts + actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {(serviceFilter === 'all' || serviceFilter === 'chatbot') && userServices.has_chatbot && (
          <>
            <Readout
              label={`Totale lead · ${stats.length}g`}
              value={totalLeads}
              series={leadsSeries}
              delta={leadsDelta}
              color="#F59E0B"
              icon={<Users className="w-3.5 h-3.5" />}
            />
            <Readout
              label={`Conversazioni · ${stats.length}g`}
              value={totalConvs}
              series={convsSeries}
              delta={convsDelta}
              color="#22C55E"
              icon={<MessageSquare className="w-3.5 h-3.5" />}
            />
            <ActionCard href="/dashboard/leads" kicker="Gestisci" title="I tuoi lead" desc="Visualizza ed esporta" />
            <ActionCard href="/dashboard/conversations" kicker="Analizza" title="Conversazioni" desc="Per sessione" />
          </>
        )}

        {(serviceFilter === 'all' || serviceFilter === 'ai-calls') && userServices.has_ai_calls && (
          <ActionCard href="/dashboard/ai-calls" kicker="Gestisci" title="Chiamate IA" desc="ElevenLabs" />
        )}

        {!userServices.has_chatbot && !userServices.has_ai_calls && (
          <div className="col-span-full bg-[var(--surface)] rounded-2xl p-12 text-center border border-[var(--line)]">
            <p className="text-[var(--mute)] mb-4">Nessun servizio attivo configurato</p>
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center px-6 py-3 bg-[var(--amber)] text-[#1b1d20] rounded-lg font-semibold hover:bg-[var(--amber-deep)] transition-colors"
            >
              Vai alle Impostazioni
            </Link>
          </div>
        )}
      </div>

      {/* Activity table */}
      {(serviceFilter === 'all' || serviceFilter === 'chatbot') && userServices.has_chatbot && (
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--line-soft)] flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display font-semibold text-[16px] tracking-tight text-[var(--text)]">Attività per periodo — Chatbot</h2>
              <p className="text-[12.5px] text-[var(--mute)] mt-0.5">Riepilogo giornaliero di lead e conversazioni · {formatDateRange}</p>
            </div>
            <div className="hidden sm:flex gap-4 font-mono text-[11.5px] text-[var(--mute)]">
              <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm" style={{ background: '#F59E0B' }} />Lead</span>
              <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm" style={{ background: '#22C55E' }} />Conversazioni</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="bg-[#191B1F]">
                  <th className="px-5 py-3 text-left font-mono text-[10.5px] tracking-[.1em] uppercase text-[var(--mute-2)] font-medium">Data</th>
                  <th className="px-5 py-3 text-right font-mono text-[10.5px] tracking-[.1em] uppercase text-[var(--mute-2)] font-medium">Lead</th>
                  <th className="px-5 py-3 text-right font-mono text-[10.5px] tracking-[.1em] uppercase text-[var(--mute-2)] font-medium">Conversazioni</th>
                  <th className="px-5 py-3 text-right font-mono text-[10.5px] tracking-[.1em] uppercase text-[var(--mute-2)] font-medium">Attività</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat, index) => {
                  const isToday = stat.date === todayISO
                  return (
                    <tr
                      key={index}
                      className={`border-t border-[var(--line-soft)] transition-colors hover:bg-[var(--surface-2)] ${isToday ? 'signal-top relative' : ''}`}
                      style={isToday ? { background: 'linear-gradient(90deg, rgba(245,158,11,0.06), transparent 40%)' } : undefined}
                    >
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isToday && <span className="w-1.5 h-1.5 rounded-full bg-[var(--amber)] shadow-[0_0_0_3px_rgba(245,158,11,0.15)]" />}
                          <span className="text-sm font-medium text-[var(--text)]">{formatDate(stat.date)}</span>
                          <span className="font-mono text-[11.5px] text-[var(--mute-2)]">{isToday ? 'oggi' : stat.date}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap font-mono tabular-nums text-sm">
                        <span style={{ color: stat.leads > 0 ? 'var(--amber)' : 'var(--mute-2)' }}>{stat.leads}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap font-mono tabular-nums text-sm">
                        <span style={{ color: stat.conversations > 0 ? 'var(--live)' : 'var(--mute-2)' }}>{stat.conversations}</span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex flex-col gap-1 items-end">
                          <div className="w-20 h-1.5 rounded-full bg-[var(--line-soft)] overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(stat.leads / maxLeads) * 100}%`, background: '#F59E0B' }} />
                          </div>
                          <div className="w-20 h-1.5 rounded-full bg-[var(--line-soft)] overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(stat.conversations / maxConvs) * 100}%`, background: '#22C55E' }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
