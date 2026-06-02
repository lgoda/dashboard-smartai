'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/app/components/AuthProvider'
import { supabase } from '@/app/lib/supabaseClient'
import AddCardModal from '@/app/components/AddCardModal'

export const dynamic = 'force-dynamic'

type Balance = {
  balance_minutes: number
  balance_cents: number
  outstanding_cents?: number
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

type Package = {
  id: string
  name: string
  minutes: number
  price_cents: number
  is_active: boolean
}

type Invoice = {
  id: string
  invoice_number: string
  amount_cents: number
  minutes_added: number
  status: 'issued' | 'paid' | 'cancelled'
  type: 'package_purchase' | 'auto_recharge' | 'postpaid_period'
  due_date: string | null
  paid_at: string | null
  created_at: string
  period_from: string | null
  period_to: string | null
  stripe_hosted_url: string | null
  stripe_pdf_url: string | null
  payment_error_detail: string | null
  billing_packages: { name: string } | null
}

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  purchase:       { label: 'Acquisto pacchetto', color: 'text-green-400' },
  call_debit:     { label: 'Chiamata',            color: 'text-red-400'   },
  manual_credit:  { label: 'Credito manuale',     color: 'text-green-400' },
  manual_debit:   { label: 'Debito manuale',      color: 'text-red-400'   },
  refund:         { label: 'Rimborso',             color: 'text-green-400' },
  auto_recharge:  { label: 'Ricarica automatica', color: 'text-blue-400'  },
}

const STATUS_BADGE: Record<string, string> = {
  issued:    'bg-yellow-500/20 text-yellow-400',
  paid:      'bg-green-500/20 text-green-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
}
const STATUS_LABEL: Record<string, string> = {
  issued: 'Da pagare', paid: 'Pagata', cancelled: 'Annullata',
}

