'use client'

import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from './lib/supabaseClient'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [authView, setAuthView] = useState<'sign_in' | 'update_password'>('sign_in')

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Supabase ha elaborato il token e la sessione è pronta — ora il form può funzionare
        setAuthView('update_password')
      } else if (event === 'SIGNED_IN' && session) {
        router.push('/dashboard')
      } else if (event === 'USER_UPDATED') {
        // Password aggiornata con successo
        router.push('/dashboard')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  return (
    <div className="min-h-screen bg-[#2C2E31] flex items-center justify-center p-4">
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
          <p className="text-gray-300">Accedi per gestire i tuoi servizi AI e visualizzare le statistiche</p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-[#F0AD4E]/10 border border-[#F0AD4E]/30 rounded-full text-xs text-[#F0AD4E]">
            🔒 Accesso su invito
          </div>
        </div>

        {/* Auth Form */}
        <div className="bg-[#3A3D42] rounded-2xl shadow-xl border border-[#1F2124] p-8">
          <Auth
            supabaseClient={supabase}
            view={authView}
            showLinks={false}
            appearance={{
              theme: ThemeSupa,
              style: {
                button: {
                  background: '#F0AD4E',
                  color: '#1e293b',
                  borderRadius: '0.5rem',
                  border: 'none',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                },
                input: {
                  borderRadius: '0.5rem',
                  border: '1px solid #1F2124',
                  background: '#1F2124',
                  color: 'white',
                  padding: '0.75rem 1rem',
                  fontSize: '0.875rem',
                  transition: 'all 0.2s ease',
                },
                label: {
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#d1d5db',
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
                    brand: '#F0AD4E',
                    brandAccent: '#E09A3D',
                    inputBackground: '#1F2124',
                    inputBorder: '#1F2124',
                    inputBorderHover: '#3A3D42',
                    inputBorderFocus: '#F0AD4E',
                    inputText: 'white',
                    anchorTextColor: '#F0AD4E',
                    anchorTextHoverColor: '#E09A3D',
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
                },
                sign_up: {
                  email_label: 'Email',
                  password_label: 'Password',
                  button_label: 'Registrati',
                  loading_button_label: 'Registrazione in corso...',
                  social_provider_text: 'Registrati con {{provider}}',
                  link_text: 'Non hai un account? Registrati',
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
        <div className="text-center mt-8 text-sm text-gray-400">
          <p>Gestisci i tuoi servizi AI in modo semplice e professionale</p>
        </div>
      </div>
    </div>
  )
}