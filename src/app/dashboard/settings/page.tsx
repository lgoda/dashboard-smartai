'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import { useAuth } from '@/app/components/AuthProvider'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

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

type RetellTokenData = {
  api_token: string
  is_active: boolean
  last_verified_at: string | null
  updated_at: string
}

type GHLTokenData = {
  api_token: string
  location_id: string
  is_active: boolean
  last_verified_at: string | null
  updated_at: string
}

type OpenAITokenData = {
  api_token: string
  is_active: boolean
  last_verified_at: string | null
  updated_at: string
}

export default function SettingsPage() {
  const { user } = useAuth()
  const [services, setServices] = useState<ServiceConfig | null>(null)
  const [tokenData, setTokenData] = useState<TokenData | null>(null)
  const [retellTokenData, setRetellTokenData] = useState<RetellTokenData | null>(null)
  const [apiToken, setApiToken] = useState('')
  const [retellApiToken, setRetellApiToken] = useState('')
  const [ghlTokenData, setGhlTokenData] = useState<GHLTokenData | null>(null)
  const [ghlApiToken, setGhlApiToken] = useState('')
  const [ghlLocationId, setGhlLocationId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingRetell, setIsSavingRetell] = useState(false)
  const [isSavingGhl, setIsSavingGhl] = useState(false)
  const [openaiTokenData, setOpenaiTokenData] = useState<OpenAITokenData | null>(null)
  const [openaiApiToken, setOpenaiApiToken] = useState('')
  const [isSavingOpenai, setIsSavingOpenai] = useState(false)
  const [isVerifyingOpenai, setIsVerifyingOpenai] = useState(false)
  const [showOpenaiToken, setShowOpenaiToken] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isVerifyingRetell, setIsVerifyingRetell] = useState(false)
  const [isVerifyingGhl, setIsVerifyingGhl] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [showRetellToken, setShowRetellToken] = useState(false)
  const [showGhlToken, setShowGhlToken] = useState(false)
  useEffect(() => {
    if (!user?.id) return
    const fetchData = async () => {
      try {
        const [servicesRes, tokenRes, retellTokenRes, ghlTokenRes, openaiTokenRes] = await Promise.all([
          supabase.from('user_services').select('has_chatbot, has_ai_calls').eq('user_id', user.id).maybeSingle(),
          supabase.from('elevenlabs_tokens').select('api_token, is_active, last_verified_at, updated_at').eq('user_id', user.id).maybeSingle(),
          supabase.from('retell_tokens').select('api_token, is_active, last_verified_at, updated_at').eq('user_id', user.id).maybeSingle(),
          supabase.from('ghl_tokens').select('api_token, location_id, is_active, last_verified_at, updated_at').eq('user_id', user.id).maybeSingle(),
          supabase.from('openai_tokens').select('api_token, is_active, last_verified_at, updated_at').eq('user_id', user.id).maybeSingle()
        ])

        if (servicesRes.data) {
          setServices(servicesRes.data)
        } else {
          await supabase.from('user_services').insert({ user_id: user.id, has_chatbot: true, has_ai_calls: false })
          setServices({ has_chatbot: true, has_ai_calls: false })
        }

        if (tokenRes.data) { setTokenData(tokenRes.data); setApiToken(tokenRes.data.api_token) }
        if (retellTokenRes.data) { setRetellTokenData(retellTokenRes.data); setRetellApiToken(retellTokenRes.data.api_token) }
        if (ghlTokenRes.data) { setGhlTokenData(ghlTokenRes.data); setGhlApiToken(ghlTokenRes.data.api_token); setGhlLocationId(ghlTokenRes.data.location_id) }
        if (openaiTokenRes.data) { setOpenaiTokenData(openaiTokenRes.data); setOpenaiApiToken(openaiTokenRes.data.api_token) }
      } catch (error) {
        console.error('Error loading settings:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [user?.id])

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

  const verifyRetellToken = async (token: string) => {
    try {
      setIsVerifyingRetell(true)
      const response = await fetch('https://api.retellai.com/v2/list-calls', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ limit: 1 })
      })

      return response.ok
    } catch (error) {
      return false
    } finally {
      setIsVerifyingRetell(false)
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

  const handleSaveRetellToken = async () => {
    if (!user || !retellApiToken.trim()) {
      setMessage({ type: 'error', text: 'Inserisci un token Retell valido' })
      return
    }

    setIsSavingRetell(true)
    setMessage(null)

    try {
      const isValid = await verifyRetellToken(retellApiToken)

      if (!isValid) {
        setMessage({ type: 'error', text: 'Token Retell non valido. Verifica che il token sia corretto.' })
        setIsSavingRetell(false)
        return
      }

      const tokenPayload = {
        user_id: user.id,
        api_token: retellApiToken,
        is_active: true,
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { error: upsertError } = await supabase
        .from('retell_tokens')
        .upsert(tokenPayload, { onConflict: 'user_id' })

      if (upsertError) {
        console.error('Upsert error:', upsertError)
        throw upsertError
      }

      const { data: updatedToken, error: selectError } = await supabase
        .from('retell_tokens')
        .select('api_token, is_active, last_verified_at, updated_at')
        .eq('user_id', user.id)
        .single()

      if (selectError) {
        console.error('Select error:', selectError)
        throw selectError
      }

      setRetellTokenData(updatedToken)

      setMessage({ type: 'success', text: 'Token Retell salvato e verificato con successo!' })
    } catch (error) {
      console.error('Error saving Retell token:', error)
      setMessage({ type: 'error', text: 'Errore nel salvataggio del token Retell' })
    } finally {
      setIsSavingRetell(false)
    }
  }

  const handleDeleteRetellToken = async () => {
    if (!user) return

    if (!confirm('Sei sicuro di voler eliminare il token Retell AI?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('retell_tokens')
        .delete()
        .eq('user_id', user.id)

      if (error) throw error

      setRetellTokenData(null)
      setRetellApiToken('')

      setMessage({ type: 'success', text: 'Token Retell eliminato con successo' })
    } catch (error) {
      console.error('Error deleting Retell token:', error)
      setMessage({ type: 'error', text: 'Errore nell\'eliminazione del token Retell' })
    }
  }

  const verifyOpenaiToken = async (token: string): Promise<boolean> => {
    try {
      setIsVerifyingOpenai(true)
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.ok
    } catch {
      return false
    } finally {
      setIsVerifyingOpenai(false)
    }
  }

  const handleSaveOpenaiToken = async () => {
    if (!user || !openaiApiToken.trim()) {
      setMessage({ type: 'error', text: 'Inserisci un token OpenAI valido' })
      return
    }
    setIsSavingOpenai(true)
    setMessage(null)
    try {
      const isValid = await verifyOpenaiToken(openaiApiToken)
      if (!isValid) {
        setMessage({ type: 'error', text: 'Token OpenAI non valido. Verifica che la chiave sia corretta.' })
        setIsSavingOpenai(false)
        return
      }
      const { error: upsertError } = await supabase
        .from('openai_tokens')
        .upsert(
          { user_id: user.id, api_token: openaiApiToken, is_active: true, last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
      if (upsertError) throw upsertError

      const { data: updated } = await supabase
        .from('openai_tokens')
        .select('api_token, is_active, last_verified_at, updated_at')
        .eq('user_id', user.id)
        .single()
      setOpenaiTokenData(updated)
      setMessage({ type: 'success', text: 'Token OpenAI salvato e verificato con successo!' })
    } catch (error) {
      console.error('Error saving OpenAI token:', error)
      setMessage({ type: 'error', text: 'Errore nel salvataggio del token OpenAI' })
    } finally {
      setIsSavingOpenai(false)
    }
  }

  const handleDeleteOpenaiToken = async () => {
    if (!user) return
    if (!confirm('Sei sicuro di voler eliminare il token OpenAI? La funzione di analisi opportunità verrà disabilitata.')) return
    try {
      const { error } = await supabase.from('openai_tokens').delete().eq('user_id', user.id)
      if (error) throw error
      setOpenaiTokenData(null)
      setOpenaiApiToken('')
      setMessage({ type: 'success', text: 'Token OpenAI eliminato con successo' })
    } catch (error) {
      console.error('Error deleting OpenAI token:', error)
      setMessage({ type: 'error', text: "Errore nell'eliminazione del token OpenAI" })
    }
  }

  const verifyGhlToken = async (token: string, locationId: string): Promise<boolean> => {
    try {
      setIsVerifyingGhl(true)
      const response = await fetch(
        `https://services.leadconnectorhq.com/locations/${locationId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Version: '2021-04-15',
          },
        }
      )
      return response.ok
    } catch {
      return false
    } finally {
      setIsVerifyingGhl(false)
    }
  }

  const handleSaveGhlToken = async () => {
    if (!user || !ghlApiToken.trim() || !ghlLocationId.trim()) {
      setMessage({ type: 'error', text: 'Inserisci sia il token GHL che il Location ID' })
      return
    }

    setIsSavingGhl(true)
    setMessage(null)

    try {
      const isValid = await verifyGhlToken(ghlApiToken, ghlLocationId)

      if (!isValid) {
        setMessage({ type: 'error', text: 'Token GHL o Location ID non validi. Verifica le credenziali.' })
        setIsSavingGhl(false)
        return
      }

      const { error: upsertError } = await supabase
        .from('ghl_tokens')
        .upsert(
          {
            user_id: user.id,
            api_token: ghlApiToken,
            location_id: ghlLocationId,
            is_active: true,
            last_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )

      if (upsertError) throw upsertError

      const { data: updatedToken } = await supabase
        .from('ghl_tokens')
        .select('api_token, location_id, is_active, last_verified_at, updated_at')
        .eq('user_id', user.id)
        .single()

      setGhlTokenData(updatedToken)
      setMessage({ type: 'success', text: 'Token GoHighLevel salvato e verificato con successo!' })
    } catch (error) {
      console.error('Error saving GHL token:', error)
      setMessage({ type: 'error', text: 'Errore nel salvataggio del token GoHighLevel' })
    } finally {
      setIsSavingGhl(false)
    }
  }

  const handleDeleteGhlToken = async () => {
    if (!user) return

    if (!confirm('Sei sicuro di voler eliminare il token GoHighLevel? Questo disabiliterà le conversazioni CRM.')) {
      return
    }

    try {
      const { error } = await supabase
        .from('ghl_tokens')
        .delete()
        .eq('user_id', user.id)

      if (error) throw error

      setGhlTokenData(null)
      setGhlApiToken('')
      setGhlLocationId('')
      setMessage({ type: 'success', text: 'Token GoHighLevel eliminato con successo' })
    } catch (error) {
      console.error('Error deleting GHL token:', error)
      setMessage({ type: 'error', text: "Errore nell'eliminazione del token GoHighLevel" })
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
          <div className="w-8 h-8 bg-[#3A3D42] rounded-lg loading"></div>
          <div className="h-8 bg-[#3A3D42] rounded w-48 loading"></div>
        </div>
        <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-[#1F2124] rounded loading"></div>
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
        <div className="w-10 h-10 bg-[#F0AD4E] rounded-xl flex items-center justify-center">
          <span className="text-[#1e293b] text-lg">⚙️</span>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white">Impostazioni</h1>
          <p className="text-gray-300 mt-1">Gestisci i tuoi servizi e configurazioni</p>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' 
            ? 'bg-[#5CB85C]/20 text-[#5CB85C] border border-[#5CB85C]/30' 
            : 'bg-red-500/20 text-red-400 border border-red-500/30'
        }`}>
          {message.text}
        </div>
      )}

      <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
        <h2 className="text-xl font-semibold text-white mb-4">Servizi Attivi</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-4 bg-[#1F2124] rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-[#F0AD4E]/20 rounded-lg flex items-center justify-center">
                <span className="text-[#F0AD4E]">💬</span>
              </div>
              <div>
                <p className="font-medium text-white">Chatbot</p>
                <p className="text-sm text-gray-400">Lead e conversazioni</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              services?.has_chatbot
                ? 'bg-[#5CB85C]/20 text-[#5CB85C] border border-[#5CB85C]/30'
                : 'bg-[#1F2124] text-gray-500 border border-[#1F2124]'
            }`}>
              {services?.has_chatbot ? 'Attivo' : 'Disabilitato'}
            </span>
          </div>

          <div className="flex items-center justify-between p-4 bg-[#1F2124] rounded-lg">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-[#F0AD4E]/20 rounded-lg flex items-center justify-center">
                <span className="text-[#F0AD4E]">📞</span>
              </div>
              <div>
                <p className="font-medium text-white">Chiamate IA</p>
                <p className="text-sm text-gray-400">ElevenLabs / Retell</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              services?.has_ai_calls || tokenData || retellTokenData
                ? 'bg-[#5CB85C]/20 text-[#5CB85C] border border-[#5CB85C]/30'
                : 'bg-[#1F2124] text-gray-500 border border-[#1F2124]'
            }`}>
              {services?.has_ai_calls || tokenData || retellTokenData ? 'Attivo' : 'Disabilitato'}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
        <h2 className="text-xl font-semibold text-white mb-4">Configurazione ElevenLabs</h2>

        {tokenData && (
          <div className="mb-6 p-4 bg-[#F0AD4E]/20 border border-[#F0AD4E]/30 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-[#F0AD4E] mb-2">Token attivo</p>
                <p className="text-xs text-gray-400">
                  Ultima verifica: {tokenData.last_verified_at ? formatDate(tokenData.last_verified_at) : 'Mai'}
                </p>
                <p className="text-xs text-gray-400">
                  Ultimo aggiornamento: {formatDate(tokenData.updated_at)}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#5CB85C]/20 text-[#5CB85C] border border-[#5CB85C]/30">
                  Verificato
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="apiToken" className="block text-sm font-medium text-gray-300 mb-2">
              API Token (xi-api-key)
            </label>
            <div className="relative">
              <input
                id="apiToken"
                type={showToken ? 'text' : 'password'}
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Inserisci il tuo token ElevenLabs"
                className="w-full px-4 py-2 pr-24 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E] focus:border-[#F0AD4E] transition-colors text-white placeholder-gray-500"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-2 px-3 py-1 text-xs text-gray-400 hover:text-[#F0AD4E]"
              >
                {showToken ? 'Nascondi' : 'Mostra'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Puoi trovare il tuo API token nella sezione{' '}
              <a
                href="https://elevenlabs.io/app/settings/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#F0AD4E] hover:underline"
              >
                Developers di ElevenLabs
              </a>
            </p>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleSaveToken}
              disabled={isSaving || isVerifying || !apiToken.trim()}
              className="flex-1 bg-[#F0AD4E] text-[#1e293b] px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-shadow hover:bg-[#E09A3D]"
            >
              {isSaving ? 'Salvataggio...' : isVerifying ? 'Verifica...' : tokenData ? 'Aggiorna Token' : 'Salva Token'}
            </button>

            {tokenData && (
              <button
                onClick={handleDeleteToken}
                className="px-6 py-3 rounded-lg font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-colors"
              >
                Elimina
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
        <h2 className="text-xl font-semibold text-white mb-4">Configurazione Retell AI</h2>

        {retellTokenData && (
          <div className="mb-6 p-4 bg-[#F0AD4E]/20 border border-[#F0AD4E]/30 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-[#F0AD4E] mb-2">Token attivo</p>
                <p className="text-xs text-gray-400">
                  Ultima verifica: {retellTokenData.last_verified_at ? formatDate(retellTokenData.last_verified_at) : 'Mai'}
                </p>
                <p className="text-xs text-gray-400">
                  Ultimo aggiornamento: {formatDate(retellTokenData.updated_at)}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#5CB85C]/20 text-[#5CB85C] border border-[#5CB85C]/30">
                  Verificato
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="retellApiToken" className="block text-sm font-medium text-gray-300 mb-2">
              API Token Retell AI
            </label>
            <div className="relative">
              <input
                id="retellApiToken"
                type={showRetellToken ? 'text' : 'password'}
                value={retellApiToken}
                onChange={(e) => setRetellApiToken(e.target.value)}
                placeholder="Inserisci il tuo token Retell AI"
                className="w-full px-4 py-2 pr-24 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E] focus:border-[#F0AD4E] transition-colors text-white placeholder-gray-500"
              />
              <button
                type="button"
                onClick={() => setShowRetellToken(!showRetellToken)}
                className="absolute right-2 top-2 px-3 py-1 text-xs text-gray-400 hover:text-[#F0AD4E]"
              >
                {showRetellToken ? 'Nascondi' : 'Mostra'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Puoi trovare il tuo API token nel{' '}
              <a
                href="https://retellai.com/settings/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#F0AD4E] hover:underline"
              >
                dashboard Retell AI
              </a>
            </p>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleSaveRetellToken}
              disabled={isSavingRetell || isVerifyingRetell || !retellApiToken.trim()}
              className="flex-1 bg-[#F0AD4E] text-[#1e293b] px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-shadow hover:bg-[#E09A3D]"
            >
              {isSavingRetell ? 'Salvataggio...' : isVerifyingRetell ? 'Verifica...' : retellTokenData ? 'Aggiorna Token' : 'Salva Token'}
            </button>

            {retellTokenData && (
              <button
                onClick={handleDeleteRetellToken}
                className="px-6 py-3 rounded-lg font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-colors"
              >
                Elimina
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
        <h2 className="text-xl font-semibold text-white mb-4">Configurazione GoHighLevel (CRM)</h2>

        {ghlTokenData && (
          <div className="mb-6 p-4 bg-[#F0AD4E]/20 border border-[#F0AD4E]/30 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-[#F0AD4E] mb-1">Connessione attiva</p>
                <p className="text-xs text-gray-400">Location ID: {ghlTokenData.location_id}</p>
                <p className="text-xs text-gray-400">
                  Ultima verifica: {ghlTokenData.last_verified_at ? formatDate(ghlTokenData.last_verified_at) : 'Mai'}
                </p>
                <p className="text-xs text-gray-400">
                  Ultimo aggiornamento: {formatDate(ghlTokenData.updated_at)}
                </p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#5CB85C]/20 text-[#5CB85C] border border-[#5CB85C]/30">
                Connesso
              </span>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="ghlApiToken" className="block text-sm font-medium text-gray-300 mb-2">
              Private Integration Token
            </label>
            <div className="relative">
              <input
                id="ghlApiToken"
                type={showGhlToken ? 'text' : 'password'}
                value={ghlApiToken}
                onChange={(e) => setGhlApiToken(e.target.value)}
                placeholder="Inserisci il tuo token GHL"
                className="w-full px-4 py-2 pr-24 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E] focus:border-[#F0AD4E] transition-colors text-white placeholder-gray-500"
              />
              <button
                type="button"
                onClick={() => setShowGhlToken(!showGhlToken)}
                className="absolute right-2 top-2 px-3 py-1 text-xs text-gray-400 hover:text-[#F0AD4E]"
              >
                {showGhlToken ? 'Nascondi' : 'Mostra'}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="ghlLocationId" className="block text-sm font-medium text-gray-300 mb-2">
              Location ID
            </label>
            <input
              id="ghlLocationId"
              type="text"
              value={ghlLocationId}
              onChange={(e) => setGhlLocationId(e.target.value)}
              placeholder="Es. abc123xyz"
              className="w-full px-4 py-2 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E] focus:border-[#F0AD4E] transition-colors text-white placeholder-gray-500"
            />
            <p className="text-xs text-gray-400 mt-2">
              Trovi il Location ID in GoHighLevel → Impostazioni → Business Info
            </p>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleSaveGhlToken}
              disabled={isSavingGhl || isVerifyingGhl || !ghlApiToken.trim() || !ghlLocationId.trim()}
              className="flex-1 bg-[#F0AD4E] text-[#1e293b] px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-shadow hover:bg-[#E09A3D]"
            >
              {isSavingGhl ? 'Salvataggio...' : isVerifyingGhl ? 'Verifica...' : ghlTokenData ? 'Aggiorna Configurazione' : 'Salva e Connetti'}
            </button>

            {ghlTokenData && (
              <button
                onClick={handleDeleteGhlToken}
                className="px-6 py-3 rounded-lg font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-colors"
              >
                Elimina
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#3A3D42] rounded-xl p-6 shadow-sm border border-[#1F2124]">
        <h2 className="text-xl font-semibold text-white mb-1">Configurazione OpenAI</h2>
        <p className="text-sm text-gray-400 mb-4">Necessario per l&apos;analisi automatica delle opportunità CRM</p>

        {openaiTokenData && (
          <div className="mb-6 p-4 bg-[#F0AD4E]/20 border border-[#F0AD4E]/30 rounded-lg">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-[#F0AD4E] mb-1">Token attivo</p>
                <p className="text-xs text-gray-400">
                  Ultima verifica: {openaiTokenData.last_verified_at ? formatDate(openaiTokenData.last_verified_at) : 'Mai'}
                </p>
                <p className="text-xs text-gray-400">
                  Ultimo aggiornamento: {formatDate(openaiTokenData.updated_at)}
                </p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#5CB85C]/20 text-[#5CB85C] border border-[#5CB85C]/30">
                Verificato
              </span>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="openaiApiToken" className="block text-sm font-medium text-gray-300 mb-2">
              OpenAI API Key
            </label>
            <div className="relative">
              <input
                id="openaiApiToken"
                type={showOpenaiToken ? 'text' : 'password'}
                value={openaiApiToken}
                onChange={(e) => setOpenaiApiToken(e.target.value)}
                placeholder="sk-..."
                className="w-full px-4 py-2 pr-24 border border-[#1F2124] bg-[#1F2124] rounded-lg focus:ring-2 focus:ring-[#F0AD4E] focus:border-[#F0AD4E] transition-colors text-white placeholder-gray-500"
              />
              <button
                type="button"
                onClick={() => setShowOpenaiToken(!showOpenaiToken)}
                className="absolute right-2 top-2 px-3 py-1 text-xs text-gray-400 hover:text-[#F0AD4E]"
              >
                {showOpenaiToken ? 'Nascondi' : 'Mostra'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Trovi la tua API key su{' '}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#F0AD4E] hover:underline"
              >
                platform.openai.com/api-keys
              </a>
            </p>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleSaveOpenaiToken}
              disabled={isSavingOpenai || isVerifyingOpenai || !openaiApiToken.trim()}
              className="flex-1 bg-[#F0AD4E] text-[#1e293b] px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-shadow hover:bg-[#E09A3D]"
            >
              {isSavingOpenai ? 'Salvataggio...' : isVerifyingOpenai ? 'Verifica...' : openaiTokenData ? 'Aggiorna Token' : 'Salva Token'}
            </button>

            {openaiTokenData && (
              <button
                onClick={handleDeleteOpenaiToken}
                className="px-6 py-3 rounded-lg font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 transition-colors"
              >
                Elimina
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#3A3D42] rounded-xl p-6 border border-[#1F2124]">
        <h3 className="text-lg font-semibold text-white mb-3">Come configurare ElevenLabs</h3>
        <ol className="space-y-2 text-sm text-gray-300">
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
