'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/app/lib/supabaseClient'
import { useAuth } from '@/app/components/AuthProvider'
import DateRangePicker from '@/app/components/DateRangePicker'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

type DateRange = { from: Date | null; to: Date | null }

type DayBucket = { date: string; eur: number; calls: number; seconds: number }

type Summary = {
  total_eur: number
  total_calls: number
  total_seconds: number
  by_day: DayBucket[]
  generated_at: string
  no_agents?: boolean
}

const REFRESH_MS = 60_000

// ── Period presets ────────────────────────────────────────────────────────────

function todayRange(): DateRange {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  return { from: start, to: end }
}

// Current weekend if today is Sat/Sun, otherwise the most recent past weekend.
function weekendRange(): DateRange {
  const now = new Date()
  const dow = now.getDay() // 0 Sun .. 6 Sat
  const sat = new Date(now)
  if (dow === 6) sat.setDate(now.getDate())
  else if (dow === 0) sat.setDate(now.getDate() - 1)
  else sat.setDate(now.getDate() - (dow + 1))
  sat.setHours(0, 0, 0, 0)
  const sun = new Date(sat)
  sun.setDate(sat.getDate() + 1)
  sun.setHours(23, 59, 59, 999)
  return { from: sat, to: sun }
}

function thisWeekRange(): DateRange {
  const now = new Date()
  const dow = now.getDay() // 0 Sun .. 6 Sat
  const monOffset = dow === 0 ? 6 : dow - 1 // days since Monday
  const mon = new Date(now)
  mon.setDate(now.getDate() - monOffset)
  mon.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return { from: mon, to: end }
}

function lastNDays(n: number): DateRange {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const start = new Date()
  start.setDate(start.getDate() - (n - 1))
  start.setHours(0, 0, 0, 0)
  return { from: start, to: end }
}

function thisMonthRange(): DateRange {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  first.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return { from: first, to: end }
}

const PRESETS = [
  { label: 'Oggi', value: todayRange },
  { label: 'Fine settimana', value: weekendRange },
  { label: 'Questa settimana', value: thisWeekRange },
  { label: 'Ultimi 7 giorni', value: () => lastNDays(7) },
  { label: 'Questo mese', value: thisMonthRange },
]

// ── Formatters ────────────────────────────────────────────────────────────────

const euro = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })

