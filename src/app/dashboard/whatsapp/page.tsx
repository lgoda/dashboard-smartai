'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import { useAuth } from '@/app/components/AuthProvider'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

type WhatsAppInstance = {
  id: string
  label: string | null
  status: 'not_connected' | 'waiting_qr' | 'connected' | 'disconnected' | 'error'
  remoteStatus: string | null
  sessionId: string | null
  phone: string | null
  pushName: string | null
  profileImageUrl: string | null
  n8nWebhookUrl: string | null
  n8nAgentName: string | null
  aiPaused: boolean
  lastError: string | null
  lastVerifiedAt: string | null
}

type Msg = { type: 'success' | 'error'; text: string } | null

export default function WhatsAppPage() {
  const { user, profile, accessToken, loading: authLoading } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [hasWhatsapp, setHasWhatsapp] = useState<boolean | null>(null)
  const [instances, setInstances] = useState<WhatsAppInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<Msg>(null)

  const headers = useCallback(
    () => ({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    [accessToken]
  )

  // Feature flag gating
  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('user_services')
      .select('has_whatsapp')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setHasWhatsapp(!!data?.has_whatsapp), () => setHasWhatsapp(false))
  }, [user?.id])

  const loadInstances = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    try {
      const res = await fetch('/api/whatsapp', { headers: headers(), cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Errore nel caricamento.')
      setInstances((data.instances || []) as WhatsAppInstance[])
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Errore.' })
    } finally {
      setLoading(false)
    }
  }, [accessToken, headers])

  useEffect(() => {
    if (hasWhatsapp && accessToken) loadInstances()
  }, [hasWhatsapp, accessToken, loadInstances])

  const handleCreate = async () => {
    setCreating(true)
    setMessage(null)
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ action: 'create', label: newLabel.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Errore.')
      setInstances((prev) => [...prev, data as WhatsAppInstance])
      setNewLabel('')
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Errore.' })
    } finally {
      setCreating(false)
    }
  }

  const updateInState = useCallback((inst: WhatsAppInstance) => {
    setInstances((prev) => prev.map((i) => (i.id === inst.id ? inst : i)))
  }, [])

  const removeFromState = useCallback((id: string) => {
    setInstances((prev) => prev.filter((i) => i.id !== id))
  }, [])

  if (authLoading || hasWhatsapp === null) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="h-8 w-48 bg-[#222428] rounded-lg loading mb-6" />
        <div className="h-48 bg-[#222428] rounded-xl loading" />
      </div>
    )
  }

  if (!hasWhatsapp) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-[#222428] rounded-xl p-8 border border-[#141517] text-center">
          <h1 className="text-xl font-semibold text-white mb-2">WhatsApp</h1>
          <p className="text-gray-400">
            Questa funzione non è abilitata per il tuo account. Contatta l’assistenza per attivarla.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">WhatsApp</h1>
        <p className="text-gray-400 mt-1">
          Collega uno o più numeri WhatsApp e associa a ciascuno un agente n8n che gestirà le
          interazioni.
        </p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg border ${
            message.type === 'success'
              ? 'bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/30'
              : 'bg-red-500/20 text-red-400 border-red-500/30'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Add new instance */}
      <div className="bg-[#222428] rounded-xl p-5 border border-[#141517] flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="block text-sm text-gray-300 mb-1">Nome numero (es. EOK, Ares)</label>
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Etichetta per riconoscere il numero"
            className="w-full px-4 py-2 border border-[#141517] bg-[#141517] rounded-lg focus:ring-2 focus:ring-[#F59E0B] focus:border-[#F59E0B] text-white placeholder-gray-500"
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="bg-[#F59E0B] text-[#1e293b] px-6 py-2.5 rounded-lg font-medium disabled:opacity-50 hover:bg-[#D97706] transition-colors"
        >
          {creating ? 'Aggiunta…' : 'Aggiungi numero'}
        </button>
      </div>

      {loading ? (
        <div className="h-48 bg-[#222428] rounded-xl loading" />
      ) : instances.length === 0 ? (
        <div className="bg-[#222428] rounded-xl p-8 border border-[#141517] text-center text-gray-400">
          Nessun numero WhatsApp. Aggiungine uno per iniziare.
        </div>
      ) : (
        instances.map((inst) => (
          <InstanceCard
            key={inst.id}
            instance={inst}
            headers={headers}
            isAdmin={isAdmin}
            onChange={updateInState}
            onDeleted={removeFromState}
            onMessage={setMessage}
          />
        ))
      )}
    </div>
  )
}

