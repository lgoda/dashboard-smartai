'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

type State = {
  label: string | null
  status: 'not_connected' | 'waiting_qr' | 'connected' | 'disconnected' | 'error'
  phone: string | null
  pushName: string | null
  profileImageUrl: string | null
  lastError: string | null
}

export default function CollegaWhatsappPage() {
  const [token, setToken] = useState<string | null>(null)
  const [tokenChecked, setTokenChecked] = useState(false)
  const [state, setState] = useState<State | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token')
    setToken(t)
    setTokenChecked(true)
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  const startPolling = useCallback(
    (t: string) => {
      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const [qrRes, stRes] = await Promise.all([
            fetch(`/api/whatsapp/link?token=${encodeURIComponent(t)}&qr=1`, { cache: 'no-store' }),
            fetch(`/api/whatsapp/link?token=${encodeURIComponent(t)}`, { cache: 'no-store' }),
          ])
          const qrData = await qrRes.json().catch(() => ({}))
          if (qrRes.ok) setQr(qrData.qrCode || qrData.qr || null)
          const stData = await stRes.json().catch(() => ({}))
          if (stRes.ok) {
            setState(stData as State)
            if ((stData as State).status === 'connected') {
              setQr(null)
              stopPolling()
            }
          }
        } catch {
          /* keep polling */
        }
      }, 3000)
    },
    [stopPolling]
  )

  // Avvia il collegamento appena la pagina ha il token.
  useEffect(() => {
    if (!tokenChecked || !token) return
    let cancelled = false
    ;(async () => {
      setConnecting(true)
      setError(null)
      try {
        const res = await fetch('/api/whatsapp/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, action: 'connect' }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'Errore.')
        if (cancelled) return
        setState(data as State)
        if ((data as State).status !== 'connected') startPolling(token)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Errore.')
      } finally {
        if (!cancelled) setConnecting(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tokenChecked, token, startPolling])

  const isConnected = state?.status === 'connected'

  return (
    <div className="min-h-screen bg-[#18191C] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mx-auto mb-6">
            <img src="/logo-smartservice.png" alt="SmartService" className="h-20 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-white">Collega il tuo WhatsApp</h1>
        </div>

        <div className="bg-[#222428] rounded-2xl shadow-xl border border-[#141517] p-8">
          {!tokenChecked ? (
            <div className="flex items-center justify-center gap-3 py-6 text-gray-400 text-sm">
              <div className="w-4 h-4 border-2 border-[#F59E0B] border-t-transparent rounded-full animate-spin" />
              Caricamento…
            </div>
          ) : !token ? (
            <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-sm">
              Link non valido: token mancante. Chiedi un nuovo link a chi te l’ha inviato.
            </div>
          ) : error ? (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-sm">
                {error.includes('scadut') || error.includes('non valido')
                  ? 'Il link non è più valido o è scaduto. Chiedine uno nuovo a chi te l’ha inviato.'
                  : error}
              </div>
            </div>
          ) : isConnected ? (
            <div className="text-center space-y-4">
              {state?.profileImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={state.profileImageUrl}
                  alt="Profilo WhatsApp"
                  className="w-20 h-20 mx-auto rounded-full object-cover border border-[#141517]"
                />
              ) : (
                <div className="w-16 h-16 mx-auto rounded-full bg-[#25D366] flex items-center justify-center text-white text-2xl">
                  ✓
                </div>
              )}
              <div>
                <h2 className="text-white font-semibold text-lg mb-1">WhatsApp collegato!</h2>
                {state?.pushName && <p className="text-gray-300">{state.pushName}</p>}
                {state?.phone && (
                  <p className="text-[#22C55E] font-semibold text-lg mt-1">+{state.phone}</p>
                )}
              </div>
              <div className="p-3 rounded-lg bg-[#141517] text-gray-300 text-sm">
                Comunica questo numero a chi ti ha inviato il link. Puoi chiudere questa pagina.
              </div>
            </div>
          ) : qr ? (
            <div className="flex flex-col items-center gap-4">
              <p className="text-gray-300 text-sm text-center">
                Sul telefono apri <strong>WhatsApp</strong> → <strong>Dispositivi collegati</strong> →{' '}
                <strong>Collega un dispositivo</strong> e inquadra il QR.
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
            <div className="flex items-center justify-center gap-3 py-6 text-gray-400 text-sm">
              <div className="w-4 h-4 border-2 border-[#F59E0B] border-t-transparent rounded-full animate-spin" />
              {connecting ? 'Generazione QR…' : 'Preparazione…'}
            </div>
          )}
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          Collegando WhatsApp consenti l’invio e la ricezione di messaggi tramite questo servizio.
        </p>
      </div>
    </div>
  )
}