function fmt(minutes: number) {
  const totalSec = Math.round(Math.abs(minutes) * 60)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m} min`
  return `${m} min ${s}s`
}

type Tab = 'saldo' | 'pacchetti' | 'fatture'

export default function BillingPage() {
  const { accessToken, loading: authLoading } = useAuth()
  const [tab, setTab] = useState<Tab>('saldo')

  const [balance, setBalance]     = useState<Balance | null>(null)
  const [billingMode, setBillingMode]               = useState<'prepaid' | 'postpaid' | 'hybrid'>('prepaid')
  const [invoiceTrigger, setInvoiceTrigger]         = useState<'monthly' | 'threshold' | 'both'>('monthly')
  const [invoiceThresholdCents, setInvoiceThresholdCents] = useState(5000)
  const [monthlyInvoiceDay, setMonthlyInvoiceDay] = useState(27)

  type PaymentMethod = { id: string; brand: string; last4: string; exp_month: number; exp_year: number }
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [pmLoading, setPmLoading] = useState(true)
  const [pmGraceUntil, setPmGraceUntil] = useState<string | null>(null)
  const [pmStale, setPmStale] = useState(false)
  const [showAddCard, setShowAddCard] = useState(false)
  const [pmActionMsg, setPmActionMsg] = useState<string | null>(null)
  const [ledger, setLedger]     = useState<LedgerEntry[]>([])
  const [ledgerTotal, setLedgerTotal] = useState(0)
  const [ledgerPage, setLedgerPage]   = useState(0)
  const [ledgerMore, setLedgerMore]   = useState(false)
  const [ledgerLoading, setLedgerLoading] = useState(false)

  const [packages, setPackages]       = useState<Package[]>([])
  const [purchasing, setPurchasing]   = useState<string | null>(null)
  const [purchaseMsg, setPurchaseMsg] = useState<string | null>(null)

  const [invoices, setInvoices]     = useState<Invoice[]>([])
  const [invoicesTotal, setInvoicesTotal] = useState(0)
  const [invoicesMore, setInvoicesMore]   = useState(false)
  const [invoicePage, setInvoicePage]     = useState(0)
  const [invoicesLoading, setInvoicesLoading] = useState(false)

  const headers = useCallback(() => ({
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }), [accessToken])

  const fetchBalance = useCallback(async () => {
    if (!accessToken) return
    const r = await fetch('/api/billing/balance', { headers: headers() })
    if (r.ok) {
      const j = await r.json()
      setBalance(j.balance)
      setBillingMode(j.billing_mode ?? 'prepaid')
      setInvoiceTrigger(j.invoice_trigger ?? 'monthly')
      setInvoiceThresholdCents(j.invoice_threshold_cents ?? 5000)
      setMonthlyInvoiceDay(j.monthly_invoice_day ?? 27)
    }
  }, [accessToken, headers])

  const fetchPaymentMethod = useCallback(async () => {
    if (!accessToken) return
    setPmLoading(true)
    try {
      const r = await fetch('/api/billing/stripe/payment-method', { headers: headers() })
      if (r.ok) {
        const j = await r.json()
        setPaymentMethod(j.payment_method ?? null)
        setPmGraceUntil(j.grace_period_until ?? null)
        setPmStale(!!j.stale)
      }
    } finally { setPmLoading(false) }
  }, [accessToken, headers])

  const removePaymentMethod = async () => {
    if (!accessToken) return
    if (!confirm('Rimuovere il metodo di pagamento? Il servizio postpaid potrebbe essere sospeso.')) return
    setPmActionMsg(null)
    const r = await fetch('/api/billing/stripe/payment-method', { method: 'DELETE', headers: headers() })
    if (r.ok) {
      setPmActionMsg('Carta rimossa')
      await fetchPaymentMethod()
    } else {
      const j = await r.json().catch(() => ({}))
      setPmActionMsg(j.error ?? 'Errore rimozione carta')
    }
    setTimeout(() => setPmActionMsg(null), 4000)
  }

  const fetchLedger = useCallback(async (p: number) => {
    if (!accessToken) return
    setLedgerLoading(true)
    try {
      const r = await fetch(`/api/billing/ledger?page=${p}`, { headers: headers() })
      if (r.ok) {
        const j = await r.json()
        setLedger(prev => p === 0 ? j.entries : [...prev, ...j.entries])
        setLedgerTotal(j.total)
        setLedgerMore(j.has_more)
      }
    } finally { setLedgerLoading(false) }
  }, [accessToken, headers])

  const fetchPackages = useCallback(async () => {
    if (!accessToken) return
    const r = await fetch('/api/billing/packages', { headers: headers() })
    if (r.ok) setPackages((await r.json()).packages ?? [])
  }, [accessToken, headers])

  const fetchInvoices = useCallback(async (p: number) => {
    if (!accessToken) return
    setInvoicesLoading(true)
    try {
      const r = await fetch(`/api/billing/invoices?page=${p}`, { headers: headers() })
      if (r.ok) {
        const j = await r.json()
        setInvoices(prev => p === 0 ? j.invoices : [...prev, ...j.invoices])
        setInvoicesTotal(j.total)
        setInvoicesMore(j.has_more)
      }
    } finally { setInvoicesLoading(false) }
  }, [accessToken, headers])

  useEffect(() => {
    if (!accessToken) return
    fetchBalance()
    fetchLedger(0)
    fetchPackages()
    fetchInvoices(0)
    fetchPaymentMethod()
  }, [accessToken, fetchBalance, fetchLedger, fetchPackages, fetchInvoices, fetchPaymentMethod])

  // Realtime subscription on billing_balance — updates instantly when sync writes to DB
  useEffect(() => {
    if (!accessToken) return
    let channel: ReturnType<typeof supabase.channel> | null = null
    let pollId: ReturnType<typeof setInterval> | null = null

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      channel = supabase
        .channel('billing_balance')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'billing_balance', filter: `user_id=eq.${data.user.id}` },
          () => { fetchBalance() }
        )
        .subscribe()
      pollId = setInterval(fetchBalance, 60_000)
    })

    return () => {
      if (channel) supabase.removeChannel(channel)
      if (pollId)  clearInterval(pollId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  const buyPackage = async (pkg: Package) => {
    setPurchasing(pkg.id)
    setPurchaseMsg(null)
    const r = await fetch('/api/billing/purchase', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ package_id: pkg.id }),
    })
    const j = await r.json()
    if (r.ok) {
      setPurchaseMsg(`Pacchetto "${pkg.name}" acquistato — fattura ${j.invoice.invoice_number}`)
      fetchBalance()
      fetchLedger(0)
      setInvoicePage(0)
      fetchInvoices(0)
      setTimeout(() => setPurchaseMsg(null), 4000)
    } else {
      setPurchaseMsg(j.error)
    }
    setPurchasing(null)
  }

  if (authLoading) return null

  const isPostpaid = billingMode !== 'prepaid'
  const balanceMin = balance?.balance_minutes ?? 0
  const outstandingCents = balance?.outstanding_cents ?? 0
  const isLow = !isPostpaid && balanceMin < 30

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? 'bg-[#F59E0B] text-[#1e293b]' : 'text-gray-400 hover:text-white hover:bg-[#222428]'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="min-h-screen bg-[#1e1f22] text-white p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-white mb-1">Fatturazione</h1>
        <p className="text-gray-400 text-sm mb-5">
          {isPostpaid ? 'Consumo a chiamata — fatturazione mensile' : 'Saldo minuti, acquisto pacchetti e fatture'}
        </p>

        {/* Balance summary always visible */}
        {isPostpaid ? (
          <div className="rounded-2xl mb-5 border bg-[#2C2E31] border-[#3A3D42] overflow-hidden">
            {/* Main spend row */}
            <div className="p-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Spesa attuale</span>
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" title="Aggiornamento automatico ogni 30s" />
              </div>
                <div className={`text-4xl font-bold tabular-nums ${outstandingCents > 0 ? 'text-white' : 'text-gray-500'}`}>
                  €{(outstandingCents / 100).toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 mt-1">{fmt(Math.abs(balanceMin))} consumati</div>
              </div>
              {balance && (
                <div className="text-xs text-gray-500 text-right">
                  <div>Aggiornato</div>
                  <div>{new Date(balance.last_updated_at).toLocaleString('it-IT')}</div>
                </div>
              )}
            </div>
            {/* Payment terms note */}
            <div className="px-5 py-3 bg-[#1e1f22] border-t border-[#3A3D42] flex items-start gap-2">
              <svg className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-gray-500 leading-relaxed">
                {(() => {
                  const day        = monthlyInvoiceDay
                  const dayLabel   = day === 1 ? 'il 1° di ogni mese' : `il giorno ${day} di ogni mese`
                  const thresholdE = (invoiceThresholdCents / 100).toFixed(2).replace('.', ',')
                  if (invoiceTrigger === 'monthly')   return <>La fattura viene generata automaticamente <strong className="text-gray-300">{dayLabel}</strong>.</>
                  if (invoiceTrigger === 'threshold') return <>La fattura viene generata automaticamente al raggiungimento di <strong className="text-gray-300">€{thresholdE}</strong> di spesa.</>
                  return <>La fattura viene generata automaticamente <strong className="text-gray-300">{dayLabel}</strong>, oppure al raggiungimento di <strong className="text-gray-300">€{thresholdE}</strong> di spesa (in base a quale si verifica prima).</>
                })()}
              </p>
            </div>
          </div>
        ) : (
          <div className={`rounded-2xl p-5 mb-5 border flex items-center justify-between ${isLow ? 'bg-red-900/20 border-red-500/30' : 'bg-[#2C2E31] border-[#3A3D42]'}`}>
            <div>
              <div className={`text-3xl font-bold ${isLow ? 'text-red-400' : 'text-[#F59E0B]'}`}>
                {fmt(balanceMin)}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">minuti disponibili</div>
              {isLow && (
                <div className="mt-1 text-xs text-red-400">Saldo basso — acquista un pacchetto</div>
              )}
            </div>
            {balance && (
              <div className="text-xs text-gray-500 text-right">
                <div>Aggiornato</div>
                <div>{new Date(balance.last_updated_at).toLocaleString('it-IT')}</div>
              </div>
            )}
          </div>
        )}

        {/* Metodo di pagamento — only for postpaid/hybrid */}
        {isPostpaid && (
          <div className="rounded-2xl mb-5 border bg-[#2C2E31] border-[#3A3D42] p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Metodo di pagamento</div>
                {pmLoading ? (
                  <div className="text-sm text-gray-500">Caricamento...</div>
                ) : paymentMethod ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="px-2.5 py-1 rounded bg-[#1e1f22] border border-[#3A3D42] text-sm">
                      <span className="capitalize font-medium text-white">{paymentMethod.brand}</span>
                      <span className="text-gray-400 mx-1.5">····</span>
                      <span className="font-mono text-white">{paymentMethod.last4}</span>
                    </div>
                    <span className="text-xs text-gray-500">scade {String(paymentMethod.exp_month).padStart(2, '0')}/{String(paymentMethod.exp_year).slice(-2)}</span>
                  </div>
                ) : (
                  <div className="text-sm text-yellow-400">
                    Nessuna carta salvata.{' '}
                    {pmGraceUntil && new Date(pmGraceUntil) > new Date() ? (
                      <span className="text-gray-400">Periodo di tolleranza fino al {new Date(pmGraceUntil).toLocaleDateString('it-IT')}.</span>
                    ) : (
                      <span className="text-red-400">Le prossime chiamate verranno bloccate.</span>
                    )}
                  </div>
                )}
                {pmStale && (
                  <p className="text-xs text-yellow-500 mt-1">La carta salvata non è più valida (cambio ambiente Stripe). Aggiungine una nuova.</p>
                )}
                {pmActionMsg && <p className="text-xs text-gray-400 mt-1">{pmActionMsg}</p>}
              </div>
              <div className="flex gap-2">
                {paymentMethod ? (
                  <>
                    <button
                      onClick={() => setShowAddCard(true)}
                      className="px-3 py-1.5 text-xs font-medium text-gray-300 border border-[#3A3D42] rounded-lg hover:bg-[#3A3D42] transition-colors"
                    >
                      Sostituisci
                    </button>
                    <button
                      onClick={removePaymentMethod}
                      className="px-3 py-1.5 text-xs font-medium text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors"
                    >
                      Rimuovi
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShowAddCard(true)}
                    className="px-4 py-2 bg-[#F59E0B] text-[#1e293b] text-sm font-semibold rounded-lg hover:bg-[#D97706] transition-colors"
                  >
                    Aggiungi carta
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {showAddCard && accessToken && (
          <AddCardModal
            accessToken={accessToken}
            onClose={() => setShowAddCard(false)}
            onSuccess={() => {
              setShowAddCard(false)
              setPmActionMsg('Carta salvata con successo')
              fetchPaymentMethod()
              setTimeout(() => setPmActionMsg(null), 4000)
            }}
          />
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-[#2C2E31] p-1 rounded-xl w-fit">
          {tabBtn('saldo',    'Movimenti')}
          {!isPostpaid && tabBtn('pacchetti','Pacchetti')}
          {tabBtn('fatture',  'Fatture')}
        </div>

        {/* ── TAB: MOVIMENTI ── */}
        {tab === 'saldo' && (
          <div className="bg-[#2C2E31] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#3A3D42] flex items-center justify-between">
              <h2 className="font-semibold text-white text-sm">Storico movimenti</h2>
              <span className="text-xs text-gray-400">{ledgerTotal} totali</span>
            </div>
            {ledger.length === 0 && !ledgerLoading ? (
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
                        {isPostpaid && e.amount_cents !== 0 ? (
                          <div className="text-xs text-gray-500">€{Math.abs(e.amount_cents / 100).toFixed(4)}</div>
                        ) : (
                          <div className="text-xs text-gray-500">saldo: {fmt(e.balance_after_minutes)}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {ledgerMore && (
              <div className="px-5 py-4 border-t border-[#3A3D42]">
                <button
                  onClick={() => { const next = ledgerPage + 1; setLedgerPage(next); fetchLedger(next) }}
                  disabled={ledgerLoading}
                  className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  {ledgerLoading ? 'Caricamento...' : 'Carica altri'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: PACCHETTI ── */}
        {tab === 'pacchetti' && !isPostpaid && (
          <div className="space-y-4">
            {purchaseMsg && (
              <div className={`rounded-xl px-4 py-3 text-sm ${purchaseMsg.includes('acquistato') ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {purchaseMsg}
              </div>
            )}
            {packages.length === 0 ? (
              <div className="bg-[#2C2E31] rounded-xl p-6 text-gray-400 text-sm text-center">
                Nessun pacchetto disponibile al momento
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {packages.map(pkg => (
                  <div key={pkg.id} className="bg-[#2C2E31] rounded-xl p-5 border border-[#3A3D42] flex flex-col gap-3 hover:border-[#F59E0B]/40 transition-colors">
                    <div>
                      <div className="font-semibold text-white">{pkg.name}</div>
                      <div className="text-2xl font-bold text-[#F59E0B] mt-1">{pkg.minutes} min</div>
                      <div className="text-sm text-gray-400 mt-0.5">
                        €{(pkg.price_cents / 100).toFixed(2)} — €{(pkg.price_cents / pkg.minutes / 100).toFixed(3)}/min
                      </div>
                    </div>
                    <button
                      onClick={() => buyPackage(pkg)}
                      disabled={!!purchasing}
                      className="mt-auto w-full py-2 bg-[#F59E0B] text-[#1e293b] text-sm font-semibold rounded-lg hover:bg-[#D97706] disabled:opacity-50 transition-colors"
                    >
                      {purchasing === pkg.id ? 'Acquisto...' : 'Acquista'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: FATTURE ── */}
        {tab === 'fatture' && (
          <div className="bg-[#2C2E31] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#3A3D42] flex items-center justify-between">
              <h2 className="font-semibold text-white text-sm">Fatture</h2>
              <span className="text-xs text-gray-400">{invoicesTotal} totali</span>
            </div>
            {invoices.length === 0 && !invoicesLoading ? (
              <div className="p-6 text-center text-gray-400 text-sm">Nessuna fattura ancora</div>
            ) : (
              <div className="divide-y divide-[#3A3D42]">
                {invoices.map(inv => (
                  <div key={inv.id} className="px-5 py-4 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white font-mono">{inv.invoice_number}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_BADGE[inv.status]}`}>
                          {STATUS_LABEL[inv.status]}
                        </span>
                        {inv.type === 'auto_recharge' && (
                          <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">auto</span>
                        )}
                        {inv.type === 'postpaid_period' && (
                          <span className="text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">periodo</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {inv.type === 'postpaid_period' && inv.period_from && inv.period_to
                          ? `Periodo ${new Date(inv.period_from).toLocaleDateString('it-IT')} → ${new Date(inv.period_to).toLocaleDateString('it-IT')}`
                          : `${inv.billing_packages?.name ?? '—'} · ${inv.minutes_added} min`}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {new Date(inv.created_at).toLocaleDateString('it-IT')}
                        {inv.due_date && inv.status === 'issued' && (
                          <span className="ml-2">Scadenza: {new Date(inv.due_date).toLocaleDateString('it-IT')}</span>
                        )}
                        {inv.paid_at && (
                          <span className="ml-2 text-green-400">Pagata il {new Date(inv.paid_at).toLocaleDateString('it-IT')}</span>
                        )}
                      </div>
                      {inv.payment_error_detail && (
                        <div className="text-xs text-red-400 mt-1">Pagamento fallito: {inv.payment_error_detail}</div>
                      )}
                      {(inv.stripe_hosted_url || inv.stripe_pdf_url) && (
                        <div className="flex gap-2 mt-2">
                          {inv.stripe_hosted_url && (
                            <a
                              href={inv.stripe_hosted_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs px-2 py-1 rounded border border-[#3A3D42] text-gray-300 hover:bg-[#3A3D42] transition-colors"
                            >
                              Visualizza
                            </a>
                          )}
                          {inv.stripe_pdf_url && (
                            <a
                              href={inv.stripe_pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs px-2 py-1 rounded border border-[#3A3D42] text-gray-300 hover:bg-[#3A3D42] transition-colors"
                            >
                              PDF
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-white">€{(inv.amount_cents / 100).toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {invoicesMore && (
              <div className="px-5 py-4 border-t border-[#3A3D42]">
                <button
                  onClick={() => { const next = invoicePage + 1; setInvoicePage(next); fetchInvoices(next) }}
                  disabled={invoicesLoading}
                  className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  {invoicesLoading ? 'Caricamento...' : 'Carica altri'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
