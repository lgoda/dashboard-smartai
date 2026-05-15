'use client'

import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from './lib/supabaseClient'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const authAppearance = {
  theme: ThemeSupa,
  style: {
    button: {
      background: '#F59E0B', color: '#1e293b', borderRadius: '0.5rem',
      border: 'none', padding: '0.75rem 1rem', fontSize: '0.875rem',
      fontWeight: '600', transition: 'all 0.2s ease',
    },
    input: {
      borderRadius: '0.5rem', border: '1px solid #141517', background: '#141517',
      color: 'white', padding: '0.75rem 1rem', fontSize: '0.875rem',
      transition: 'all 0.2s ease',
    },
    label: { fontSize: '0.875rem', fontWeight: '500', color: '#d1d5db', marginBottom: '0.5rem' },
    message: { borderRadius: '0.5rem', padding: '0.75rem', fontSize: '0.875rem', marginTop: '0.5rem' },
  },
  variables: {
    default: {
      colors: {
        brand: '#F59E0B', brandAccent: '#D97706', inputBackground: '#141517',
        inputBorder: '#141517', inputBorderHover: '#222428', inputBorderFocus: '#F59E0B',
        inputText: 'white', anchorTextColor: '#F59E0B', anchorTextHoverColor: '#D97706',
      },
      borderWidths: { buttonBorderWidth: '0px', inputBorderWidth: '1px' },
      radii: { borderRadiusButton: '0.5rem', buttonBorderRadius: '0.5rem', inputBorderRadius: '0.5rem' },
    },
  },
}

function SetPasswordForm({ accessToken, onSuccess }: { accessToken: string; onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) { setError('La password deve avere almeno 6 caratteri.'); return }
    if (password !== confirm) { setError('Le password non coincidono.'); return }

    setLoading(true)
    try {
      // Use a plain fetch — no supabase client involved to avoid PKCE state conflicts
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(15000),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Errore durante il salvataggio.')
      } else {
        onSuccess()
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
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [authView, setAuthView] = useState<'sign_in' | 'update_password'>('sign_in')
  const needsPasswordRef = useRef(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  // Se l'utente apre un link invite/recovery mentre è già loggato con un altro account
  const [sessionConflict, setSessionConflict] = useState<{ existingEmail: string } | null>(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        needsPasswordRef.current = true
        setAuthView('update_password')
        setSessionReady(true)
      } else if (event === 'SIGNED_IN' && session) {
        if (!needsPasswordRef.current) {
          router.push('/dashboard')
        } else {
          setInviteToken(session.access_token)
          setSessionReady(true)
        }
      } else if (event === 'USER_UPDATED') {
        router.push('/dashboard')
      }
    })

    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const searchParams = new URLSearchParams(window.location.search)
    const type = hashParams.get('type') || searchParams.get('type')

    if (type === 'invite' || type === 'recovery') {
      needsPasswordRef.current = true
      setAuthView('update_password')

      const access_token = hashParams.get('access_token')
      const refresh_token = hashParams.get('refresh_token')

      if (access_token && refresh_token) {
        // ── PROTEZIONE: controlla se c'è già una sessione attiva ──
        // Se sì, non sovrascriverla: mostra un avviso invece.
        supabase.auth.getSession().then(({ data: { session: existing } }) => {
          if (existing?.user) {
            // Sessione già attiva → conflitto, non fare setSession
            setSessionConflict({ existingEmail: existing.user.email ?? 'account esistente' })
            setAuthView('sign_in') // torna alla sign_in per non mostrare il form password
            return
          }
          // Nessuna sessione attiva → procedi normalmente
          setInviteToken(access_token)
          supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
            if (error) {
              console.error('[invite] setSession error:', error.message)
              setSessionReady(true)
            }
          })
        })
      } else {
        const code = searchParams.get('code')
        if (code) {
          supabase.auth.exchangeCodeForSession(code).catch(console.error)
        } else {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setSessionReady(true)
          })
        }
      }
    }

    return () => subscription.unsubscribe()
  }, [router])

  return (
    <div className="min-h-screen bg-[#18191C] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mx-auto mb-6">
            <img src="/logo-smartservice.png" alt="SmartService" className="h-20 w-auto" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Dashboard SmartService</h1>
          <p className="text-gray-300">Accedi per gestire i tuoi servizi AI e visualizzare le statistiche</p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-full text-xs text-[#F59E0B]">
            🔒 Accesso su invito
          </div>
        </div>

        {/* Banner conflitto sessione: link invito aperto nello stesso browser */}
        {sessionConflict && (
          <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm">
            <p className="text-amber-400 font-semibold mb-1">⚠️ Sei già loggato come {sessionConflict.existingEmail}</p>
            <p className="text-amber-300/80 text-xs leading-relaxed">
              Questo link di invito è per un altro utente. Aprilo in una finestra in <strong>incognito</strong> o in un browser diverso per impostare la password del nuovo account senza disconnettere la sessione corrente.
            </p>
          </div>
        )}

        <div className="bg-[#222428] rounded-2xl shadow-xl border border-[#141517] p-8">
          {authView === 'update_password' ? (
            <>
              <h2 className="text-white font-semibold text-lg mb-1">Imposta la tua password</h2>
              <p className="text-gray-400 text-sm mb-6">Scegli una password per accedere alla dashboard.</p>
              {sessionReady && inviteToken ? (
                <SetPasswordForm accessToken={inviteToken} onSuccess={() => router.push('/dashboard')} />
              ) : (
                <div className="flex items-center justify-center gap-3 py-6 text-gray-400 text-sm">
                  <div className="w-4 h-4 border-2 border-[#F59E0B] border-t-transparent rounded-full animate-spin" />
                  Verifica del link in corso...
                </div>
              )}
            </>
          ) : (
            <Auth
              supabaseClient={supabase}
              view="sign_in"
              showLinks={false}
              appearance={authAppearance}
              providers={[]}
              localization={{
                variables: {
                  sign_in: {
                    email_label: 'Email',
                    password_label: 'Password',
                    button_label: 'Accedi',
                    loading_button_label: 'Accesso in corso...',
                    social_provider_text: 'Accedi con {{provider}}',
                    link_text: 'Hai già un account? Accedi',
                  },
                  forgotten_password: {
                    email_label: 'Email',
                    button_label: 'Invia istruzioni per il reset',
                    loading_button_label: 'Invio in corso...',
                    link_text: 'Password dimenticata?',
                    confirmation_text: 'Controlla la tua email per il link di reset',
                  },
                },
              }}
            />
          )}
        </div>

        <div className="text-center mt-8 text-sm text-gray-400">
          <p>Gestisci i tuoi servizi AI in modo semplice e professionale</p>
        </div>
      </div>
    </div>
  )
}
