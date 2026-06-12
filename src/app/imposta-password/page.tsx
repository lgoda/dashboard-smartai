'use client'

import { useEffect, useState } from 'react'

// Decodifica best-effort dell'email dal payload del token (solo per mostrarla).
function emailFromToken(token: string): string | null {
  try {
    const body = token.split('.')[0]
    const pad = body.length % 4 === 0 ? '' : '='.repeat(4 - (body.length % 4))
    const json = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/') + pad))
    return typeof json.email === 'string' ? json.email : null
  } catch {
    return null
  }
}

export default function ImpostaPasswordPage() {
  const [token, setToken] = useState<string | null>(null)
  const [tokenChecked, setTokenChecked] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token')
    setToken(t)
    if (t) setEmail(emailFromToken(t))
    setTokenChecked(true)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!token) { setError('Link non valido.'); return }
    if (password.length < 6) { setError('La password deve avere almeno 6 caratteri.'); return }
    if (password !== confirm) { setError('Le password non coincidono.'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/set-password-by-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
        signal: AbortSignal.timeout(15000),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Errore durante il salvataggio.')
      } else {
        setDone(true)
      }
    } catch (err) {
      setError(err instanceof Error && err.name === 'AbortError'
        ? 'Timeout — riprova tra qualche secondo.'
        : 'Errore di connessione.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#18191C] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mx-auto mb-6">
            <img src="/logo-smartservice.png" alt="SmartService" className="h-20 w-auto" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Dashboard SmartService</h1>
        </div>

        <div className="bg-[#222428] rounded-2xl shadow-xl border border-[#141517] p-8">
          {done ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#22C55E]/15 flex items-center justify-center text-[#22C55E] text-2xl">✓</div>
              <div>
                <h2 className="text-white font-semibold text-lg mb-1">Password impostata</h2>
                <p className="text-gray-400 text-sm">
                  {email ? <>L&apos;account <strong className="text-gray-200">{email}</strong> è pronto.</> : 'Il tuo account è pronto.'} Ora puoi accedere.
                </p>
              </div>
              <a
                href="/"
                className="inline-block w-full py-3 px-4 bg-[#F59E0B] text-[#1e293b] rounded-lg font-semibold hover:bg-[#D97706] transition-colors"
              >
                Vai all&apos;accesso
              </a>
            </div>
          ) : !tokenChecked ? (
            <div className="flex items-center justify-center gap-3 py-6 text-gray-400 text-sm">
              <div className="w-4 h-4 border-2 border-[#F59E0B] border-t-transparent rounded-full animate-spin" />
              Caricamento...
            </div>
          ) : !token ? (
            <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-sm">
              Link non valido: token mancante. Chiedi un nuovo link all&apos;amministratore.
            </div>
          ) : (
            <>
              <h2 className="text-white font-semibold text-lg mb-1">Imposta la password</h2>
              <p className="text-gray-400 text-sm mb-6">
                {email
                  ? <>Scegli una password per l&apos;account <strong className="text-gray-200">{email}</strong>.</>
                  : 'Scegli una password per accedere alla dashboard.'}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Nuova password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Almeno 6 caratteri"
                    required
                    className="w-full px-4 py-3 rounded-lg bg-[#141517] border border-[#141517] text-white placeholder-gray-500 focus:outline-none focus:border-[#F59E0B] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Conferma password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Ripeti la password"
                    required
                    className="w-full px-4 py-3 rounded-lg bg-[#141517] border border-[#141517] text-white placeholder-gray-500 focus:outline-none focus:border-[#F59E0B] transition-colors"
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-[#F59E0B] text-[#1e293b] rounded-lg font-semibold hover:bg-[#D97706] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Salvataggio in corso...' : 'Imposta password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
