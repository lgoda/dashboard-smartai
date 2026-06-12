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

// Estrae l'email dal payload di un access_token JWT (senza verificarne la firma —
// serve solo per mostrare all'utente di chi sta impostando la password).
function decodeJwtEmail(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof json.email === 'string' ? json.email : null
  } catch {
    return null
  }
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
  // Email del destinatario del link (decodificata dal token) e dell'eventuale
  // sessione già attiva nel browser — mostrate a scopo informativo nel form.
  const [targetEmail, setTargetEmail] = useState<string | null>(null)
  const [existingEmail, setExistingEmail] = useState<string | null>(null)
  // true quando chi apre il link è già loggato: la sua sessione viene preservata,
  // quindi a fine flusso NON va disconnesso.
  const existingSessionRef = useRef(false)
  // true solo nel flusso "code" (PKCE), dove creiamo una sessione temporanea
  // che va chiusa dopo aver impostato la password.
  const usedTempSessionRef = useRef(false)
  const [passwordJustSet, setPasswordJustSet] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        if (!needsPasswordRef.current) {
          // Login normale — vai alla dashboard
          router.push('/dashboard')
        } else {
          // Flow invito/recovery — mostra il form per impostare la password
          setInviteToken(session.access_token)
          setSessionReady(true)
        }
      }
      // PASSWORD_RECOVERY e USER_UPDATED non gestiti qui:
      // - PASSWORD_RECOVERY non scatta con detectSessionInUrl:false
      // - USER_UPDATED: il sign-out post-password avviene in onSuccess del form
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
        // L'API /api/auth/set-password è stateless: le basta l'access_token come
        // Bearer per verificare l'utente e aggiornare la password. Quindi NON tocchiamo
        // la sessione del browser. Così, anche se sei già loggato (es. come admin) e apri
        // il link nello stesso browser, puoi impostare la password del nuovo utente senza
        // disconnettere la tua sessione.
        setTargetEmail(decodeJwtEmail(access_token))
        setInviteToken(access_token)
        setSessionReady(true)
        // Rileva (solo per mostrarlo nel form) se c'è già una sessione attiva.
        supabase.auth.getSession().then(({ data: { session: existing } }) => {
          if (existing?.user) {
            existingSessionRef.current = true
            setExistingEmail(existing.user.email ?? null)
          }
        })
      } else {
        const code = searchParams.get('code')
        if (code) {
          // Flusso PKCE: bisogna scambiare il code per ottenere un access_token, e questo
          // crea una sessione temporanea (chiusa in onSuccess dopo il salvataggio).
          // L'access_token e sessionReady arrivano dall'evento SIGNED_IN.
          sessionStorage.setItem('smartbot-invite-flow', '1')
          usedTempSessionRef.current = true
          supabase.auth.exchangeCodeForSession(code).catch(err => {
            console.error('[invite] exchangeCodeForSession error:', err)
            sessionStorage.removeItem('smartbot-invite-flow')
            usedTempSessionRef.current = false
          })
        } else {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setSessionReady(true)
          })
        }
      }
    }

    // Mostra il banner di successo se arriviamo da un reset/invito completato
    if (new URLSearchParams(window.location.search).get('passwordSet') === '1') {
      setPasswordJustSet(true)
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

        {/* Banner password impostata con successo */}
        {passwordJustSet && (
          <div className="mb-4 p-4 bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-xl text-sm">
            <p className="text-[#22C55E] font-semibold mb-0.5">✓ Password impostata con successo</p>
            <p className="text-[#22C55E]/80 text-xs">Accedi con la tua email e la nuova password.</p>
          </div>
        )}

        <div className="bg-[#222428] rounded-2xl shadow-xl border border-[#141517] p-8">
          {authView === 'update_password' ? (
            <>
              <h2 className="text-white font-semibold text-lg mb-1">Imposta la password</h2>
              <p className="text-gray-400 text-sm mb-6">
                {targetEmail
                  ? <>Scegli una password per l&apos;account <strong className="text-gray-200">{targetEmail}</strong>.</>
                  : 'Scegli una password per accedere alla dashboard.'}
              </p>
              {existingEmail && (
                <div className="mb-6 -mt-2 p-3 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-xs text-[#F59E0B]/90 leading-relaxed">
                  Sei attualmente loggato come <strong>{existingEmail}</strong>. Questa operazione imposta solo la password{targetEmail ? <> di <strong>{targetEmail}</strong></> : ' del nuovo utente'} — la tua sessione resterà attiva.
                </div>
              )}
              {sessionReady && inviteToken ? (
                <SetPasswordForm accessToken={inviteToken} onSuccess={async () => {
                  sessionStorage.removeItem('smartbot-invite-flow')
                  // Usa window.location.replace (full reload) invece di router.replace:
                  // router.replace non rimonta il componente e lascerebbe authView='update_password'.
                  if (usedTempSessionRef.current) {
                    // Flusso code (PKCE): chiudi la sessione temporanea e vai al login.
                    await supabase.auth.signOut({ scope: 'local' }).catch(console.error)
                    window.location.replace('/?passwordSet=1')
                  } else if (existingSessionRef.current) {
                    // Eri già loggato: sessione preservata, torna alla dashboard.
                    window.location.replace('/dashboard/admin')
                  } else {
                    // Nessuna sessione creata: vai al login con la conferma.
                    window.location.replace('/?passwordSet=1')
                  }
                }} />
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

        <div className="text-center mt-8 text-sm text-gray-400 space-y-1">
          <p>Gestisci i tuoi servizi AI in modo semplice e professionale</p>
          <p>
            <a href="/reset" className="text-gray-600 hover:text-gray-400 transition-colors text-xs underline underline-offset-2">
              Problemi di accesso? Reimposta la sessione
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
