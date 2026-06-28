'use client'

import { useEffect, useState, useTransition } from 'react'
import { supabase, getValidSession } from '@/app/lib/supabaseClient'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Download, Volume2, RefreshCw } from '@/app/components/icons'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

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
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    const fetchConversation = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData?.user) {
          router.push('/')
          return
        }
        setUser(userData.user)

        const session = await getValidSession()
        const token = session.access_token

        if (!token) {
          console.error('No access token available')
          setIsLoading(false)
          return
        }

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

        try {
          const response = await fetch(`/api/elevenlabs/conversation/${id}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
            signal: controller.signal,
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            throw new Error('Failed to fetch conversation')
          }

          const data = await response.json()

          startTransition(() => {
            setConversation(data)
          })
        } catch (fetchError) {
          clearTimeout(timeoutId)
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            console.error('Request timeout')
          }
          throw fetchError
        }
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
      const session = await getValidSession()
      const token = session.access_token

      if (!token) {
        console.error('No access token available')
        return
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      try {
        const response = await fetch(`/api/elevenlabs/audio/${id}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error('Failed to fetch audio')
        }

        const audioBlob = await response.blob()
        const url = URL.createObjectURL(audioBlob)
        setAudioUrl(url)
      } catch (fetchError) {
        clearTimeout(timeoutId)
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error('Audio request timeout')
        }
        throw fetchError
      }
    } catch (error) {
      console.error('Error loading audio:', error)
      alert('Errore nel caricamento dell\'audio. Riprova.')
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
        return 'bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30'
      case 'failed':
        return 'bg-red-500/15 text-red-400 border-red-500/30'
      default:
        return 'bg-[var(--surface-2)] text-[var(--mute)] border-[var(--line)]'
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
          <div className="w-8 h-8 bg-[var(--surface-2)] rounded-lg loading"></div>
          <div className="h-8 bg-[var(--surface-2)] rounded w-48 loading"></div>
        </div>
        <div className="bg-[var(--surface)] rounded-xl p-6 shadow-sm border border-[var(--line)]">
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-[var(--surface-2)] rounded loading"></div>
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
            className="w-10 h-10 bg-[var(--surface-2)] hover:bg-[var(--surface-2)] rounded-xl flex items-center justify-center transition-colors"
          >
            <span className="text-[var(--mute)]">←</span>
          </Link>
          <div>
            <h1 className="font-display text-3xl font-bold text-white">Chiamata non trovata</h1>
          </div>
        </div>
        <div className="bg-[var(--surface)] rounded-xl p-12 text-center shadow-sm border border-[var(--line)]">
          <p className="text-[var(--mute)]">La chiamata richiesta non è stata trovata o si è verificato un timeout.</p>
          <Link
            href="/dashboard/ai-calls"
            className="inline-block mt-4 text-[var(--amber)] hover:text-[var(--amber-deep)] font-medium"
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
            prefetch={false}
            className="w-10 h-10 bg-[var(--surface-2)] hover:bg-[var(--surface-2)] rounded-xl flex items-center justify-center transition-colors"
          >
            <span className="text-[var(--mute)]">←</span>
          </Link>
          <div>
            <h1 className="font-display text-3xl font-bold text-white">Dettagli Chiamata</h1>
            <p className="text-[var(--mute)] mt-1 font-mono text-sm">ID: {conversation.conversation_id}</p>
          </div>
        </div>

        <button
          onClick={exportTranscript}
          className="flex items-center gap-2 px-5 py-3 bg-[var(--amber)] text-[#1b1d20] rounded-lg font-medium hover:bg-[var(--amber-deep)] transition-colors"
        >
          <Download className="w-4 h-4" /> Esporta trascrizione
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[var(--surface)] rounded-xl p-6 shadow-sm border border-[var(--line)]">
          <p className="text-sm font-medium text-[var(--mute)] uppercase tracking-wide mb-2">Outcome</p>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getOutcomeBadgeColor(conversation.call_successful)}`}>
            {getOutcomeLabel(conversation.call_successful)}
          </span>
        </div>

        <div className="bg-[var(--surface)] rounded-xl p-6 shadow-sm border border-[var(--line)]">
          <p className="font-mono text-[10.5px] font-medium text-[var(--mute)] uppercase tracking-[.12em] mb-2">Durata</p>
          <p className="font-mono text-2xl font-semibold tabular-nums text-white">
            {conversation.metadata?.call_duration_secs
              ? formatDuration(conversation.metadata.call_duration_secs)
              : 'N/A'
            }
          </p>
        </div>

        <div className="bg-[var(--surface)] rounded-xl p-6 shadow-sm border border-[var(--line)]">
          <p className="font-mono text-[10.5px] font-medium text-[var(--mute)] uppercase tracking-[.12em] mb-2">Messaggi</p>
          <p className="font-mono text-2xl font-semibold tabular-nums text-white">{conversation.transcript?.length || 0}</p>
        </div>
      </div>

      <div className="bg-[var(--surface)] rounded-xl p-6 shadow-sm border border-[var(--line)]">
        <h2 className="font-display text-xl font-semibold text-white mb-4">Informazioni Chiamata</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-[var(--mute)] mb-1">ID Conversazione</p>
            <p className="text-sm text-white font-mono bg-[var(--ink)] p-2 rounded break-all">{conversation.conversation_id}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--mute)] mb-1">Agent ID</p>
            <p className="text-sm text-white font-mono bg-[var(--ink)] p-2 rounded break-all">{conversation.agent_id}</p>
          </div>
          {conversation.metadata?.start_time_unix_secs && (
            <div>
              <p className="text-sm font-medium text-[var(--mute)] mb-1">Data e Ora Inizio</p>
              <p className="text-sm text-white">{formatDateTime(conversation.metadata.start_time_unix_secs)}</p>
            </div>
          )}
          {conversation.metadata?.end_time_unix_secs && (
            <div>
              <p className="text-sm font-medium text-[var(--mute)] mb-1">Data e Ora Fine</p>
              <p className="text-sm text-white">{formatDateTime(conversation.metadata.end_time_unix_secs)}</p>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-[var(--mute)] mb-1">Status</p>
            <p className="text-sm text-white">{conversation.status}</p>
          </div>
        </div>
      </div>

      <div className="bg-[var(--surface)] rounded-xl p-6 shadow-sm border border-[var(--line)]">
        <h2 className="font-display text-xl font-semibold text-white mb-4">Audio Registrazione</h2>
        {!audioUrl ? (
          <button
            onClick={loadAudio}
            disabled={isLoadingAudio}
            className="w-full py-4 flex items-center justify-center gap-2 bg-[rgba(245,158,11,0.1)] hover:bg-[rgba(245,158,11,0.16)] text-[var(--amber)] rounded-lg font-medium transition-colors disabled:opacity-50 border border-[rgba(245,158,11,0.25)]"
          >
            {isLoadingAudio ? <><RefreshCw className="w-4 h-4 animate-spin" /> Caricamento audio...</> : <><Volume2 className="w-4 h-4" /> Carica e riproduci audio</>}
          </button>
        ) : (
          <div className="space-y-3">
            <audio controls className="w-full" src={audioUrl}>
              Il tuo browser non supporta l&apos;elemento audio.
            </audio>
            <p className="text-xs text-[var(--mute-2)]">Audio caricato. Usa i controlli per ascoltare la registrazione.</p>
          </div>
        )}
      </div>

      <div className="bg-[var(--surface)] rounded-xl p-6 shadow-sm border border-[var(--line)]">
        <h2 className="font-display text-xl font-semibold text-white mb-4">Trascrizione Completa</h2>
        {isPending ? (
          <div className="text-center py-8">
            <div className="inline-block w-8 h-8 border-4 border-[var(--amber)] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-[var(--mute)] mt-2">Caricamento trascrizione...</p>
          </div>
        ) : conversation.transcript && conversation.transcript.length > 0 ? (
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {conversation.transcript.map((msg, index) => (
              <div
                key={index}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] rounded-lg p-4 border ${
                  msg.role === 'user'
                    ? 'bg-[rgba(245,158,11,0.14)] text-[var(--text)] border-[rgba(245,158,11,0.25)]'
                    : 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--line)]'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium opacity-75">
                      {msg.role === 'user' ? 'Utente' : 'Agente IA'}
                    </span>
                    <span className="text-xs opacity-60 ml-3">
                      {formatDuration(msg.time_in_call_secs)}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-[var(--mute-2)]">
            Nessuna trascrizione disponibile per questa chiamata.
          </div>
        )}
      </div>

      <div className="flex justify-center">
        <Link
          href="/dashboard/ai-calls"
          prefetch={false}
          className="px-6 py-3 bg-[var(--surface-2)] hover:bg-[var(--surface-2)] text-[var(--mute)] rounded-lg font-medium transition-colors"
        >
          ← Torna alla lista
        </Link>
      </div>
    </div>
  )
}