function InstanceCard({
  instance,
  headers,
  isAdmin,
  onChange,
  onDeleted,
  onMessage,
}: {
  instance: WhatsAppInstance
  headers: () => Record<string, string>
  isAdmin: boolean
  onChange: (i: WhatsAppInstance) => void
  onDeleted: (id: string) => void
  onMessage: (m: Msg) => void
}) {
  const [inst, setInst] = useState<WhatsAppInstance>(instance)
  const [qr, setQr] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState(instance.n8nWebhookUrl || '')
  const [agentName, setAgentName] = useState(instance.n8nAgentName || '')
  const [savingAgent, setSavingAgent] = useState(false)
  const [linkDays, setLinkDays] = useState(7)
  const [generating, setGenerating] = useState(false)
  const [shareLink, setShareLink] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const apply = useCallback(
    (i: WhatsAppInstance) => {
      setInst(i)
      onChange(i)
    },
    [onChange]
  )

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const [qrRes, stRes] = await Promise.all([
          fetch(`/api/whatsapp?id=${inst.id}&qr=1`, { headers: headers(), cache: 'no-store' }),
          fetch(`/api/whatsapp?id=${inst.id}`, { headers: headers(), cache: 'no-store' }),
        ])
        const qrData = await qrRes.json().catch(() => ({}))
        if (qrRes.ok) setQr(qrData.qrCode || qrData.qr || null)
        const stData = await stRes.json().catch(() => ({}))
        if (stRes.ok) {
          apply(stData as WhatsAppInstance)
          if ((stData as WhatsAppInstance).status === 'connected') {
            setQr(null)
            stopPolling()
            onMessage({ type: 'success', text: 'WhatsApp collegato con successo!' })
          }
        }
      } catch {
        /* keep polling */
      }
    }, 3000)
  }, [headers, inst.id, apply, stopPolling, onMessage])

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/whatsapp', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ ...payload, instanceId: inst.id }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error || 'Errore.')
    return data
  }

  const handleConnect = async () => {
    setConnecting(true)
    onMessage(null)
    try {
      const data = await post({ action: 'connect' })
      apply(data as WhatsAppInstance)
      if ((data as WhatsAppInstance).status !== 'connected') startPolling()
    } catch (error) {
      onMessage({ type: 'error', text: error instanceof Error ? error.message : 'Errore.' })
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Scollegare questo WhatsApp?')) return
    onMessage(null)
    stopPolling()
    setQr(null)
    try {
      apply((await post({ action: 'disconnect' })) as WhatsAppInstance)
      onMessage({ type: 'success', text: 'WhatsApp scollegato.' })
    } catch (error) {
      onMessage({ type: 'error', text: error instanceof Error ? error.message : 'Errore.' })
    }
  }

  const handleDelete = async () => {
    if (!confirm('Rimuovere definitivamente questo numero e la sua sessione?')) return
    onMessage(null)
    stopPolling()
    try {
      await post({ action: 'delete' })
      onDeleted(inst.id)
    } catch (error) {
      onMessage({ type: 'error', text: error instanceof Error ? error.message : 'Errore.' })
    }
  }

  const handleSaveAgent = async () => {
    if (!webhookUrl.trim()) {
      onMessage({ type: 'error', text: 'Inserisci l’URL del webhook n8n.' })
      return
    }
    setSavingAgent(true)
    onMessage(null)
    try {
      const data = await post({
        action: 'set_agent',
        n8nWebhookUrl: webhookUrl.trim(),
        n8nAgentName: agentName.trim(),
      })
      apply(data as WhatsAppInstance)
      onMessage({ type: 'success', text: 'Agente n8n associato.' })
    } catch (error) {
      onMessage({ type: 'error', text: error instanceof Error ? error.message : 'Errore.' })
    } finally {
      setSavingAgent(false)
    }
  }

  const handleGenerateLink = async () => {
    // Generare il link prepara una NUOVA scansione: se c'è già un numero
    // collegato verrà scollegato per permettere il nuovo QR.
    if (inst.status === 'connected') {
      const ok = confirm(
        `Generando il link, il numero attualmente collegato${
          inst.phone ? ` (+${inst.phone})` : ''
        } verrà scollegato per consentire una nuova scansione. Continuare?`
      )
      if (!ok) return
    }
    setGenerating(true)
    onMessage(null)
    setShareLink(null)
    try {
      const res = await fetch('/api/admin/whatsapp/connect-link', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ instanceId: inst.id, days: linkDays }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Errore.')
      setShareLink(data.link as string)
      // L'istanza è stata azzerata lato server: rifletti lo stato non collegato.
      apply({
        ...inst,
        status: 'not_connected',
        phone: null,
        pushName: null,
        profileImageUrl: null,
        sessionId: null,
        aiPaused: false,
      })
      setQr(null)
      onMessage({ type: 'success', text: data.message || 'Link generato.' })
    } catch (error) {
      onMessage({ type: 'error', text: error instanceof Error ? error.message : 'Errore.' })
    } finally {
      setGenerating(false)
    }
  }

  const copyLink = async () => {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
      onMessage({ type: 'success', text: 'Link copiato negli appunti.' })
    } catch {
      onMessage({ type: 'error', text: 'Copia non riuscita: seleziona e copia manualmente.' })
    }
  }

  const togglePause = async () => {
    onMessage(null)
    const goingToPause = !inst.aiPaused
    try {
      const data = await post({ action: goingToPause ? 'pause' : 'resume' })
      apply(data as WhatsAppInstance)
      onMessage({
        type: 'success',
        text: goingToPause
          ? 'IA in pausa: rispondi pure tu dall’app WhatsApp. I messaggi non passano all’agente.'
          : 'IA riattivata: l’agente riprende a rispondere.',
      })
    } catch (error) {
      onMessage({ type: 'error', text: error instanceof Error ? error.message : 'Errore.' })
    }
  }

  const handleClearAgent = async () => {
    if (!confirm('Rimuovere l’associazione con l’agente n8n?')) return
    setSavingAgent(true)
    onMessage(null)
    try {
      const data = await post({ action: 'clear_agent' })
      apply(data as WhatsAppInstance)
      setWebhookUrl('')
      setAgentName('')
      onMessage({ type: 'success', text: 'Associazione rimossa.' })
    } catch (error) {
      onMessage({ type: 'error', text: error instanceof Error ? error.message : 'Errore.' })
    } finally {
      setSavingAgent(false)
    }
  }

  const isConnected = inst.status === 'connected'
  const initials = (inst.pushName || inst.phone || 'WA').slice(0, 2).toUpperCase()

  return (
    <div className="bg-[#222428] rounded-xl border border-[#141517] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#141517]">
        <h2 className="text-lg font-semibold text-white">{inst.label || 'Numero WhatsApp'}</h2>
        <button
          onClick={handleDelete}
          className="text-xs px-3 py-1.5 rounded-lg font-medium text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors"
        >
          Rimuovi
        </button>
      </div>

      {/* Connection */}
      <div className="px-6 py-5">
        {isConnected ? (
          <div className="flex items-center gap-4">
            {inst.profileImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={inst.profileImageUrl}
                alt="Profilo WhatsApp"
                className="w-16 h-16 rounded-full object-cover border border-[#141517]"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#25D366] flex items-center justify-center text-white font-bold text-lg">
                {initials}
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-medium">{inst.pushName || 'WhatsApp'}</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30">
                  Collegato
                </span>
                {inst.aiPaused && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30">
                    IA in pausa
                  </span>
                )}
              </div>
              {inst.phone && <p className="text-gray-400 text-sm mt-0.5">+{inst.phone}</p>}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              {inst.n8nWebhookUrl && (
                <button
                  onClick={togglePause}
                  className={`px-4 py-2 rounded-lg font-medium border transition-colors ${
                    inst.aiPaused
                      ? 'bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/30 hover:bg-[#22C55E]/30'
                      : 'bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/30 hover:bg-[#F59E0B]/30'
                  }`}
                  title={inst.aiPaused ? 'Riattiva l’agente IA' : 'Metti in pausa l’IA per rispondere tu'}
                >
                  {inst.aiPaused ? 'Riprendi IA' : 'Pausa IA'}
                </button>
              )}
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 rounded-lg font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-colors"
              >
                Scollega
              </button>
            </div>
          </div>
        ) : qr ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-gray-300 text-sm text-center">
              Apri WhatsApp sul telefono → <strong>Dispositivi collegati</strong> →{' '}
              <strong>Collega un dispositivo</strong> e inquadra il QR code.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
              alt="QR Code WhatsApp"
              className="w-64 h-64 rounded-lg bg-white p-2"
            />
            <p className="text-gray-500 text-xs">In attesa della scansione…</p>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-gray-400 text-sm">
              Nessun WhatsApp collegato. Avvia la connessione per generare il QR code.
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="bg-[#F59E0B] text-[#1e293b] px-6 py-3 rounded-lg font-medium disabled:opacity-50 shadow-lg hover:bg-[#D97706] transition-colors"
            >
              {connecting ? 'Generazione QR…' : 'Collega WhatsApp'}
            </button>
            {inst.lastError && <p className="text-red-400 text-xs">{inst.lastError}</p>}
          </div>
        )}
      </div>

      {/* Admin: link di scansione per il cliente */}
      {isAdmin && (
        <div className="px-6 py-5 border-t border-[#141517]">
          <h3 className="text-base font-semibold text-white mb-1">Link di scansione per il cliente</h3>
          <p className="text-gray-400 text-sm mb-4">
            Genera un link da inviare al cliente: lo apre senza accedere alla dashboard, scansiona il QR e
            collega il suo WhatsApp. Il numero collegato comparirà qui sopra.
          </p>
          <div className="flex items-end gap-3">
            <div className="shrink-0">
              <label className="block text-sm text-gray-300 mb-1">Validità (giorni)</label>
              <input
                type="number"
                min={1}
                max={30}
                value={linkDays}
                onChange={(e) => setLinkDays(Math.min(30, Math.max(1, Number(e.target.value) || 7)))}
                className="w-20 px-3 py-2 border border-[#141517] bg-[#141517] rounded-lg focus:ring-2 focus:ring-[#F59E0B] focus:border-[#F59E0B] text-white"
              />
            </div>
            <button
              onClick={handleGenerateLink}
              disabled={generating}
              className="flex-1 bg-[#F59E0B] text-[#1e293b] px-5 py-2.5 rounded-lg font-medium disabled:opacity-50 hover:bg-[#D97706] transition-colors whitespace-nowrap"
            >
              {generating ? 'Generazione…' : 'Genera link di scansione'}
            </button>
          </div>
          {shareLink && (
            <div className="mt-3 rounded-lg border border-[#141517] bg-[#141517] p-3">
              <div className="flex items-start gap-2">
                <code className="flex-1 min-w-0 break-all text-xs text-gray-300 leading-relaxed">
                  {shareLink}
                </code>
                <button
                  onClick={copyLink}
                  className="shrink-0 px-3 py-1.5 text-xs rounded-md font-medium bg-[#222428] text-white border border-[#141517] hover:bg-[#2C2E31] transition-colors"
                >
                  Copia
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* n8n agent */}
      <div className="px-6 py-5 border-t border-[#141517]">
        <h3 className="text-base font-semibold text-white mb-1">Agente n8n</h3>
        <p className="text-gray-400 text-sm mb-4">
          Ogni messaggio in arrivo su questo numero verrà inoltrato al webhook dell’agente.
        </p>

        {!isConnected ? (
          <p className="text-gray-500 text-sm">Collega prima WhatsApp per associare un agente.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Nome agente (facoltativo)</label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Es. Maria Ares WhatsApp"
                className="w-full px-4 py-2 border border-[#141517] bg-[#141517] rounded-lg focus:ring-2 focus:ring-[#F59E0B] focus:border-[#F59E0B] text-white placeholder-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">URL webhook n8n</label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://n8n.tuodominio.com/webhook/..."
                className="w-full px-4 py-2 border border-[#141517] bg-[#141517] rounded-lg focus:ring-2 focus:ring-[#F59E0B] focus:border-[#F59E0B] text-white placeholder-gray-500"
              />
            </div>

            {inst.n8nWebhookUrl && (
              <div className="text-xs text-gray-400">
                Agente attuale:{' '}
                <span className="text-[#22C55E]">{inst.n8nAgentName || inst.n8nWebhookUrl}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSaveAgent}
                disabled={savingAgent}
                className="bg-[#F59E0B] text-[#1e293b] px-6 py-2.5 rounded-lg font-medium disabled:opacity-50 hover:bg-[#D97706] transition-colors"
              >
                {savingAgent ? 'Salvataggio…' : 'Salva associazione'}
              </button>
              {inst.n8nWebhookUrl && (
                <button
                  onClick={handleClearAgent}
                  disabled={savingAgent}
                  className="px-6 py-2.5 rounded-lg font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-colors disabled:opacity-50"
                >
                  Rimuovi
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
