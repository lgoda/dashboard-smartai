'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export const dynamic = 'force-dynamic'

type ServiceConfig = {
  has_chatbot: boolean
  has_ai_calls: boolean
}

type TokenData = {
  api_token: string
  is_active: boolean
  last_verified_at: string | null
  updated_at: string
}

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [services, setServices] = useState<ServiceConfig | null>(null)
  const [tokenData, setTokenData] = useState<TokenData | null>(null)
  const [apiToken, setApiToken] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showToken, setShowToken] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData?.user) return router.push('/')
        setUser(userData.user)

        const [servicesRes, tokenRes] = await Promise.all([
          supabase
            .from('user_services')
            .select('has_chatbot, has_ai_calls')
            .eq('user_id', userData.user.id)
            .maybeSingle(),
          supabase
            .from('elevenlabs_tokens')
            .select('api_token, is_active, last_verified_at, updated_at')
            .eq('user_id', userData.user.id)
            .maybeSingle()
        ])

        if (servicesRes.data) {
          setServices(servicesRes.data)
        } else {
          await supabase.from('user_services').insert({
            user_id: userData.user.id,
            has_chatbot: true,
            has_ai_calls: false
          })
          setServices({ has_chatbot: true, has_ai_calls: false })
        }

        if (tokenRes.data) {
          setTokenData(tokenRes.data)
          setApiToken(tokenRes.data.api_token)
        }
      } catch (error) {
        console.error('Error loading settings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [router])

  const verifyToken = async (token: string) => {
    try {
      setIsVerifying(true)
      const response = await fetch('https://api.elevenlabs.io/v1/convai/conversations?page_size=1', {
        method: 'GET',
        headers: {
          'xi-api-key': token,
        },
      })

      return response.ok
    } catch (error) {
      return false
    } finally {
      setIsVerifying(false)
    }
  }

  const handleSaveToken = async () => {
    if (!user || !apiToken.trim()) {
      setMessage({ type: 'error', text: 'Inserisci un token valido' })
      return
    }

    setIsSaving(true)
    setMessage(null)

    try {
      const isValid = await verifyToken(apiToken)

      if (!isValid) {
        setMessage({ type: 'error', text: 'Token non valido. Verifica che il token sia corretto.' })
        setIsSaving(false)
        return
      }

      const tokenPayload = {
        user_id: user.id,
        api_token: apiToken,
        is_active: true,
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('elevenlabs_tokens')
        .upsert(tokenPayload, { onConflict: 'user_id' })

      if (error) throw error

      const { data: updatedToken } = await supabase
        .from('elevenlabs_tokens')
        .select('api_token, is_active, last_verified_at, updated_at')
        .eq('user_id', user.id)
        .single()

      setTokenData(updatedToken)

      await supabase
        .from('user_services')
        .upsert(
          { user_id: user.id, has_ai_calls: true },
          { onConflict: 'user_id' }
        )

      const { data: updatedServices } = await supabase
        .from('user_services')
        .select('has_chatbot, has_ai_calls')
        .eq('user_id', user.id)
        .single()

      setServices(updatedServices)

      setMessage({ type: 'success', text: 'Token salvato e verificato con successo!' })
    } catch (error) {
      console.error('Error saving token:', error)
      setMessage({ type: 'error', text: 'Errore nel salvataggio del token' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteToken = async () => {
    if (!user) return

    if (!confirm('Sei sicuro di voler eliminare il token ElevenLabs? Questo disabiliterà il servizio di chiamate IA.')) {
      return
    }

    try {
      const { error } = await supabase
        .from('elevenlabs_tokens')
        .delete()
        .eq('user_id', user.id)

      if (error) throw error

      setTokenData(null)
      setApiToken('')

      await supabase
        .from('user_services')
        .update({ has_ai_calls: false })
        .eq('user_id', user.id)

      const { data: updatedServices } = await supabase
        .from('user_services')
        .select('has_chatbot, has_ai_calls')
        .eq('user_id', user.id)
        .single()

      setServices(updatedServices)

      setMessage({ type: 'success', text: 'Token eliminato con successo' })
    } catch (error) {
      console.error('Error deleting token:', error)
      setMessage({ type: 'error', text: 'Errore nell\'eliminazione del token' })
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-slate-200 rounded-lg loading"></div>
          <div className="h-8 bg-slate-200 rounded w-48 loading"></div>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-100 rounded loading"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-gradient-to-br from-slate-500 to-slate-600 rounded-xl flex items-center justify-center">
          <span className="text-white text-lg">⚙️</span>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Impostazioni</h1>
          <p className="text-slate-600 mt-1">Gestisci i tuoi servizi e configurazioni</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Servizi Attivi</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600">💬</span>
              </div>
              <div>
                <p className="font-medium text-slate-900">Chatbot</p>
                <p className="text-sm text-slate-600">Lead e conversazioni</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              services?.has_chatbot
                ? 'bg-green-100 text-green-800'
                : 'bg-slate-100 text-slate-600'
            }`}>
              {services?.has_chatbot ? 'Attivo' : 'Disabilitato'}
            </span>
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-green-600">📞</span>
              </div>
              <div>
                <p className="font-medium text-slate-900">Chiamate IA</p>
                <p className="text-sm text-slate-600">ElevenLabs integration</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              services?.has_ai_calls
                ? 'bg-green-100 text-green-800'
                : 'bg-slate-100 text-slate-600'
            }`}>
              {services?.has_ai_calls ? 'Attivo' : 'Disabilitato'}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Configurazione ElevenLabs</h2>

        {tokenData && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 mb-2">Token attivo</p>
                <p className="text-xs text-blue-700">
                  Ultima verifica: {tokenData.last_verified_at ? formatDate(tokenData.last_verified_at) : 'Mai'}
                </p>
                <p className="text-xs text-blue-700">
                  Ultimo aggiornamento: {formatDate(tokenData.updated_at)}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Verificato
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="apiToken" className="block text-sm font-medium text-slate-700 mb-2">
              API Token (xi-api-key)
            </label>
            <div className="relative">
              <input
                id="apiToken"
                type={showToken ? 'text' : 'password'}
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Inserisci il tuo token ElevenLabs"
                className="w-full px-4 py-2 pr-24 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-2 px-3 py-1 text-xs text-slate-600 hover:text-slate-900"
              >
                {showToken ? 'Nascondi' : 'Mostra'}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Puoi trovare il tuo API token nella sezione{' '}
              <a
                href="https://elevenlabs.io/app/settings/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Developers di ElevenLabs
              </a>
            </p>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleSaveToken}
              disabled={isSaving || isVerifying || !apiToken.trim()}
              className="flex-1 btn-primary text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-shadow"
            >
              {isSaving ? 'Salvataggio...' : isVerifying ? 'Verifica...' : tokenData ? 'Aggiorna Token' : 'Salva Token'}
            </button>

            {tokenData && (
              <button
                onClick={handleDeleteToken}
                className="px-6 py-3 rounded-lg font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors"
              >
                Elimina
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900 mb-3">Come configurare ElevenLabs</h3>
        <ol className="space-y-2 text-sm text-slate-700">
          <li className="flex items-start">
            <span className="font-medium mr-2">1.</span>
            <span>Accedi al tuo account ElevenLabs</span>
          </li>
          <li className="flex items-start">
            <span className="font-medium mr-2">2.</span>
            <span>Vai nelle Impostazioni e seleziona la sezione API Keys</span>
          </li>
          <li className="flex items-start">
            <span className="font-medium mr-2">3.</span>
            <span>Copia il tuo API token (xi-api-key)</span>
          </li>
          <li className="flex items-start">
            <span className="font-medium mr-2">4.</span>
            <span>Incolla il token nel campo sopra e clicca su Salva</span>
          </li>
          <li className="flex items-start">
            <span className="font-medium mr-2">5.</span>
            <span>Il sistema verificherà automaticamente la validità del token</span>
          </li>
        </ol>
      </div>
    </div>
  )
}
