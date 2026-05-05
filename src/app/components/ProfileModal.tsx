'use client'

import { useState, useEffect } from 'react'
import { useAuth } from './AuthProvider'
import { supabase } from '@/app/lib/supabaseClient'

type Props = { onClose: () => void }

export function ProfileModal({ onClose }: Props) {
  const { user, profile, updateProfile } = useAuth()

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [company, setCompany] = useState(profile?.company ?? '')
  const [newEmail, setNewEmail] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    setFullName(profile?.full_name ?? '')
    setPhone(profile?.phone ?? '')
    setCompany(profile?.company ?? '')
  }, [profile])

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    setSuccess(false)
    const { error: err } = await updateProfile({ full_name: fullName, phone, company })
    if (err) setError(err)
    else setSuccess(true)
    setIsSaving(false)
  }

  const handleEmailChange = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) return
    setIsSaving(true)
    setError(null)
    const { error: err } = await supabase.auth.updateUser({ email: newEmail.trim() })
    if (err) setError(err.message)
    else setEmailSent(true)
    setIsSaving(false)
  }

  const initials = (fullName || user?.email || '?').slice(0, 2).toUpperCase()

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#2C2E31] rounded-2xl border border-[#3A3D42] shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#3A3D42]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F0AD4E] rounded-full flex items-center justify-center text-[#1e293b] font-bold text-sm">
              {initials}
            </div>
            <div>
              <h2 className="text-white font-semibold">Il tuo profilo</h2>
              <p className="text-xs text-gray-400">{user?.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm">{error}</div>
          )}
          {success && (
            <div className="p-3 bg-[#5CB85C]/20 text-[#5CB85C] border border-[#5CB85C]/30 rounded-lg text-sm">Profilo aggiornato.</div>
          )}

          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Nome completo</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Mario Rossi"
              className="w-full px-4 py-2.5 bg-[#1F2124] border border-[#3A3D42] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F0AD4E] transition-colors"
            />
          </div>

          {/* Telefono */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Telefono</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+39 333 000 0000"
              className="w-full px-4 py-2.5 bg-[#1F2124] border border-[#3A3D42] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F0AD4E] transition-colors"
            />
          </div>

          {/* Azienda */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Azienda</label>
            <input
              type="text"
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Nome azienda"
              className="w-full px-4 py-2.5 bg-[#1F2124] border border-[#3A3D42] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F0AD4E] transition-colors"
            />
          </div>

          {/* Salva dati */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-2.5 bg-[#F0AD4E] text-[#1e293b] rounded-lg font-semibold hover:bg-[#E09A3D] transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Salvataggio...' : 'Salva modifiche'}
          </button>

          {/* Cambio email */}
          <div className="pt-2 border-t border-[#3A3D42]">
            <label className="block text-sm font-medium text-gray-300 mb-1">Cambia email</label>
            {emailSent ? (
              <p className="text-sm text-[#5CB85C]">Controlla la nuova email per confermare il cambio.</p>
            ) : (
              <div className="flex gap-2">
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="nuova@email.com"
                  className="flex-1 px-4 py-2.5 bg-[#1F2124] border border-[#3A3D42] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F0AD4E] transition-colors text-sm"
                />
                <button
                  onClick={handleEmailChange}
                  disabled={isSaving || !newEmail.includes('@')}
                  className="px-4 py-2.5 bg-[#3A3D42] text-white rounded-lg text-sm hover:bg-[#4A4D52] transition-colors disabled:opacity-40"
                >
                  Invia
                </button>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">Riceverai un'email di conferma all'indirizzo nuovo.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
