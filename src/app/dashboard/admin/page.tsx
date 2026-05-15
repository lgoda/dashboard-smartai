'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/components/AuthProvider'

export const dynamic = 'force-dynamic'

type UserRow = {
  id: string
  email: string
  full_name: string
  phone: string
  company: string
  role: 'admin' | 'user'
  is_active: boolean
  created_at: string
}

export default function AdminPage() {
  const { profile, accessToken, loading: authLoading } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<UserRow[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const isLoading = authLoading || dataLoading
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    if (profile && profile.role !== 'admin') router.push('/dashboard')
  }, [profile, router])

  const fetchUsers = useCallback(async () => {
    if (!accessToken) return
    setDataLoading(true)
    try {
      const res = await fetch('/api/admin/users', { headers: { Authorization: `Bearer ${accessToken}` } })
      if (res.ok) {
        const json = await res.json()
        setUsers(json.users ?? [])
      }
    } finally {
      setDataLoading(false)
    }
  }, [accessToken])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !accessToken) return
    setInviting(true)
    setInviteMsg(null)
    setInviteLink(null)
    setCopied(false)
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    })
    const json = await res.json()
    if (res.ok) {
      setInviteMsg({ type: 'ok', text: json.message })
      setInviteLink(json.link ?? null)
      setInviteEmail('')
    } else {
      setInviteMsg({ type: 'err', text: json.error })
    }
    setInviting(false)
  }

  const copyLink = () => {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleActive = async (userId: string, currentValue: boolean) => {
    if (!accessToken) return
    setTogglingId(userId)
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, is_active: !currentValue }),
    })
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentValue } : u))
    setTogglingId(null)
  }

  const toggleRole = async (userId: string, currentRole: string) => {
    if (!accessToken) return
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role: newRole }),
    })
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole as 'admin' | 'user' } : u))
  }

  if (isLoading) return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-[#222428] rounded-xl loading" />)}
    </div>
  )

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-red-500/80 rounded-xl flex items-center justify-center text-white text-lg">🔑</div>
        <div>
          <h1 className="text-3xl font-bold text-white">Admin</h1>
          <p className="text-gray-400">Gestione accessi e inviti</p>
        </div>
      </div>

      {/* Invite */}
      <div className="bg-[#222428] rounded-xl border border-[#141517] p-6">
        <h2 className="text-white font-semibold mb-4">Invita nuovo utente</h2>
        {inviteMsg && (
          <div className={`p-3 rounded-lg text-sm mb-3 ${inviteMsg.type === 'ok' ? 'bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
            {inviteMsg.text}
          </div>
        )}

        {inviteLink && (
          <div className="mb-4 space-y-2">
            {/* Avviso critico */}
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <p className="text-xs text-amber-300 leading-relaxed">
                <strong className="text-amber-400">Non aprire questo link in questo browser.</strong> Condividilo con il nuovo utente oppure aprilo in una <strong>finestra incognito</strong> — altrimenti disconnetteresti la tua sessione admin.
              </p>
            </div>
            {/* Link */}
            <div className="p-3 bg-[#141517] border border-[#F59E0B]/30 rounded-lg">
              <p className="text-xs text-gray-400 mb-2">Link di invito (valido 24h) — copia e invia all'utente:</p>
              <div className="flex gap-2 items-center">
                <input
                  readOnly
                  value={inviteLink}
                  className="flex-1 text-xs text-[#F59E0B] bg-transparent outline-none truncate"
                />
                <button
                  onClick={copyLink}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] hover:bg-[#F59E0B]/20 transition-colors whitespace-nowrap"
                >
                  {copied ? '✓ Copiato' : 'Copia link'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <input
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleInvite()}
            placeholder="email@esempio.com"
            className="flex-1 px-4 py-2.5 bg-[#141517] border border-[#141517] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F59E0B] transition-colors"
          />
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.includes('@')}
            className="px-5 py-2.5 bg-[#F59E0B] text-[#1e293b] rounded-lg font-semibold hover:bg-[#D97706] transition-colors disabled:opacity-40"
          >
            {inviting ? 'Generazione...' : 'Genera link'}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">Genera un link di accesso da condividere direttamente con l'utente — nessuna email inviata.</p>
      </div>

      {/* Users list */}
      <div className="bg-[#222428] rounded-xl border border-[#141517] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#141517]">
          <h2 className="text-white font-semibold">Utenti registrati ({users.length})</h2>
        </div>
        <div className="divide-y divide-[#141517]">
          {users.map(u => (
            <div key={u.id} className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#F59E0B]/20 rounded-full flex items-center justify-center text-[#F59E0B] font-bold text-xs">
                  {(u.full_name || u.email || '?').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{u.full_name || '(nessun nome)'}</p>
                  <p className="text-gray-400 text-xs">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs border ${u.role === 'admin' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                  {u.role}
                </span>
                <button
                  onClick={() => toggleRole(u.id, u.role)}
                  className="text-xs text-gray-400 hover:text-white px-2 py-1 hover:bg-[#141517] rounded transition-colors"
                >
                  {u.role === 'admin' ? '→ user' : '→ admin'}
                </button>
                <button
                  onClick={() => toggleActive(u.id, u.is_active)}
                  disabled={togglingId === u.id}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${u.is_active ? 'bg-[#22C55E]/20 text-[#22C55E] hover:bg-red-500/20 hover:text-red-400' : 'bg-red-500/20 text-red-400 hover:bg-[#22C55E]/20 hover:text-[#22C55E]'}`}
                >
                  {u.is_active ? 'Attivo' : 'Revocato'}
                </button>
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <p className="px-6 py-8 text-gray-400 text-center">Nessun utente registrato.</p>
          )}
        </div>
      </div>
    </div>
  )
}
