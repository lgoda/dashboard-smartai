'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/components/AuthProvider'

export const dynamic = 'force-dynamic'

type Tab = 'clienti' | 'agent' | 'pacchetti' | 'fatture' | 'impostazioni'

type ClientRow = {
  id: string
  full_name: string
  company: string
  balance: { balance_minutes: number; balance_cents: number; outstanding_cents?: number }
  billing_config: {
    billing_mode: string; margin_percent: number | null; auto_recharge_enabled: boolean
    low_balance_threshold_minutes?: number; overflow_mode?: string; auto_recharge_package_id?: string
    invoice_trigger?: string; invoice_threshold_cents?: number; billing_period_start_day?: number
  } | null
  last_call: { billed_at: string } | null
  minutes_used_30d: number
}

type AgentMapping = {
  id: string
  agent_id: string
  agent_name: string | null
  user_id: string
  price_per_minute_cents: number | null
  is_active: boolean
  profiles?: { full_name: string }
}

type RetellAgent = { agent_id: string; agent_name: string | null }

type Package = {
  id: string
  name: string
  minutes: number
  price_cents: number
  is_active: boolean
}

type AdminConfig = {
  id: string
  default_margin_percent: number
  usd_eur_rate: number
  notification_email: string | null
  retell_billing_api_token: string | null
  last_retell_sync_at: string | null
  monthly_invoice_day: number
}

