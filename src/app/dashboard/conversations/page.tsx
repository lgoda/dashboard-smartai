'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import { useRouter } from 'next/navigation'

type Conversation = {
  id: string
  session_id: string
  sender: string
  message: string
  created_at: string
}

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [groupedConversations, setGroupedConversations] = useState<Record<string, Conversation[]>>({})
  const router = useRouter()

  useEffect(() => {
    const fetchData = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) return router.push('/')
      setUser(userData.user)

      const { data: conv } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: true })

      if (!conv) return

      // Raggruppa per session_id
      const sessions: Record<string, Conversation[]> = {}
      conv.forEach(c => {
        if (!sessions[c.session_id]) sessions[c.session_id] = []
        sessions[c.session_id].push(c)
      })
      setGroupedConversations(sessions)
    }

    fetchData()
  }, [router])

  if (!user) return <p className="text-center mt-10">Caricamento...</p>

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold mb-4">🗂️ Conversazioni per sessione</h1>

      {Object.entries(groupedConversations).map(([sessionId, messages]) => {
        const lastMsg = messages[messages.length - 1]
        return (
          <div key={sessionId} className="border rounded p-4 bg-white shadow-sm">
            <div className="text-lg font-semibold">💬 Sessione: {sessionId}</div>
            <div className="text-gray-600 mt-1">Messaggi totali: {messages.length}</div>
            <div className="mt-2 text-sm italic text-gray-800">
              Ultimo: <strong>{lastMsg.sender}</strong>: {lastMsg.message}
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-blue-600 hover:underline">Visualizza tutti</summary>
              <ul className="mt-2 space-y-1">
                {messages.map(msg => (
                  <li key={msg.id} className="text-sm">
                    <strong>{msg.sender}</strong>: {msg.message}{' '}
                    <span className="text-gray-400">({new Date(msg.created_at).toLocaleString()})</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )
      })}
    </div>
  )
}
