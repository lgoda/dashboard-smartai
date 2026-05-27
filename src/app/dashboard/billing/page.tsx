'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/app/components/AuthProvider'

export const dynamic = 'force-dynamic'

type Balance = {
  balance_minutes: number
  balance_cents: number
  last_updated_at: string
}

type LedgerEntry = {
  id: string
  type: string
  amount_cents: number
  minutes_delta: number
  balance_after_minutes: number
  description: string | null
  reference_id: string | null
  created_at: string
}

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  purchase:       { label: 'Acquisto pacchetto', color: 'text-green-400' },
  call_debit:     { label: 'Chiamata',            color: 'text-red-400'   },
  manual_credit:  { label: 'Credito manuale',     color: 'text-green-400' },
  manual_debit:   { label: 'Debito manuale',      color: 'text-red-400'   },
  refund:         { label: 'Rimborso',             color: 'text-green-400' },
  auto_recharge:  { label: 'Ricarica automatica', color: 'text-blue-400'  },
}

function fmt(minutes: number) {
  if (Math.abs(minutes) < 1) return `${(minutes * 60).toFixed(0)}s`
  return `${Math.abs(minutes).toFixed(1)} min`
}

export default function BillingPage() {
  const { user, accessToken, loading: authLoading } = useAuth()
  const [balance, setBalance] = useState<Balance | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)

  const headers = useCallback(() => ({
    Authorization: `Bearer ${accessToken}`,
  }), [accessToken])

  const fetchBalance = useCallback(async () => {
    if (!accessToken) return
    const r = await fetch('/api/billing/balance', { headers: headers() })
    if (r.ok) setBalance((await r.json()).balance)
  }, [accessToken, headers])

  const fetchLedger = useCallback(async (p: number) => {
    if (!accessToken) return
    setLoading(true)
    try {
      const r = await fetch(`/api/billing/ledger?page=${p}`, { headers: headers() })
      if (r.ok) {
        const j = await r.json()
        setLedger(prev => p === 0 ? j.entries : [...prev, ...j.entries])
        setTotal(j.total)
        setHasMore(j.has_more)
      }
    } finally { setLoading(false) }
  }, [accessToken, headers])

  useEffect(() => {
    if (!accessToken) return
    fetchBalance()
    fetchLedger(0)
  }, [accessToken, fetchBalance, fetchLedger])

  if (authLoading) return null

  const balanceMin = balance?.balance_minutes ?? 0
  const isLow = balanceMin < 30

  return (
    <div className="min-h-screen bg-[#1e1f22] text-white p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-white mb-6">Il mio saldo</h1>

        {/* Balance card */}
        <div className={`rounded-2xl p-6 mb-6 border ${isLow ? 'bg-red-900/20 border-red-500/30' : 'bg-[#2C2E31] border-[#3A3D42]'}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-4xl font-bold ${isLow ? 'text-red-400' : 'text-[#F59E0B]'}`}>
                {fmt(balanceMin)}
              </div>
              <div className="text-sm text-gray-400 mt-1">minuti disponibili</div>
              {isLow && (
                <div className="mt-2 text-xs text-red-400">
                  Saldo basso — contatta l'amministratore per ricaricare
                </div>
              )}
            </div>
            {balance && (
              <div className="text-xs text-gray-500 text-right">
                <div>Aggiornato</div>
                <div>{new Date(balance.last_updated_at).toLocaleString('it-IT')}</div>
              </div>
            )}
          </div>
        </div>

        {/* Ledger */}
        <div className="bg-[#2C2E31] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#3A3D42] flex items-center justify-between">
            <h2 className="font-semibold text-white text-sm">Storico movimenti</h2>
            <span className="text-xs text-gray-400">{total} totali</span>
          </div>

          {ledger.length === 0 && !loading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Nessun movimento ancora</div>
          ) : (
            <div className="divide-y divide-[#3A3D42]">
              {ledger.map(e => {
                const meta = TYPE_LABEL[e.type] ?? { label: e.type, color: 'text-gray-400' }
                const isCredit = e.minutes_delta >= 0
                return (
                  <div key={e.id} className="px-5 py-4 flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${isCredit ? 'bg-green-400' : 'bg-red-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white">{e.description || meta.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {new Date(e.created_at).toLocaleString('it-IT')}
                        {e.reference_id && <span className="ml-2 font-mono">{e.reference_id.slice(0, 16)}…</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-sm font-medium ${meta.color}`}>
                        {isCredit ? '+' : '−'}{fmt(e.minutes_delta)}
                      </div>
                      <div className="text-xs text-gray-500">saldo: {fmt(e.balance_after_minutes)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {hasMore && (
            <div className="px-5 py-4 border-t border-[#3A3D42]">
              <button
                onClick={() => { const next = page + 1; setPage(next); fetchLedger(next) }}
                disabled={loading}
                className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                {loading ? 'Caricamento...' : 'Carica altri'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