function fmt(minutes: number) {
  const totalSec = Math.round(Math.abs(minutes) * 60)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m} min`
  return `${m} min ${s}s`
}

export default function AdminBillingPage() {
  const { profile, accessToken, loading: authLoading } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('clienti')

  // ── clienti ──
  const [clients, setClients] = useState<ClientRow[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [creditModal, setCreditModal] = useState<ClientRow | null>(null)
  const [creditMinutes, setCreditMinutes] = useState('')
  const [creditDesc, setCreditDesc] = useState('')
  const [creditType, setCreditType] = useState<'manual_credit' | 'manual_debit'>('manual_credit')
  const [creditSaving, setCreditSaving] = useState(false)
  const [creditMsg, setCreditMsg] = useState<string | null>(null)

  type ClientConfigForm = {
    billing_mode: string
    overflow_mode: string
    auto_recharge_enabled: boolean
    auto_recharge_package_id: string
    margin_percent: string
    low_balance_threshold_minutes: string
    invoice_trigger: string
    invoice_threshold_euros: string
    billing_period_start_day: string
  }
  const [clientConfigModal, setClientConfigModal] = useState<ClientRow | null>(null)
  const [clientConfigForm, setClientConfigForm] = useState<ClientConfigForm>({
    billing_mode: 'prepaid', overflow_mode: 'block',
    auto_recharge_enabled: false, auto_recharge_package_id: '',
    margin_percent: '', low_balance_threshold_minutes: '30',
    invoice_trigger: 'monthly', invoice_threshold_euros: '50',
    billing_period_start_day: '1',
  })
  const [clientConfigSaving, setClientConfigSaving] = useState(false)
  const [clientConfigMsg, setClientConfigMsg] = useState<string | null>(null)

  // ── agent ──
  const [mappings, setMappings] = useState<AgentMapping[]>([])
  const [retellAgents, setRetellAgents] = useState<RetellAgent[]>([])
  const [retellApiConfigured, setRetellApiConfigured] = useState(true)
  const [agentsLoading, setAgentsLoading] = useState(false)
  type AgentRowState = { userId: string; agentName: string; pricePerMinuteCents: string; saving: boolean; msg: string | null }
  const [agentRows, setAgentRows] = useState<Record<string, AgentRowState>>({})
  const [newAgentForm, setNewAgentForm] = useState({ agentId: '', userId: '', agentName: '' })
  const [newAgentSaving, setNewAgentSaving] = useState(false)
  const [newAgentMsg, setNewAgentMsg] = useState<string | null>(null)

  // ── pacchetti ──
  const [packages, setPackages] = useState<Package[]>([])
  const [pkgLoading, setPkgLoading] = useState(false)
  const [pkgForm, setPkgForm] = useState({ name: '', minutes: '', price_cents: '' })
  const [pkgSaving, setPkgSaving] = useState(false)
  const [pkgMsg, setPkgMsg] = useState<string | null>(null)

  // ── fatture admin ──
  type AdminInvoice = {
    id: string; invoice_number: string; amount_cents: number; minutes_added: number
    status: 'issued' | 'paid' | 'cancelled'; type: string; due_date: string | null
    paid_at: string | null; created_at: string
    period_from: string | null; period_to: string | null
    stripe_invoice_id: string | null; stripe_hosted_url: string | null; stripe_pdf_url: string | null
    payment_error_detail: string | null
    billing_packages: { name: string } | null
    profiles: { full_name: string } | null
  }
  const [adminInvoices, setAdminInvoices] = useState<AdminInvoice[]>([])
  const [adminInvoicesTotal, setAdminInvoicesTotal] = useState(0)
  const [adminInvoicesMore, setAdminInvoicesMore] = useState(false)
  const [adminInvoicePage, setAdminInvoicePage] = useState(0)
  const [adminInvoicesLoading, setAdminInvoicesLoading] = useState(false)
  const [adminInvoiceFilter, setAdminInvoiceFilter] = useState('')
  const [updatingInvoice, setUpdatingInvoice] = useState<string | null>(null)
  const [generatingInvoice, setGeneratingInvoice] = useState<string | null>(null)
  const [generateInvoiceMsg, setGenerateInvoiceMsg] = useState<{ userId: string; msg: string; ok: boolean } | null>(null)
  const [chargingInvoiceId, setChargingInvoiceId] = useState<string | null>(null)
  const [chargeMsg, setChargeMsg] = useState<{ invoiceId: string; text: string; ok: boolean } | null>(null)

  // ── impostazioni ──
  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [configForm, setConfigForm] = useState({ default_margin_percent: '', usd_eur_rate: '', notification_email: '', retell_billing_api_token: '', monthly_invoice_day: '27' })
  const [configSaving, setConfigSaving] = useState(false)
  const [configMsg, setConfigMsg] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const headers = useCallback(() => ({
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }), [accessToken])

  useEffect(() => {
    if (profile && profile.role !== 'admin') router.push('/dashboard')
  }, [profile, router])

  // Load clients and packages on mount (both needed across tabs)
  useEffect(() => {
    if (accessToken) { fetchClients(); fetchPackages() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  // ── fetch per tab ──
  const fetchClients = useCallback(async () => {
    if (!accessToken) return
    setClientsLoading(true)
    try {
      const r = await fetch('/api/billing/admin/users', { headers: headers() })
      if (r.ok) setClients((await r.json()).users ?? [])
    } finally { setClientsLoading(false) }
  }, [accessToken, headers])

  const fetchAgents = useCallback(async () => {
    if (!accessToken) return
    setAgentsLoading(true)
    try {
      const r = await fetch('/api/billing/admin/agents', { headers: headers() })
      if (r.ok) {
        const j = await r.json()
        const loadedMappings: AgentMapping[] = j.mappings ?? []
        setMappings(loadedMappings)
        setRetellAgents(j.retell_agents ?? [])
        setRetellApiConfigured(j.retell_api_configured ?? false)
        // Pre-populate per-row state from existing mappings
        const rows: Record<string, AgentRowState> = {}
        for (const m of loadedMappings) {
          rows[m.agent_id] = {
            userId: m.user_id,
            agentName: m.agent_name ?? '',
            pricePerMinuteCents: m.price_per_minute_cents != null ? String(m.price_per_minute_cents) : '',
            saving: false,
            msg: null,
          }
        }
        setAgentRows(rows)
      }
    } finally { setAgentsLoading(false) }
  }, [accessToken, headers])

  const fetchPackages = useCallback(async () => {
    if (!accessToken) return
    setPkgLoading(true)
    try {
      const r = await fetch('/api/billing/packages', { headers: headers() })
      if (r.ok) setPackages((await r.json()).packages ?? [])
    } finally { setPkgLoading(false) }
  }, [accessToken, headers])

  const fetchAdminInvoices = useCallback(async (p: number, filter?: string) => {
    if (!accessToken) return
    setAdminInvoicesLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p) })
      const f = filter ?? adminInvoiceFilter
      if (f) params.set('status', f)
      const r = await fetch(`/api/billing/admin/invoices?${params}`, { headers: headers() })
      if (r.ok) {
        const j = await r.json()
        setAdminInvoices(prev => p === 0 ? j.invoices : [...prev, ...j.invoices])
        setAdminInvoicesTotal(j.total)
        setAdminInvoicesMore(j.has_more)
      }
    } finally { setAdminInvoicesLoading(false) }
  }, [accessToken, headers, adminInvoiceFilter])

  const updateInvoiceStatus = async (id: string, status: string) => {
    setUpdatingInvoice(id)
    const r = await fetch('/api/billing/admin/invoices', {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ id, status }),
    })
    if (r.ok) {
      setAdminInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: status as 'issued' | 'paid' | 'cancelled', paid_at: status === 'paid' ? new Date().toISOString() : null } : inv))
    }
    setUpdatingInvoice(null)
  }

  const chargeInvoice = async (invoiceId: string, invoiceNumber: string) => {
    if (!confirm(`Addebitare la fattura ${invoiceNumber} sulla carta del cliente?`)) return
    setChargingInvoiceId(invoiceId)
    setChargeMsg(null)
    try {
      const r = await fetch(`/api/billing/admin/invoices/${invoiceId}/charge`, {
        method: 'POST',
        headers: headers(),
      })
      const j = await r.json()
      if (r.ok) {
        const status = j.stripe_status === 'paid' ? 'Pagata ✓' : j.stripe_status === 'failed' ? `Charge fallito: ${j.error_detail}` : 'Emessa, in attesa di conferma'
        setChargeMsg({ invoiceId, text: status, ok: j.stripe_status !== 'failed' })
        fetchAdminInvoices(adminInvoicePage)
        fetchClients()
      } else {
        setChargeMsg({ invoiceId, text: j.error ?? 'Errore', ok: false })
      }
    } catch (e) {
      setChargeMsg({ invoiceId, text: e instanceof Error ? e.message : 'Errore di rete', ok: false })
    }
    setChargingInvoiceId(null)
    setTimeout(() => setChargeMsg(null), 8000)
  }

  const generateInvoice = async (userId: string) => {
    setGeneratingInvoice(userId)
    setGenerateInvoiceMsg(null)
    const r = await fetch('/api/billing/admin/invoices/generate', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ user_id: userId }),
    })
    const j = await r.json()
    setGenerateInvoiceMsg({ userId, msg: r.ok ? `Fattura ${j.invoice.invoice_number} generata` : j.error, ok: r.ok })
    if (r.ok) fetchClients()
    setGeneratingInvoice(null)
    setTimeout(() => setGenerateInvoiceMsg(null), 4000)
  }

  const fetchConfig = useCallback(async () => {
    if (!accessToken) return
    const r = await fetch('/api/billing/admin/config', { headers: headers() })
    if (r.ok) {
      const c = (await r.json()).config
      setConfig(c)
      setConfigForm({
        default_margin_percent: String(c.default_margin_percent ?? 30),
        usd_eur_rate: String(c.usd_eur_rate ?? 0.93),
        notification_email: c.notification_email ?? '',
        retell_billing_api_token: c.retell_billing_api_token ?? '',
        monthly_invoice_day: String(c.monthly_invoice_day ?? 27),
      })
    }
  }, [accessToken, headers])

  useEffect(() => {
    if (!accessToken) return
    if (tab === 'clienti')      fetchClients()
    if (tab === 'agent')        fetchAgents()
    if (tab === 'pacchetti')    fetchPackages()
    if (tab === 'fatture')      { setAdminInvoicePage(0); fetchAdminInvoices(0) }
    if (tab === 'impostazioni') fetchConfig()
  }, [tab, accessToken, fetchClients, fetchAgents, fetchPackages, fetchAdminInvoices, fetchConfig])

  // ── client config ──
  const openClientConfig = (c: ClientRow) => {
    const bc = c.billing_config
    setClientConfigForm({
      billing_mode:                   bc?.billing_mode ?? 'prepaid',
      overflow_mode:                  bc?.overflow_mode ?? 'block',
      auto_recharge_enabled:          bc?.auto_recharge_enabled ?? false,
      auto_recharge_package_id:       bc?.auto_recharge_package_id ?? '',
      margin_percent:                 bc?.margin_percent != null ? String(bc.margin_percent) : '',
      low_balance_threshold_minutes:  String(bc?.low_balance_threshold_minutes ?? 30),
      invoice_trigger:                bc?.invoice_trigger ?? 'monthly',
      invoice_threshold_euros:        bc?.invoice_threshold_cents != null ? String(bc.invoice_threshold_cents / 100) : '50',
      billing_period_start_day:       String(bc?.billing_period_start_day ?? 1),
    })
    setClientConfigMsg(null)
    setClientConfigModal(c)
  }

  const saveClientConfig = async () => {
    if (!clientConfigModal) return
    setClientConfigSaving(true)
    setClientConfigMsg(null)
    const r = await fetch('/api/billing/admin/users', {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({
        user_id:                      clientConfigModal.id,
        billing_mode:                 clientConfigForm.billing_mode,
        overflow_mode:                clientConfigForm.overflow_mode,
        auto_recharge_enabled:        clientConfigForm.auto_recharge_enabled,
        auto_recharge_package_id:     clientConfigForm.auto_recharge_package_id || null,
        margin_percent:               clientConfigForm.margin_percent === '' ? null : Number(clientConfigForm.margin_percent),
        low_balance_threshold_minutes: Number(clientConfigForm.low_balance_threshold_minutes),
        invoice_trigger:              clientConfigForm.invoice_trigger,
        invoice_threshold_cents:      Math.round(Number(clientConfigForm.invoice_threshold_euros) * 100),
        billing_period_start_day:     Number(clientConfigForm.billing_period_start_day),
      }),
    })
    if (r.ok) {
      setClientConfigMsg('Salvato')
      fetchClients()
      setTimeout(() => { setClientConfigModal(null); setClientConfigMsg(null) }, 1000)
    } else {
      setClientConfigMsg((await r.json()).error)
    }
    setClientConfigSaving(false)
  }

  // ── credit ──
  const saveCredit = async () => {
    if (!creditModal || !creditMinutes || !creditDesc) return
    setCreditSaving(true)
    setCreditMsg(null)
    const r = await fetch('/api/billing/admin/credit', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        user_id: creditModal.id,
        minutes_delta: creditType === 'manual_credit' ? Number(creditMinutes) : -Number(creditMinutes),
        amount_cents: 0,
        type: creditType,
        description: creditDesc,
      }),
    })
    if (r.ok) {
      setCreditMsg('Credito aggiunto')
      fetchClients()
      setTimeout(() => { setCreditModal(null); setCreditMsg(null); setCreditMinutes(''); setCreditDesc('') }, 1200)
    } else {
      setCreditMsg((await r.json()).error)
    }
    setCreditSaving(false)
  }

  // ── agent mapping ──
  const saveAgentRow = async (agentId: string) => {
    const row = agentRows[agentId]
    if (!row?.userId) return
    setAgentRows(prev => ({ ...prev, [agentId]: { ...prev[agentId], saving: true, msg: null } }))
    const r = await fetch('/api/billing/admin/agents', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        agent_id: agentId,
        user_id: row.userId,
        agent_name: row.agentName || null,
        price_per_minute_cents: row.pricePerMinuteCents ? Number(row.pricePerMinuteCents) : null,
      }),
    })
    if (r.ok) {
      setAgentRows(prev => ({ ...prev, [agentId]: { ...prev[agentId], saving: false, msg: 'Salvato' } }))
      fetchAgents()
      setTimeout(() => setAgentRows(prev => ({ ...prev, [agentId]: { ...prev[agentId], msg: null } })), 2000)
    } else {
      const err = (await r.json()).error
      setAgentRows(prev => ({ ...prev, [agentId]: { ...prev[agentId], saving: false, msg: err } }))
    }
  }

  const addNewAgent = async () => {
    if (!newAgentForm.agentId.trim() || !newAgentForm.userId) return
    setNewAgentSaving(true)
    setNewAgentMsg(null)
    const r = await fetch('/api/billing/admin/agents', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        agent_id: newAgentForm.agentId.trim(),
        user_id: newAgentForm.userId,
        agent_name: newAgentForm.agentName.trim() || null,
      }),
    })
    if (r.ok) {
      setNewAgentMsg('Agent aggiunto')
      setNewAgentForm({ agentId: '', userId: '', agentName: '' })
      fetchAgents()
      setTimeout(() => setNewAgentMsg(null), 2000)
    } else {
      setNewAgentMsg((await r.json()).error)
    }
    setNewAgentSaving(false)
  }

  // ── pacchetto ──
  const savePkg = async () => {
    if (!pkgForm.name || !pkgForm.minutes || !pkgForm.price_cents) return
    setPkgSaving(true)
    setPkgMsg(null)
    const r = await fetch('/api/billing/packages', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ name: pkgForm.name, minutes: Number(pkgForm.minutes), price_cents: Math.round(Number(pkgForm.price_cents) * 100) }),
    })
    if (r.ok) {
      setPkgMsg('Pacchetto creato')
      fetchPackages()
      setPkgForm({ name: '', minutes: '', price_cents: '' })
      setTimeout(() => setPkgMsg(null), 2000)
    } else {
      setPkgMsg((await r.json()).error)
    }
    setPkgSaving(false)
  }

  const togglePkg = async (pkg: Package) => {
    await fetch('/api/billing/packages', {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ id: pkg.id, is_active: !pkg.is_active }),
    })
    fetchPackages()
  }

  // ── config ──
  const saveConfig = async () => {
    setConfigSaving(true)
    setConfigMsg(null)
    const r = await fetch('/api/billing/admin/config', {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({
        default_margin_percent: Number(configForm.default_margin_percent),
        usd_eur_rate: Number(configForm.usd_eur_rate),
        notification_email: configForm.notification_email || null,
        retell_billing_api_token: configForm.retell_billing_api_token || null,
        monthly_invoice_day: Number(configForm.monthly_invoice_day),
      }),
    })
    if (r.ok) {
      setConfigMsg('Impostazioni salvate')
      fetchConfig()
      setTimeout(() => setConfigMsg(null), 2000)
    } else {
      setConfigMsg((await r.json()).error)
    }
    setConfigSaving(false)
  }

  const triggerSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const r = await fetch('/api/billing/admin/sync', { method: 'POST', headers: headers() })
      const j = await r.json()
      if (r.ok) {
        const parts = [`Sync completata: ${j.synced} fatturate`]
        if (j.skipped_no_mapping)   parts.push(`${j.skipped_no_mapping} senza mapping`)
        if (j.skipped_duplicate)    parts.push(`${j.skipped_duplicate} duplicate`)
        if (j.blocked_no_balance)   parts.push(`${j.blocked_no_balance} bloccate (saldo esaurito)`)
        if (j.unmapped_agents?.length) parts.push(`Agent non mappati: ${j.unmapped_agents.join(', ')}`)
        setSyncMsg(parts.join(' — '))
        fetchConfig()
      } else {
        setSyncMsg(j.error_message ?? j.error)
      }
    } catch {
      setSyncMsg('Errore di rete')
    }
    setSyncing(false)
  }

  if (authLoading) return null

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? 'bg-[#F59E0B] text-[#1e293b]' : 'text-gray-400 hover:text-white hover:bg-[#222428]'}`}
    >
      {label}
    </button>
  )

  const inputCls = 'w-full bg-[#2C2E31] border border-[#3A3D42] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#F59E0B]'
  const labelCls = 'block text-xs text-gray-400 mb-1'

  return (
    <div className="min-h-screen bg-[#1e1f22] text-white p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl font-bold text-white mb-1">Fatturazione Admin</h1>
        <p className="text-gray-400 text-sm mb-6">Gestisci saldi, agent, pacchetti e impostazioni billing</p>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 mb-6 bg-[#2C2E31] p-1 rounded-xl w-fit">
          {tabBtn('clienti', 'Clienti')}
          {tabBtn('agent', 'Agent')}
          {tabBtn('pacchetti', 'Pacchetti')}
          {tabBtn('fatture', 'Fatture')}
          {tabBtn('impostazioni', 'Impostazioni')}
        </div>

        {/* ── TAB: CLIENTI ── */}
        {tab === 'clienti' && (
          <div>
            {clientsLoading ? (
              <div className="text-gray-400 text-sm">Caricamento...</div>
            ) : clients.length === 0 ? (
              <div className="bg-[#2C2E31] rounded-xl p-6 text-gray-400 text-sm">Nessun cliente trovato</div>
            ) : (
              <div className="space-y-3">
                {clients.map(c => (
                  <div key={c.id} className="bg-[#2C2E31] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white">{c.full_name || '—'}</div>
                      <div className="text-xs text-gray-400">{c.company || 'Nessuna azienda'}</div>
                      {c.last_call && (
                        <div className="text-xs text-gray-500 mt-0.5">Ultima chiamata: {new Date(c.last_call.billed_at).toLocaleDateString('it-IT')}</div>
                      )}
                    </div>

                    <div className="flex gap-4 text-sm flex-wrap">
                      <div className="text-center">
                        <div className={`font-bold text-lg ${c.balance.balance_minutes < 10 ? 'text-red-400' : 'text-[#F59E0B]'}`}>
                          {fmt(c.balance.balance_minutes)}
                        </div>
                        <div className="text-xs text-gray-500">saldo</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-lg text-white">{fmt(c.minutes_used_30d)}</div>
                        <div className="text-xs text-gray-500">usati 30gg</div>
                      </div>
                      {c.billing_config?.billing_mode !== 'prepaid' && (
                        <div className="text-center">
                          <div className={`font-bold text-lg ${(c.balance.outstanding_cents ?? 0) > 0 ? 'text-orange-400' : 'text-gray-500'}`}>
                            €{((c.balance.outstanding_cents ?? 0) / 100).toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500">outstanding</div>
                        </div>
                      )}
                      {c.billing_config?.billing_mode === 'prepaid' && c.billing_config.margin_percent != null && (
                        <div className="text-center">
                          <div className="font-bold text-lg text-white">{c.billing_config.margin_percent}%</div>
                          <div className="text-xs text-gray-500">margine</div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 shrink-0 flex-wrap">
                      <button
                        onClick={() => openClientConfig(c)}
                        className="px-3 py-1.5 text-xs font-medium bg-[#3A3D42] text-gray-300 border border-[#3A3D42] rounded-lg hover:bg-[#444] transition-colors"
                      >
                        ⚙ Configura
                      </button>
                      <button
                        onClick={() => { setCreditModal(c); setCreditMsg(null); setCreditMinutes(''); setCreditDesc('') }}
                        className="px-3 py-1.5 text-xs font-medium bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30 rounded-lg hover:bg-[#F59E0B]/30 transition-colors"
                      >
                        + Credito
                      </button>
                      {c.billing_config?.billing_mode !== 'prepaid' && (c.balance.outstanding_cents ?? 0) > 0 && (
                        <button
                          onClick={() => generateInvoice(c.id)}
                          disabled={generatingInvoice === c.id}
                          className="px-3 py-1.5 text-xs font-medium bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg hover:bg-orange-500/30 disabled:opacity-50 transition-colors"
                        >
                          {generatingInvoice === c.id ? '...' : 'Genera fattura'}
                        </button>
                      )}
                    </div>
                    {generateInvoiceMsg?.userId === c.id && (
                      <div className={`text-xs mt-1 w-full ${generateInvoiceMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
                        {generateInvoiceMsg.msg}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: AGENT ── */}
        {tab === 'agent' && (
          <div className="space-y-4">
            {/* Add new agent manually */}
            <div className="bg-[#2C2E31] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-3">Aggiungi agent</h2>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_1fr_auto] gap-3 items-end">
                <div>
                  <label className={labelCls}>Agent ID <span className="text-red-400">*</span></label>
                  <input
                    value={newAgentForm.agentId}
                    onChange={e => setNewAgentForm(f => ({ ...f, agentId: e.target.value }))}
                    placeholder="agent_xxxx..."
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Nome visualizzato</label>
                  <input
                    value={newAgentForm.agentName}
                    onChange={e => setNewAgentForm(f => ({ ...f, agentName: e.target.value }))}
                    placeholder="es. Assistente Prenotazioni"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Cliente <span className="text-red-400">*</span></label>
                  <select
                    value={newAgentForm.userId}
                    onChange={e => setNewAgentForm(f => ({ ...f, userId: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">— Seleziona cliente —</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.full_name || c.id.slice(0, 8)}{c.company ? ` (${c.company})` : ''}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={addNewAgent}
                  disabled={newAgentSaving || !newAgentForm.agentId.trim() || !newAgentForm.userId}
                  className="px-4 py-2 bg-[#F59E0B] text-[#1e293b] text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-[#D97706] transition-colors whitespace-nowrap"
                >
                  {newAgentSaving ? '...' : 'Aggiungi'}
                </button>
              </div>
              {newAgentMsg && (
                <p className={`text-xs mt-2 ${newAgentMsg === 'Agent aggiunto' ? 'text-green-400' : 'text-red-400'}`}>{newAgentMsg}</p>
              )}
            </div>

            {/* Banner solo se la chiave non è configurata nel DB */}
            {!agentsLoading && !retellApiConfigured && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div>
                  <p className="text-sm text-yellow-300 font-medium">Chiave API Retell non configurata</p>
                  <p className="text-xs text-yellow-400/70 mt-0.5">
                    Vai nella scheda <strong>Impostazioni</strong> e salva la tua API Key Retell (account company) per vedere gli agent disponibili.
                  </p>
                </div>
              </div>
            )}

            {agentsLoading ? (
              <div className="text-gray-400 text-sm py-4">Caricamento agent Retell...</div>
            ) : retellAgents.length === 0 && retellApiConfigured ? (
              <div className="bg-[#2C2E31] rounded-xl p-6 text-gray-400 text-sm">
                Nessun agent trovato nello storico chiamate. Gli agent appariranno qui automaticamente dopo la prima sincronizzazione.
              </div>
            ) : retellAgents.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 mb-1">
                  {retellAgents.length} agent trovati — assegna ciascuno a un cliente per la fatturazione automatica. Un cliente può avere più agent.
                </p>

                {/* Header */}
                <div className="hidden sm:grid sm:grid-cols-[minmax(0,170px)_1fr_1.5fr_140px_80px] gap-3 px-4 py-1 text-xs text-gray-500 font-medium uppercase tracking-wide">
                  <span>Agent ID</span>
                  <span>Nome visualizzato</span>
                  <span>Cliente</span>
                  <span title="Tariffa fissa in centesimi €/min. Se impostata, sostituisce il calcolo basato sul margine %.">€/min (opt.) ⓘ</span>
                  <span></span>
                </div>

                {retellAgents.map(agent => {
                  const row = agentRows[agent.agent_id] ?? { userId: '', agentName: agent.agent_name ?? '', pricePerMinuteCents: '', saving: false, msg: null }
                  const isMapped = mappings.some(m => m.agent_id === agent.agent_id)
                  return (
                    <div key={agent.agent_id} className="bg-[#2C2E31] rounded-xl p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,170px)_1fr_1.5fr_140px_80px] gap-3 items-center">
                        {/* Agent ID */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {isMapped && (
                              <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full shrink-0">assegnato</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 font-mono break-all mt-0.5">{agent.agent_id}</div>
                        </div>

                        {/* Editable name */}
                        <input
                          type="text"
                          value={row.agentName}
                          onChange={e => setAgentRows(prev => ({ ...prev, [agent.agent_id]: { ...row, agentName: e.target.value } }))}
                          placeholder="es. Assistente Prenotazioni"
                          className={inputCls}
                        />

                        {/* Client dropdown */}
                        <select
                          value={row.userId}
                          onChange={e => setAgentRows(prev => ({ ...prev, [agent.agent_id]: { ...row, userId: e.target.value } }))}
                          className={inputCls}
                        >
                          <option value="">— Non assegnato —</option>
                          {clients.map(c => (
                            <option key={c.id} value={c.id}>{c.full_name}{c.company ? ` (${c.company})` : ''}</option>
                          ))}
                        </select>

                        {/* Price per min override */}
                        <input
                          type="number"
                          value={row.pricePerMinuteCents}
                          onChange={e => setAgentRows(prev => ({ ...prev, [agent.agent_id]: { ...row, pricePerMinuteCents: e.target.value } }))}
                          placeholder="es. 25"
                          className={inputCls}
                          title="Tariffa fissa: centesimi di euro addebitati per ogni minuto di chiamata. Se vuoto, si usa il costo Retell × tasso cambio × (1 + margine%)."
                        />

                        {/* Save */}
                        <button
                          onClick={() => saveAgentRow(agent.agent_id)}
                          disabled={row.saving || !row.userId}
                          className="px-3 py-2 bg-[#F59E0B] text-[#1e293b] text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-[#D97706] transition-colors whitespace-nowrap"
                        >
                          {row.saving ? '...' : 'Salva'}
                        </button>
                      </div>

                      {row.msg && (
                        <p className={`text-xs mt-2 ${row.msg === 'Salvato' ? 'text-green-400' : 'text-red-400'}`}>{row.msg}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : null}

            {/* Mappings orfani: in DB ma non più in Retell */}
            {(() => {
              const orphans = mappings.filter(m => !retellAgents.find(a => a.agent_id === m.agent_id))
              if (orphans.length === 0) return null
              return (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Mapping orfani (agent non trovati in Retell)</h3>
                  <div className="space-y-2">
                    {orphans.map(m => (
                      <div key={m.id} className="bg-[#2C2E31] rounded-xl p-4 flex items-center gap-3 opacity-60">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white">{m.agent_name || m.agent_id}</div>
                          <div className="text-xs text-gray-500 font-mono">{m.agent_id}</div>
                        </div>
                        <div className="text-sm text-gray-400">→ {(m as any).profiles?.full_name || m.user_id}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── TAB: PACCHETTI ── */}
        {tab === 'pacchetti' && (
          <div className="space-y-6">
            <div className="bg-[#2C2E31] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Crea nuovo pacchetto</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Nome</label>
                  <input value={pkgForm.name} onChange={e => setPkgForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="es. Starter 60 min" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Minuti</label>
                  <input type="number" value={pkgForm.minutes} onChange={e => setPkgForm(f => ({ ...f, minutes: e.target.value }))}
                    placeholder="60" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Prezzo (€)</label>
                  <input type="number" step="0.01" min="0.01" value={pkgForm.price_cents} onChange={e => setPkgForm(f => ({ ...f, price_cents: e.target.value }))}
                    placeholder="29.00" className={inputCls} />
                </div>
              </div>
              {pkgMsg && <p className={`text-xs mt-2 ${pkgMsg.includes('creato') ? 'text-green-400' : 'text-red-400'}`}>{pkgMsg}</p>}
              <button onClick={savePkg} disabled={pkgSaving || !pkgForm.name || !pkgForm.minutes || !pkgForm.price_cents}
                className="mt-3 px-4 py-2 bg-[#F59E0B] text-[#1e293b] text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-[#D97706] transition-colors">
                {pkgSaving ? 'Creazione...' : 'Crea pacchetto'}
              </button>
            </div>

            {pkgLoading ? (
              <div className="text-gray-400 text-sm">Caricamento...</div>
            ) : packages.length === 0 ? (
              <div className="bg-[#2C2E31] rounded-xl p-6 text-gray-400 text-sm">Nessun pacchetto creato</div>
            ) : (
              <div className="space-y-2">
                {packages.map(p => (
                  <div key={p.id} className={`bg-[#2C2E31] rounded-xl p-4 flex items-center gap-4 ${!p.is_active ? 'opacity-50' : ''}`}>
                    <div className="flex-1">
                      <div className="font-medium text-white">{p.name}</div>
                      <div className="text-xs text-gray-400">{p.minutes} min — €{(p.price_cents / 100).toFixed(2)}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                      {p.is_active ? 'attivo' : 'disattivo'}
                    </span>
                    <button onClick={() => togglePkg(p)} className="text-xs text-gray-400 hover:text-white transition-colors">
                      {p.is_active ? 'Disattiva' : 'Attiva'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: FATTURE (admin) ── */}
        {tab === 'fatture' && (
          <div className="space-y-4">
            {/* Filter bar */}
            <div className="flex gap-2 flex-wrap items-center">
              {(['', 'issued', 'paid', 'cancelled'] as string[]).map(f => (
                <button key={f} onClick={() => {
                  setAdminInvoiceFilter(f)
                  setAdminInvoicePage(0)
                  setAdminInvoices([])
                  fetchAdminInvoices(0, f)
                }}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${adminInvoiceFilter === f ? 'bg-[#F59E0B] text-[#1e293b] border-[#F59E0B]' : 'border-[#3A3D42] text-gray-400 hover:text-white'}`}>
                  {f === '' ? 'Tutte' : f === 'issued' ? 'Da pagare' : f === 'paid' ? 'Pagate' : 'Annullate'}
                </button>
              ))}
              <span className="ml-auto text-xs text-gray-500 self-center">{adminInvoicesTotal} fatture</span>
            </div>

            <div className="bg-[#2C2E31] rounded-2xl overflow-hidden">
              {adminInvoices.length === 0 && !adminInvoicesLoading ? (
                <div className="p-6 text-center text-gray-400 text-sm">Nessuna fattura</div>
              ) : (
                <div className="divide-y divide-[#3A3D42]">
                  {adminInvoices.map(inv => (
                    <div key={inv.id} className="px-5 py-4 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white font-mono">{inv.invoice_number}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${inv.status === 'paid' ? 'bg-green-500/20 text-green-400' : inv.status === 'issued' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-500/20 text-gray-400'}`}>
                            {inv.status === 'paid' ? 'Pagata' : inv.status === 'issued' ? 'Da pagare' : 'Annullata'}
                          </span>
                          {inv.type === 'auto_recharge' && (
                            <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">auto</span>
                          )}
                          {inv.type === 'postpaid_period' && (
                            <span className="text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full">periodo</span>
                          )}
                          {inv.stripe_invoice_id && (
                            <span className="text-xs bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full">Stripe</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {inv.profiles?.full_name || '—'} ·{' '}
                          {inv.type === 'postpaid_period' && inv.period_from && inv.period_to
                            ? `Periodo ${new Date(inv.period_from).toLocaleDateString('it-IT')} → ${new Date(inv.period_to).toLocaleDateString('it-IT')}`
                            : `${inv.billing_packages?.name ?? '—'} · ${inv.minutes_added} min`}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {new Date(inv.created_at).toLocaleDateString('it-IT')}
                          {inv.due_date && inv.status === 'issued' && <span className="ml-2">Scad.: {new Date(inv.due_date).toLocaleDateString('it-IT')}</span>}
                          {inv.paid_at && <span className="ml-2 text-green-400">Pag.: {new Date(inv.paid_at).toLocaleDateString('it-IT')}</span>}
                        </div>
                        {inv.payment_error_detail && (
                          <div className="text-xs text-red-400 mt-1">Pagamento fallito: {inv.payment_error_detail}</div>
                        )}
                        {(inv.stripe_hosted_url || inv.stripe_pdf_url) && (
                          <div className="flex gap-2 mt-2">
                            {inv.stripe_hosted_url && (
                              <a href={inv.stripe_hosted_url} target="_blank" rel="noopener noreferrer"
                                className="text-xs px-2 py-1 rounded border border-[#3A3D42] text-gray-300 hover:bg-[#3A3D42] transition-colors">
                                Visualizza
                              </a>
                            )}
                            {inv.stripe_pdf_url && (
                              <a href={inv.stripe_pdf_url} target="_blank" rel="noopener noreferrer"
                                className="text-xs px-2 py-1 rounded border border-[#3A3D42] text-gray-300 hover:bg-[#3A3D42] transition-colors">
                                PDF
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-white mb-1">€{(inv.amount_cents / 100).toFixed(2)}</div>
                        {inv.status === 'issued' && inv.type === 'postpaid_period' && !inv.stripe_invoice_id && (
                          <button
                            onClick={() => chargeInvoice(inv.id, inv.invoice_number)}
                            disabled={chargingInvoiceId === inv.id}
                            title="Crea Stripe Invoice e addebita sulla carta del cliente"
                            className="block w-full text-xs px-2 py-0.5 bg-[#F59E0B]/20 text-[#F59E0B] rounded hover:bg-[#F59E0B]/30 disabled:opacity-50 transition-colors"
                          >
                            {chargingInvoiceId === inv.id ? 'Pagamento...' : '💳 Paga ora'}
                          </button>
                        )}
                        {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                          <button
                            onClick={() => updateInvoiceStatus(inv.id, 'paid')}
                            disabled={updatingInvoice === inv.id}
                            className="block w-full mt-1 text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 disabled:opacity-50 transition-colors"
                          >
                            {updatingInvoice === inv.id ? '...' : 'Segna pagata'}
                          </button>
                        )}
                        {inv.status === 'issued' && (
                          <button
                            onClick={() => updateInvoiceStatus(inv.id, 'cancelled')}
                            disabled={updatingInvoice === inv.id}
                            className="block w-full mt-1 text-xs px-2 py-0.5 bg-gray-500/20 text-gray-400 rounded hover:bg-gray-500/30 disabled:opacity-50 transition-colors"
                          >
                            Annulla
                          </button>
                        )}
                        {chargeMsg?.invoiceId === inv.id && (
                          <div className={`text-xs mt-1 ${chargeMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{chargeMsg.text}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {adminInvoicesLoading && <div className="p-4 text-center text-gray-400 text-sm">Caricamento...</div>}
              {adminInvoicesMore && (
                <div className="px-5 py-4 border-t border-[#3A3D42]">
                  <button
                    onClick={() => { const next = adminInvoicePage + 1; setAdminInvoicePage(next); fetchAdminInvoices(next) }}
                    disabled={adminInvoicesLoading}
                    className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                  >
                    Carica altri
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: IMPOSTAZIONI ── */}
        {tab === 'impostazioni' && (
          <div className="space-y-6">
            <div className="bg-[#2C2E31] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Configurazione globale billing</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Margine default (%)</label>
                  <input type="number" value={configForm.default_margin_percent}
                    onChange={e => setConfigForm(f => ({ ...f, default_margin_percent: e.target.value }))}
                    className={inputCls} />
                  <p className="text-xs text-gray-500 mt-1">Markup applicato sul costo Retell se il cliente non ha margine personalizzato</p>
                </div>
                <div>
                  <label className={labelCls}>Tasso cambio USD→EUR</label>
                  <input type="number" step="0.001" value={configForm.usd_eur_rate}
                    onChange={e => setConfigForm(f => ({ ...f, usd_eur_rate: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Email notifiche admin</label>
                  <input type="email" value={configForm.notification_email}
                    onChange={e => setConfigForm(f => ({ ...f, notification_email: e.target.value }))}
                    placeholder="admin@example.com" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>API Key Retell (account company)</label>
                  <input type="password" value={configForm.retell_billing_api_token}
                    onChange={e => setConfigForm(f => ({ ...f, retell_billing_api_token: e.target.value }))}
                    placeholder="key_..." className={inputCls} />
                  <p className="text-xs text-gray-500 mt-1">Chiave usata per sincronizzare tutte le chiamate</p>
                </div>
                <div>
                  <label className={labelCls}>Giorno mensile fatturazione postpaid</label>
                  <input type="number" min="1" max="28" value={configForm.monthly_invoice_day}
                    onChange={e => setConfigForm(f => ({ ...f, monthly_invoice_day: e.target.value }))}
                    className={inputCls} />
                  <p className="text-xs text-gray-500 mt-1">Giorno del mese in cui vengono generate le fatture mensili per tutti i clienti postpaid (1–28)</p>
                </div>
              </div>
              {configMsg && <p className={`text-xs mt-2 ${configMsg.includes('salvate') ? 'text-green-400' : 'text-red-400'}`}>{configMsg}</p>}
              <button onClick={saveConfig} disabled={configSaving}
                className="mt-4 px-4 py-2 bg-[#F59E0B] text-[#1e293b] text-sm font-semibold rounded-lg disabled:opacity-50 hover:bg-[#D97706] transition-colors">
                {configSaving ? 'Salvataggio...' : 'Salva impostazioni'}
              </button>
            </div>

            {/* Sync manuale */}
            <div className="bg-[#2C2E31] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-2">Sincronizzazione Retell</h2>
              {config?.last_retell_sync_at && (
                <p className="text-xs text-gray-400 mb-3">
                  Ultima sync: {new Date(config.last_retell_sync_at).toLocaleString('it-IT')}
                </p>
              )}
              <p className="text-xs text-gray-500 mb-3">La sync automatica parte ogni 5 minuti su Vercel. Puoi avviarla manualmente qui.</p>
              {syncMsg && <p className={`text-xs mb-2 ${syncMsg.includes('completata') ? 'text-green-400' : 'text-red-400'}`}>{syncMsg}</p>}
              <button onClick={triggerSync} disabled={syncing}
                className="px-4 py-2 bg-blue-600/20 text-blue-400 border border-blue-600/30 text-sm font-medium rounded-lg disabled:opacity-50 hover:bg-blue-600/30 transition-colors">
                {syncing ? 'Sincronizzazione...' : 'Avvia sync manuale'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal credito ── */}
      {creditModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2C2E31] rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-white mb-1">Modifica credito</h3>
            <p className="text-sm text-gray-400 mb-4">{creditModal.full_name} — saldo: {fmt(creditModal.balance.balance_minutes)}</p>

            <div className="space-y-3">
              <div className="flex gap-2">
                {(['manual_credit', 'manual_debit'] as const).map(t => (
                  <button key={t} onClick={() => setCreditType(t)}
                    className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${creditType === t ? 'bg-[#F59E0B] text-[#1e293b] border-[#F59E0B]' : 'border-[#3A3D42] text-gray-400 hover:text-white'}`}>
                    {t === 'manual_credit' ? '+ Aggiungi minuti' : '− Sottrai minuti'}
                  </button>
                ))}
              </div>
              <div>
                <label className={labelCls}>Minuti</label>
                <input type="number" value={creditMinutes} onChange={e => setCreditMinutes(e.target.value)}
                  placeholder="es. 60" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Descrizione</label>
                <input value={creditDesc} onChange={e => setCreditDesc(e.target.value)}
                  placeholder="es. Pacchetto mensile, rimborso..." className={inputCls} />
              </div>
            </div>

            {creditMsg && <p className={`text-xs mt-2 ${creditMsg.includes('aggiunto') ? 'text-green-400' : 'text-red-400'}`}>{creditMsg}</p>}

            <div className="flex gap-2 mt-4">
              <button onClick={() => setCreditModal(null)}
                className="flex-1 py-2 text-sm text-gray-400 border border-[#3A3D42] rounded-lg hover:text-white transition-colors">
                Annulla
              </button>
              <button onClick={saveCredit} disabled={creditSaving || !creditMinutes || Number(creditMinutes) <= 0 || !creditDesc}
                className="flex-1 py-2 text-sm bg-[#F59E0B] text-[#1e293b] font-semibold rounded-lg disabled:opacity-50 hover:bg-[#D97706] transition-colors">
                {creditSaving ? 'Salvataggio...' : 'Conferma'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal configura cliente ── */}
      {clientConfigModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2C2E31] rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-semibold text-white mb-1">Configura billing</h3>
            <p className="text-sm text-gray-400 mb-4">{clientConfigModal.full_name}</p>

            <div className="space-y-3">
              <div>
                <label className={labelCls}>Modalità billing</label>
                <select value={clientConfigForm.billing_mode}
                  onChange={e => setClientConfigForm(f => ({ ...f, billing_mode: e.target.value }))}
                  className={inputCls}>
                  <option value="prepaid">Prepagato (pacchetti minuti)</option>
                  <option value="postpaid">A consumo (pay-per-use)</option>
                </select>
              </div>

              {clientConfigForm.billing_mode === 'prepaid' && (
                <div>
                  <label className={labelCls}>Quando i minuti finiscono</label>
                  <select value={clientConfigForm.overflow_mode}
                    onChange={e => setClientConfigForm(f => ({ ...f, overflow_mode: e.target.value }))}
                    className={inputCls}>
                    <option value="block">Blocca le chiamate</option>
                    <option value="auto_renew">Rinnova automaticamente il pacchetto</option>
                    <option value="pay_per_use">Continua a consumo (tariffa maggiorata)</option>
                  </select>
                </div>
              )}

              {clientConfigForm.billing_mode === 'prepaid' && clientConfigForm.overflow_mode === 'auto_renew' && (
                <div>
                  <label className={labelCls}>Pacchetto da rinnovare automaticamente</label>
                  <select value={clientConfigForm.auto_recharge_package_id}
                    onChange={e => setClientConfigForm(f => ({ ...f, auto_recharge_package_id: e.target.value }))}
                    className={inputCls}>
                    <option value="">— Seleziona pacchetto —</option>
                    {packages.filter(p => p.is_active).map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.minutes} min — €{(p.price_cents / 100).toFixed(2)}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Quando i minuti si esauriscono, questo pacchetto viene aggiunto automaticamente e viene generata una fattura.
                  </p>
                </div>
              )}

              <div>
                <label className={labelCls}>Margine % personalizzato (lascia vuoto per default globale)</label>
                <input type="number" value={clientConfigForm.margin_percent}
                  onChange={e => setClientConfigForm(f => ({ ...f, margin_percent: e.target.value }))}
                  placeholder={`default globale`} className={inputCls} />
              </div>

              {clientConfigForm.billing_mode === 'prepaid' && (
                <div>
                  <label className={labelCls}>Soglia saldo basso (minuti)</label>
                  <input type="number" value={clientConfigForm.low_balance_threshold_minutes}
                    onChange={e => setClientConfigForm(f => ({ ...f, low_balance_threshold_minutes: e.target.value }))}
                    className={inputCls} />
                  <p className="text-xs text-gray-500 mt-1">Notifica quando il saldo scende sotto questa soglia</p>
                </div>
              )}

              {clientConfigForm.billing_mode !== 'prepaid' && (
                <>
                  <div>
                    <label className={labelCls}>Trigger fatturazione postpaid</label>
                    <select value={clientConfigForm.invoice_trigger}
                      onChange={e => setClientConfigForm(f => ({ ...f, invoice_trigger: e.target.value }))}
                      className={inputCls}>
                      <option value="monthly">Fine mese</option>
                      <option value="threshold">Al raggiungimento soglia</option>
                      <option value="both">Entrambi</option>
                    </select>
                  </div>

                  {(clientConfigForm.invoice_trigger === 'threshold' || clientConfigForm.invoice_trigger === 'both') && (
                    <div>
                      <label className={labelCls}>Soglia importo fattura (€)</label>
                      <input type="number" step="0.01" value={clientConfigForm.invoice_threshold_euros}
                        onChange={e => setClientConfigForm(f => ({ ...f, invoice_threshold_euros: e.target.value }))}
                        placeholder="50.00" className={inputCls} />
                      <p className="text-xs text-gray-500 mt-1">Genera fattura automaticamente quando l'outstanding supera questo importo</p>
                    </div>
                  )}

                  {(clientConfigForm.invoice_trigger === 'monthly' || clientConfigForm.invoice_trigger === 'both') && (
                    <p className="text-xs text-gray-500">Il giorno di fatturazione mensile è impostato globalmente da <strong className="text-gray-300">Impostazioni</strong>.</p>
                  )}
                </>
              )}
            </div>

            {clientConfigMsg && (
              <p className={`text-xs mt-3 ${clientConfigMsg === 'Salvato' ? 'text-green-400' : 'text-red-400'}`}>
                {clientConfigMsg}
              </p>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={() => setClientConfigModal(null)}
                className="flex-1 py-2 text-sm text-gray-400 border border-[#3A3D42] rounded-lg hover:text-white transition-colors">
                Annulla
              </button>
              <button onClick={saveClientConfig} disabled={clientConfigSaving}
                className="flex-1 py-2 text-sm bg-[#F59E0B] text-[#1e293b] font-semibold rounded-lg disabled:opacity-50 hover:bg-[#D97706] transition-colors">
                {clientConfigSaving ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
