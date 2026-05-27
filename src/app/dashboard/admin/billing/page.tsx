'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/components/AuthProvider'

export const dynamic = 'force-dynamic'

type Tab = 'clienti' | 'agent' | 'pacchetti' | 'impostazioni'

type ClientRow = {
  id: string
  full_name: string
  company: string
  balance: { balance_minutes: number; balance_cents: number }
  billing_config: { billing_mode: string; margin_percent: number | null; auto_recharge_enabled: boolean } | null
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

type RetellAgent = { agent_id: string; agent_name: string }

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
}

function fmt(minutes: number) {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`
  return `${minutes.toFixed(1)} min`
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

  // ── agent ──
  const [mappings, setMappings] = useState<AgentMapping[]>([])
  const [retellAgents, setRetellAgents] = useState<RetellAgent[]>([])
  const [retellApiConfigured, setRetellApiConfigured] = useState(true)
  const [agentsLoading, setAgentsLoading] = useState(false)
  type AgentRowState = { userId: string; pricePerMinuteCents: string; saving: boolean; msg: string | null }
  const [agentRows, setAgentRows] = useState<Record<string, AgentRowState>>({})

  // ── pacchetti ──
  const [packages, setPackages] = useState<Package[]>([])
  const [pkgLoading, setPkgLoading] = useState(false)
  const [pkgForm, setPkgForm] = useState({ name: '', minutes: '', price_cents: '' })
  const [pkgSaving, setPkgSaving] = useState(false)
  const [pkgMsg, setPkgMsg] = useState<string | null>(null)

  // ── impostazioni ──
  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [configForm, setConfigForm] = useState({ default_margin_percent: '', usd_eur_rate: '', notification_email: '', retell_billing_api_token: '' })
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

  // Bug 1 fix: load clients on mount so they're available in Agent tab dropdown too
  useEffect(() => {
    if (accessToken) fetchClients()
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
        const rows: Record<string, { userId: string; pricePerMinuteCents: string; saving: boolean; msg: string | null }> = {}
        for (const m of loadedMappings) {
          rows[m.agent_id] = {
            userId: m.user_id,
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
      })
    }
  }, [accessToken, headers])

  useEffect(() => {
    if (!accessToken) return
    if (tab === 'clienti')      fetchClients()
    if (tab === 'agent')        fetchAgents()
    if (tab === 'pacchetti')    fetchPackages()
    if (tab === 'impostazioni') fetchConfig()
  }, [tab, accessToken, fetchClients, fetchAgents, fetchPackages, fetchConfig])

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
  const saveAgentRow = async (agentId: string, agentName: string) => {
    const row = agentRows[agentId]
    if (!row?.userId) return
    setAgentRows(prev => ({ ...prev, [agentId]: { ...prev[agentId], saving: true, msg: null } }))
    const r = await fetch('/api/billing/admin/agents', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        agent_id: agentId,
        user_id: row.userId,
        agent_name: agentName || null,
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

  // ── pacchetto ──
  const savePkg = async () => {
    if (!pkgForm.name || !pkgForm.minutes || !pkgForm.price_cents) return
    setPkgSaving(true)
    setPkgMsg(null)
    const r = await fetch('/api/billing/packages', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ name: pkgForm.name, minutes: Number(pkgForm.minutes), price_cents: Number(pkgForm.price_cents) }),
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
        if (j.skipped_no_mapping) parts.push(`${j.skipped_no_mapping} senza mapping`)
        if (j.skipped_duplicate)  parts.push(`${j.skipped_duplicate} duplicate`)
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
        <div className="flex gap-1 mb-6 bg-[#2C2E31] p-1 rounded-xl w-fit">
          {tabBtn('clienti', 'Clienti')}
          {tabBtn('agent', 'Agent')}
          {tabBtn('pacchetti', 'Pacchetti')}
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

                    <div className="flex gap-4 text-sm">
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
                      {c.billing_config && (
                        <div className="text-center">
                          <div className="font-bold text-lg text-white">{c.billing_config.margin_percent ?? '—'}%</div>
                          <div className="text-xs text-gray-500">margine</div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => { setCreditModal(c); setCreditMsg(null); setCreditMinutes(''); setCreditDesc('') }}
                      className="shrink-0 px-3 py-1.5 text-xs font-medium bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30 rounded-lg hover:bg-[#F59E0B]/30 transition-colors"
                    >
                      + Credito
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: AGENT ── */}
        {tab === 'agent' && (
          <div className="space-y-4">
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
                <div className="hidden sm:grid sm:grid-cols-[1fr_1.5fr_140px_80px] gap-3 px-4 py-1 text-xs text-gray-500 font-medium uppercase tracking-wide">
                  <span>Agent</span>
                  <span>Cliente</span>
                  <span>€/min (opt.)</span>
                  <span></span>
                </div>

                {retellAgents.map(agent => {
                  const row = agentRows[agent.agent_id] ?? { userId: '', pricePerMinuteCents: '', saving: false, msg: null }
                  const isMapped = mappings.some(m => m.agent_id === agent.agent_id)
                  return (
                    <div key={agent.agent_id} className="bg-[#2C2E31] rounded-xl p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_140px_80px] gap-3 items-center">
                        {/* Agent info */}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-white truncate">{agent.agent_name}</span>
                            {isMapped && (
                              <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full shrink-0">assegnato</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 font-mono mt-0.5">{agent.agent_id.slice(0, 18)}…</div>
                        </div>

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
                          title="Centesimi di euro per minuto. Lascia vuoto per usare il margine % globale."
                        />

                        {/* Save */}
                        <button
                          onClick={() => saveAgentRow(agent.agent_id, agent.agent_name)}
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
                  <label className={labelCls}>Prezzo (centesimi €)</label>
                  <input type="number" value={pkgForm.price_cents} onChange={e => setPkgForm(f => ({ ...f, price_cents: e.target.value }))}
                    placeholder="2900 = €29.00" className={inputCls} />
                </div>
              </div>
              {pkgMsg && <p className={`text-xs mt-2 ${pkgMsg.includes('creato') ? 'text-green-400' : 'text-red-400'}`}>{pkgMsg}</p>}
              <button onClick={savePkg} disabled={pkgSaving}
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
              <button onClick={saveCredit} disabled={creditSaving || !creditMinutes || !creditDesc}
                className="flex-1 py-2 text-sm bg-[#F59E0B] text-[#1e293b] font-semibold rounded-lg disabled:opacity-50 hover:bg-[#D97706] transition-colors">
                {creditSaving ? 'Salvataggio...' : 'Conferma'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
