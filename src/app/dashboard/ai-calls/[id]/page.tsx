'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

type ConversationMessage = {
  role: string
  message: string
  time_in_call_secs: number
}

type ConversationDetail = {
  conversation_id: string
  agent_id: string
  status: string
  call_successful: string
  transcript: ConversationMessage[]
  metadata?: {
    start_time_unix_secs?: number
    end_time_unix_secs?: number
    call_duration_secs?: number
  }
}

export default function AICallDetailPage() {
  const params = useParams()
  const id = params?.id as string
  const [user, setUser] = useState<any>(null)
  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const fetchConversation = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData?.user) return router.push('/')
        setUser(userData.user)

        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token

        if (!token) {
          console.error('No access token available')
          return
        }

        const response = await fetch(`/api/elevenlabs/conversation/${id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          throw new Error('Failed to fetch conversation')
        }

        const data = await response.json()
        setConversation(data)
      } catch (error) {
        console.error('Error fetching conversation:', error)
      } finally {
        setIsLoading(false)
      }
    }

    if (id) {
      fetchConversation()
    }
  }, [id, router])

  const loadAudio = async () => {
    if (audioUrl || isLoadingAudio) return

    setIsLoadingAudio(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      if (!token) {
        console.error('No access token available')
        return
      }

      const response = await fetch(`/api/elevenlabs/audio/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch audio')
      }

      const audioBlob = await response.blob()
      const url = URL.createObjectURL(audioBlob)
      setAudioUrl(url)
    } catch (error) {
      console.error('Error loading audio:', error)
    } finally {
      setIsLoadingAudio(false)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDateTime = (unixTimestamp: number) => {
    return new Date(unixTimestamp * 1000).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const getOutcomeBadgeColor = (outcome: string) => {
    switch (outcome) {
      case 'successful':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200'
    }
  }

  const getOutcomeLabel = (outcome: string) => {
    switch (outcome) {
      case 'successful':
        return 'Successo'
      case 'failed':
        return 'Fallito'
      case 'unknown':
        return 'Sconosciuto'
      default:
        return outcome
    }
  }

  const exportTranscript = () => {
    if (!conversation) return

    const transcript = conversation.transcript
      .map(msg => `[${formatDuration(msg.time_in_call_secs)}] ${msg.role === 'user' ? 'Utente' : 'Agente'}: ${msg.message}`)
      .join('\n\n')

    const fullText = `Trascrizione Chiamata IA\n` +
      `ID: ${conversation.conversation_id}\n` +
      `Agent: ${conversation.agent_id}\n` +
      `Outcome: ${getOutcomeLabel(conversation.call_successful)}\n` +
      `Data: ${conversation.metadata?.start_time_unix_secs ? formatDateTime(conversation.metadata.start_time_unix_secs) : 'N/A'}\n\n` +
      `${'-'.repeat(80)}\n\n` +
      transcript

    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `transcript_${conversation.conversation_id}.txt`
    link.click()
    URL.revokeObjectURL(url)
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
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-100 rounded loading"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <Link
            href="/dashboard/ai-calls"
            className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center transition-colors"
          >
            <span className="text-slate-700">←</span>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Chiamata non trovata</h1>
          </div>
        </div>
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-slate-200">
          <p className="text-slate-600">La chiamata richiesta non è stata trovata.</p>
          <Link
            href="/dashboard/ai-calls"
            className="inline-block mt-4 text-blue-600 hover:text-blue-800 font-medium"
          >
            Torna alla lista delle chiamate
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link
            href="/dashboard/ai-calls"
            className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center transition-colors"
          >
            <span className="text-slate-700">←</span>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Dettagli Chiamata</h1>
            <p className="text-slate-600 mt-1 font-mono text-sm">ID: {conversation.conversation_id}</p>
          </div>
        </div>

        <button
          onClick={exportTranscript}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl"
        >
          📥 Esporta Trascrizione
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <p className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-2">Outcome</p>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getOutcomeBadgeColor(conversation.call_successful)}`}>
            {getOutcomeLabel(conversation.call_successful)}
          </span>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <p className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-2">Durata</p>
          <p className="text-2xl font-bold text-slate-900">
            {conversation.metadata?.call_duration_secs
              ? formatDuration(conversation.metadata.call_duration_secs)
              : 'N/A'
            }
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <p className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-2">Messaggi</p>
          <p className="text-2xl font-bold text-slate-900">{conversation.transcript?.length || 0}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Informazioni Chiamata</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-slate-600 mb-1">ID Conversazione</p>
            <p className="text-sm text-slate-900 font-mono bg-slate-50 p-2 rounded">{conversation.conversation_id}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600 mb-1">Agent ID</p>
            <p className="text-sm text-slate-900 font-mono bg-slate-50 p-2 rounded">{conversation.agent_id}</p>
          </div>
          {conversation.metadata?.start_time_unix_secs && (
            <div>
              <p className="text-sm font-medium text-slate-600 mb-1">Data e Ora Inizio</p>
              <p className="text-sm text-slate-900">{formatDateTime(conversation.metadata.start_time_unix_secs)}</p>
            </div>
          )}
          {conversation.metadata?.end_time_unix_secs && (
            <div>
              <p className="text-sm font-medium text-slate-600 mb-1">Data e Ora Fine</p>
              <p className="text-sm text-slate-900">{formatDateTime(conversation.metadata.end_time_unix_secs)}</p>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-slate-600 mb-1">Status</p>
            <p className="text-sm text-slate-900">{conversation.status}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Audio Registrazione</h2>
        {!audioUrl ? (
          <button
            onClick={loadAudio}
            disabled={isLoadingAudio}
            className="w-full py-4 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50 border border-blue-200"
          >
            {isLoadingAudio ? 'Caricamento audio...' : '🔊 Carica e riproduci audio'}
          </button>
        ) : (
          <div className="space-y-3">
            <audio controls className="w-full" src={audioUrl}>
              Il tuo browser non supporta l&apos;elemento audio.
            </audio>
            <p className="text-xs text-slate-500">Audio caricato. Usa i controlli per ascoltare la registrazione.</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">Trascrizione Completa</h2>
        {conversation.transcript && conversation.transcript.length > 0 ? (
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {conversation.transcript.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-900'
                } rounded-lg p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium opacity-75">
                      {msg.role === 'user' ? 'Utente' : 'Agente IA'}
                    </span>
                    <span className="text-xs opacity-60 ml-3">
                      {formatDuration(msg.time_in_call_secs)}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{msg.message}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            Nessuna trascrizione disponibile per questa chiamata.
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <Link
          href="/dashboard/ai-calls"
          className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
        >
          ← Torna alla lista
        </Link>
      </div>
    </div>
  )
}
