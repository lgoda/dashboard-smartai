'use client'

import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from './lib/supabaseClient'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        router.push('/dashboard')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mx-auto mb-6">
            <img
              src="/logo-smartservice.png"
              alt="SmartService"
              className="h-20 w-auto"
            />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Dashboard SmartService</h1>
          <p className="text-slate-300">Accedi per gestire i tuoi servizi AI e visualizzare le statistiche</p>
        </div>

        {/* Auth Form */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
          <Auth
            supabaseClient={supabase}
            appearance={{ 
              theme: ThemeSupa,
              style: {
                button: {
                  background: 'linear-gradient(135deg, #EC4899 0%, #F97316 100%)',
                  color: 'white',
                  borderRadius: '0.5rem',
                  border: 'none',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  transition: 'all 0.2s ease',
                },
                input: {
                  borderRadius: '0.5rem',
                  border: '1px solid #d1d5db',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                  transition: 'all 0.2s ease',
                },
                label: {
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '0.5rem',
                },
                message: {
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  fontSize: '0.875rem',
                  marginTop: '0.5rem',
                }
              },
              variables: {
                default: {
                  colors: {
                    brand: '#EC4899',
                    brandAccent: '#F97316',
                    inputBackground: 'white',
                    inputBorder: '#d1d5db',
                    inputBorderHover: '#9ca3af',
                    inputBorderFocus: '#EC4899',
                  },
                  borderWidths: {
                    buttonBorderWidth: '0px',
                    inputBorderWidth: '1px',
                  },
                  radii: {
                    borderRadiusButton: '0.5rem',
                    buttonBorderRadius: '0.5rem',
                    inputBorderRadius: '0.5rem',
                  },
                }
              }
            }}
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
                  confirmation_text: 'Controlla la tua email per il link di conferma'
                },
                sign_up: {
                  email_label: 'Email',
                  password_label: 'Password',
                  button_label: 'Registrati',
                  loading_button_label: 'Registrazione in corso...',
                  social_provider_text: 'Registrati con {{provider}}',
                  link_text: 'Non hai un account? Registrati',
                  confirmation_text: 'Controlla la tua email per il link di conferma'
                },
                forgotten_password: {
                  email_label: 'Email',
                  button_label: 'Invia istruzioni per il reset',
                  loading_button_label: 'Invio in corso...',
                  link_text: 'Password dimenticata?',
                  confirmation_text: 'Controlla la tua email per il link di reset'
                },
                update_password: {
                  password_label: 'Nuova password',
                  password_confirmation_label: 'Conferma nuova password',
                  button_label: 'Aggiorna password',
                  loading_button_label: 'Aggiornamento in corso...'
                },
                verify_otp: {
                  email_input_label: 'Email',
                  phone_input_label: 'Numero di telefono',
                  token_input_label: 'Token',
                  button_label: 'Verifica token',
                  loading_button_label: 'Verifica in corso...'
                }
              }
            }}
          />
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-slate-400">
          <p>Gestisci i tuoi servizi AI in modo semplice e professionale</p>
        </div>
      </div>
    </div>
  )
}