function durationLabel(totalSeconds: number) {
  const sec = Math.round(totalSeconds)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m} min ${s}s`
  return `${s}s`
}

function dayLabel(isoDate: string) {
  // isoDate is YYYY-MM-DD; parse as local date
  const [y, mo, d] = isoDate.split('-').map(Number)
  const date = new Date(y, mo - 1, d)
  return date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConsumoPage() {
  const { user, accessToken, loading: authLoading } = useAuth()

  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [range, setRange] = useState<DateRange>(todayRange())
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const fetchIdRef = useRef(0)

  // Gate: is the Consumo view enabled for this user?
  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('user_services')
      .select('has_consumo')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setEnabled(!!data?.has_consumo), () => setEnabled(false))
  }, [user?.id])

  const fetchSummary = useCallback(async (silent = false) => {
    if (!accessToken || !range.from || !range.to) return
    const myId = ++fetchIdRef.current
    if (!silent) setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        from: String(range.from.getTime()),
        to: String(range.to.getTime()),
      })
      const r = await fetch(`/api/consumo/summary?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (fetchIdRef.current !== myId) return
      const j = await r.json()
      if (!r.ok) {
        // Keep the last good data on screen (e.g. transient Retell throttling).
        setError(j.error || 'Errore caricamento dati')
      } else {
        setSummary(j)
        setLastRefresh(new Date())
      }
    } catch {
      if (fetchIdRef.current === myId) setError('Errore di rete')
    } finally {
      if (fetchIdRef.current === myId) setLoading(false)
    }
  }, [accessToken, range])

  // Refetch on range change.
  useEffect(() => {
    if (enabled) fetchSummary()
  }, [enabled, fetchSummary])

  // Auto-refresh (near-real-time).
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => fetchSummary(true), REFRESH_MS)
    return () => clearInterval(id)
  }, [enabled, fetchSummary])

  if (authLoading || enabled === null) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-[var(--surface)] rounded w-48 loading" />
        <div className="h-40 bg-[var(--surface)] rounded-2xl loading" />
      </div>
    )
  }

  if (!enabled) {
    return (
      <div className="bg-[var(--surface)] rounded-2xl p-12 text-center border border-[var(--line)]">
        <p className="text-gray-300 mb-2">Pagina non disponibile</p>
        <p className="text-sm text-gray-500 mb-6">La vista Consumo non è attiva per il tuo account.</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center px-5 py-2.5 bg-[#F59E0B] text-[#1e293b] rounded-lg font-medium hover:bg-[#D97706] transition-colors"
        >
          Torna alla Dashboard
        </Link>
      </div>
    )
  }

  const maxDayEur = summary?.by_day.reduce((m, d) => Math.max(m, d.eur), 0) ?? 0

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Consumo</h1>
          <p className="text-gray-400 text-sm mt-1">Costo reale del servizio AI per periodo</p>
        </div>
        <div className="sm:w-72">
          <DateRangePicker value={range} onChange={setRange} presets={PRESETS} />
        </div>
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm bg-red-500/10 text-red-400 border border-red-500/20">
          {error}
        </div>
      )}

      {/* Total spend — live auto-refreshing figure, carries the signal motif */}
      <div className="signal-top relative rounded-2xl border bg-[var(--surface)] border-[var(--line)] overflow-hidden">
        <div className="p-6 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-[10.5px] text-[var(--mute)] uppercase tracking-[.14em]">Speso nel periodo</span>
              <span className="live-dot" title="Aggiornamento automatico ogni 60s" />
            </div>
            <div className={`font-mono text-4xl font-semibold tracking-tight tabular-nums ${loading && !summary ? 'text-[var(--mute-2)]' : 'text-white'}`}>
              {summary ? euro(summary.total_eur) : '—'}
            </div>
            <div className="text-xs text-gray-500 mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <span><span className="font-mono tabular-nums">{summary?.total_calls ?? 0}</span> chiamate</span>
              <span><span className="font-mono tabular-nums">{durationLabel(summary?.total_seconds ?? 0)}</span> totali</span>
            </div>
          </div>
          {lastRefresh && (
            <div className="text-xs text-gray-500 text-right shrink-0">
              <div>Aggiornato</div>
              <div>{lastRefresh.toLocaleTimeString('it-IT')}</div>
            </div>
          )}
        </div>
      </div>

      {/* Daily breakdown */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--line)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line)] flex items-center justify-between">
          <h2 className="font-display font-semibold text-white text-sm">Dettaglio per giorno</h2>
          {summary && <span className="font-mono text-xs text-gray-400 tabular-nums">{summary.by_day.length} giorni</span>}
        </div>

        {loading && !summary ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-8 bg-[#141517] rounded loading" />)}
          </div>
        ) : summary?.no_agents ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Nessun agente configurato per il tuo account.
          </div>
        ) : !summary || summary.by_day.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Nessun consumo nel periodo selezionato
          </div>
        ) : (
          <div className="divide-y divide-[var(--line-soft)]">
            {summary.by_day.map(d => (
              <div key={d.date} className="px-5 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-white capitalize">{dayLabel(d.date)}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      <span className="font-mono tabular-nums">{d.calls}</span> {d.calls === 1 ? 'chiamata' : 'chiamate'} · <span className="font-mono tabular-nums">{durationLabel(d.seconds)}</span>
                    </div>
                  </div>
                  <div className="font-mono text-sm font-semibold text-white tabular-nums shrink-0">{euro(d.eur)}</div>
                </div>
                <div className="mt-2 h-1.5 bg-[#141517] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#F59E0B] rounded-full transition-all"
                    style={{ width: maxDayEur > 0 ? `${(d.eur / maxDayEur) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-600 text-center">
        I costi mostrano la spesa effettiva del servizio AI nel periodo. Dati in tempo quasi reale.
      </p>
    </div>
  )
}
