'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from './AuthProvider'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  imagePreviewUrl?: string
}

const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Ciao! Sono l'assistente di SmartService. Posso aiutarti a usare la dashboard, rispondere a domande e creare ticket su Linear se trovi un problema. Puoi anche allegare screenshot con il pulsante 📎.",
}

const QUICK_QUESTIONS = [
  'Come creo una campagna?',
  'Come importo i contatti?',
  'Voglio segnalare un bug',
]

export function ChatWidget() {
  const { user, profile } = useAuth()
  const sessionId = useRef<string>(
    typeof crypto !== 'undefined' ? crypto.randomUUID() : `s-${Date.now()}`
  )
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 200)
  }, [isOpen])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const open = () => setIsOpen(true)
  const close = () => setIsOpen(false)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file?.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) { alert('Dimensione massima: 5 MB'); return }
    setPendingImage(file)
    const reader = new FileReader()
    reader.onload = () => setPendingImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if ((!trimmed && !pendingImage) || isLoading) return

    const capturedImage = pendingImage
    const capturedPreview = pendingImagePreview

    setMessages(prev => [...prev, {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed || '📎 Screenshot allegato',
      imagePreviewUrl: capturedPreview ?? undefined,
    }])
    setInput('')
    setPendingImage(null)
    setPendingImagePreview(null)
    setIsLoading(true)

    try {
      let payload: Record<string, unknown>
      if (capturedImage && capturedPreview) {
        const commaIdx = capturedPreview.indexOf(',')
        payload = {
          message: trimmed || 'Screenshot allegato',
          sessionId: sessionId.current,
          userName: profile?.full_name || '',
          imageBase64: capturedPreview.slice(commaIdx + 1),
          imageMimeType: capturedPreview.slice(5, capturedPreview.indexOf(';')),
          imageName: capturedImage.name,
        }
      } else {
        payload = { message: trimmed, sessionId: sessionId.current, userName: profile?.full_name || '' }
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: json.reply || 'Scusa, non ho ottenuto una risposta. Riprova.',
      }])
    } catch {
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: 'Errore di connessione. Riprova tra qualche secondo.',
      }])
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, pendingImage, pendingImagePreview, profile])

  if (!user) return null

  const showQuick = messages.length === 1 && !isLoading

  return (
    <>
      {/* ── FAB button — nascosto su mobile quando chat è aperta ── */}
      <button
        onClick={open}
        className={`fixed bottom-6 right-6 z-40 w-14 h-14 bg-[#F59E0B] text-[#1e293b] rounded-full shadow-xl hover:bg-[#D97706] active:scale-95 transition-all flex items-center justify-center ${isOpen ? 'hidden sm:flex' : 'flex'}`}
        aria-label="Apri assistente"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </button>

      {/* ── Chat panel ── */}
      {isOpen && (
        <div
          className={[
            // Mobile: full screen
            'fixed inset-0 z-50 flex flex-col bg-[#18191C]',
            // Desktop: floating panel
            'sm:inset-auto sm:bottom-[88px] sm:right-6',
            'sm:w-[400px] sm:h-[580px]',
            'sm:rounded-2xl sm:border sm:border-[#222428] sm:shadow-2xl',
          ].join(' ')}
        >
          {/* ── Header ── */}
          <div className="flex items-center gap-3 px-4 bg-[#141517] border-b border-[#222428] shrink-0"
            style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: '12px' }}>

            {/* Back/close — freccia su mobile, X su desktop */}
            <button
              onClick={close}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-[#222428] transition-colors shrink-0"
              aria-label="Chiudi"
            >
              {/* Arrow on mobile */}
              <svg className="w-5 h-5 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
              {/* X on desktop */}
              <svg className="w-5 h-5 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="w-9 h-9 bg-[#F59E0B] rounded-full flex items-center justify-center text-[#1e293b] font-bold text-sm shrink-0">S</div>

            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm leading-tight truncate">Assistente SmartService</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
                <p className="text-xs text-gray-400">Online</p>
              </div>
            </div>
          </div>

          {/* ── Messages ── */}
          <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 bg-[#F59E0B] rounded-full flex items-center justify-center text-[#1e293b] font-bold text-xs shrink-0">S</div>
                )}
                <div className={`max-w-[78%] rounded-2xl text-sm leading-relaxed overflow-hidden shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-[#F59E0B] text-[#1e293b] font-medium rounded-br-sm'
                    : 'bg-[#222428] text-white rounded-bl-sm'
                }`}>
                  {msg.imagePreviewUrl && (
                    <img src={msg.imagePreviewUrl} alt="screenshot" className="w-full max-w-[260px] object-cover" />
                  )}
                  {msg.content && <p className="px-3.5 py-2.5 whitespace-pre-wrap">{msg.content}</p>}
                </div>
              </div>
            ))}

            {/* Quick questions */}
            {showQuick && (
              <div className="flex flex-col gap-2 pl-9">
                {QUICK_QUESTIONS.map(q => (
                  <button key={q} onClick={() => send(q)}
                    className="text-left text-sm text-[#F59E0B] border border-[#F59E0B]/30 hover:border-[#F59E0B] hover:bg-[#F59E0B]/5 active:bg-[#F59E0B]/10 px-4 py-3 rounded-xl transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex items-end gap-2">
                <div className="w-7 h-7 bg-[#F59E0B] rounded-full flex items-center justify-center text-[#1e293b] font-bold text-xs shrink-0">S</div>
                <div className="bg-[#222428] px-4 py-3.5 rounded-2xl rounded-bl-sm shadow-sm">
                  <div className="flex gap-1 items-center">
                    {[0, 150, 300].map(d => (
                      <div key={d} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input bar ── */}
          <div
            className="shrink-0 bg-[#141517] border-t border-[#222428]"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
          >
            {/* Image preview */}
            {pendingImagePreview && (
              <div className="px-4 pt-3 flex items-center gap-3">
                <div className="relative">
                  <img src={pendingImagePreview} alt="preview" className="w-14 h-14 object-cover rounded-xl border border-[#222428]" />
                  <button onClick={() => { setPendingImage(null); setPendingImagePreview(null) }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center font-bold">
                    ✕
                  </button>
                </div>
                <p className="text-xs text-gray-400 truncate">{pendingImage?.name}</p>
              </div>
            )}

            <div className="flex items-center gap-2 px-4 pt-3">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

              {/* Attach */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-[#F59E0B] active:text-[#F59E0B] transition-colors disabled:opacity-40 shrink-0"
                aria-label="Allega immagine"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>

              {/* Text input */}
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
                placeholder={pendingImage ? 'Descrizione...' : 'Scrivi un messaggio...'}
                disabled={isLoading}
                className="flex-1 bg-[#18191C] text-white text-sm px-4 py-3 rounded-2xl border border-[#222428] placeholder-gray-500 focus:outline-none focus:border-[#F59E0B] disabled:opacity-50 transition-colors"
              />

              {/* Send */}
              <button
                onClick={() => send(input)}
                disabled={(!input.trim() && !pendingImage) || isLoading}
                className="w-10 h-10 bg-[#F59E0B] text-[#1e293b] rounded-2xl flex items-center justify-center hover:bg-[#D97706] active:scale-95 transition-all disabled:opacity-40 shrink-0"
                aria-label="Invia"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19V5m-7 7l7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
