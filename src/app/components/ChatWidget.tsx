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
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipDismissed, setTooltipDismissed] = useState(false)
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (tooltipDismissed) return
    const show = setTimeout(() => setShowTooltip(true), 4000)
    return () => clearTimeout(show)
  }, [tooltipDismissed])

  useEffect(() => {
    if (!showTooltip) return
    const hide = setTimeout(() => setShowTooltip(false), 5000)
    return () => clearTimeout(hide)
  }, [showTooltip])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150)
  }, [isOpen])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) {
      alert('Dimensione massima: 5 MB')
      return
    }
    setPendingImage(file)
    const reader = new FileReader()
    reader.onload = () => setPendingImagePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  const removePendingImage = () => {
    setPendingImage(null)
    setPendingImagePreview(null)
  }

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if ((!trimmed && !pendingImage) || isLoading) return

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed || '📎 Screenshot allegato',
      imagePreviewUrl: pendingImagePreview ?? undefined,
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    const capturedImage = pendingImage
    const capturedPreview = pendingImagePreview
    setPendingImage(null)
    setPendingImagePreview(null)
    setIsLoading(true)

    try {
      let payload: Record<string, unknown>

      if (capturedImage && capturedPreview) {
        // Extract base64 and mimeType from data URL (data:image/png;base64,<data>)
        const commaIdx = capturedPreview.indexOf(',')
        const base64 = capturedPreview.slice(commaIdx + 1)
        const mimeType = capturedPreview.slice(5, capturedPreview.indexOf(';'))
        payload = {
          message: trimmed || 'Screenshot allegato',
          sessionId: sessionId.current,
          userName: profile?.full_name || '',
          imageBase64: base64,
          imageMimeType: mimeType,
          imageName: capturedImage.name,
        }
      } else {
        payload = { message: trimmed, sessionId: sessionId.current, userName: profile?.full_name || '' }
      }

      const body = JSON.stringify(payload)
      const headers = { 'Content-Type': 'application/json' }

      const res = await fetch('/api/chat', { method: 'POST', headers, body })
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
  }, [isLoading, pendingImage, pendingImagePreview])

  if (!user) return null

  const showQuick = messages.length === 1 && !isLoading

  return (
    <>
      {/* Tooltip */}
      {showTooltip && !isOpen && (
        <div className="fixed bottom-[88px] right-6 z-40 bg-[#1F2124] border border-[#3A3D42] text-white text-sm px-3 py-2 rounded-xl shadow-xl pointer-events-none">
          💬 Come posso aiutarti?
          <div className="absolute bottom-[-6px] right-5 w-3 h-3 bg-[#1F2124] border-r border-b border-[#3A3D42] rotate-45" />
        </div>
      )}

      {/* Panel */}
      {isOpen && (
        <div
          className="fixed bottom-[88px] right-6 z-50 w-[380px] flex flex-col bg-[#2C2E31] rounded-2xl border border-[#3A3D42] shadow-2xl overflow-hidden"
          style={{ height: '560px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#1F2124] border-b border-[#3A3D42] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#F0AD4E] rounded-full flex items-center justify-center text-[#1e293b] font-bold text-sm shrink-0">S</div>
              <div>
                <p className="text-white font-semibold text-sm leading-tight">Assistente SmartService</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#5CB85C]" />
                  <p className="text-xs text-gray-400">Online</p>
                </div>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white transition-colors p-1">✕</button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] rounded-2xl text-sm leading-relaxed overflow-hidden ${
                  msg.role === 'user'
                    ? 'bg-[#F0AD4E] text-[#1e293b] font-medium rounded-br-sm'
                    : 'bg-[#3A3D42] text-white rounded-bl-sm'
                }`}>
                  {msg.imagePreviewUrl && (
                    <img
                      src={msg.imagePreviewUrl}
                      alt="screenshot"
                      className="w-full max-w-[240px] rounded-t-2xl object-cover"
                    />
                  )}
                  {msg.content && (
                    <p className="px-3 py-2.5 whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {/* Quick questions */}
            {showQuick && (
              <div className="flex flex-col gap-2 mt-2">
                {QUICK_QUESTIONS.map(q => (
                  <button key={q} onClick={() => send(q)}
                    className="text-left text-xs text-[#F0AD4E] border border-[#F0AD4E]/30 hover:border-[#F0AD4E]/70 hover:bg-[#F0AD4E]/5 px-3 py-2 rounded-xl transition-colors">
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-[#3A3D42] px-4 py-3 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1 items-center">
                    {[0, 150, 300].map(delay => (
                      <div key={delay} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${delay}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-[#3A3D42] shrink-0">
            {/* Image preview */}
            {pendingImagePreview && (
              <div className="px-3 pt-3 flex items-start gap-2">
                <div className="relative">
                  <img
                    src={pendingImagePreview}
                    alt="preview"
                    className="w-16 h-16 object-cover rounded-lg border border-[#3A3D42]"
                  />
                  <button
                    onClick={removePendingImage}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 transition-colors leading-none"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">{pendingImage?.name}</p>
              </div>
            )}

            <div className="p-3 flex gap-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              {/* Attach button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                title="Allega screenshot"
                className="p-2.5 text-gray-400 hover:text-[#F0AD4E] hover:bg-[#3A3D42] rounded-xl transition-colors disabled:opacity-40 shrink-0 text-base"
              >
                📎
              </button>
              {/* Text input */}
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
                placeholder={pendingImage ? 'Aggiungi una descrizione...' : 'Scrivi un messaggio...'}
                disabled={isLoading}
                className="flex-1 bg-[#1F2124] text-white text-sm px-3 py-2.5 rounded-xl border border-[#3A3D42] placeholder-gray-500 focus:outline-none focus:border-[#F0AD4E] disabled:opacity-50 transition-colors"
              />
              {/* Send button */}
              <button
                onClick={() => send(input)}
                disabled={(!input.trim() && !pendingImage) || isLoading}
                className="px-3.5 py-2.5 bg-[#F0AD4E] text-[#1e293b] rounded-xl font-bold text-base hover:bg-[#E09A3D] transition-colors disabled:opacity-40 shrink-0"
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => {
          setIsOpen(v => !v)
          setShowTooltip(false)
          setTooltipDismissed(true)
        }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-[#F0AD4E] text-[#1e293b] rounded-full shadow-xl hover:bg-[#E09A3D] transition-colors flex items-center justify-center text-2xl"
        aria-label="Assistente">
        {isOpen ? '✕' : '💬'}
      </button>
    </>
  )
}
