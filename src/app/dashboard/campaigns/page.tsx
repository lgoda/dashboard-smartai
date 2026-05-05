'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/components/AuthProvider'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const CAMPAIGN_TYPES = [
  { value: 'whatsapp', label: 'WhatsApp', color: '#25D366' },
  { value: 'email', label: 'Email', color: '#6B7280' },
  { value: 'sms', label: 'SMS', color: '#3B82F6' },
  { value: 'phone', label: 'Telefono', color: '#8B5CF6' },
  { value: 'other', label: 'Altro', color: '#F0AD4E' },
]

const DAY_OPTIONS = [
  { key: 'monday', label: 'Lun' }, { key: 'tuesday', label: 'Mar' },
  { key: 'wednesday', label: 'Mer' }, { key: 'thursday', label: 'Gio' },
  { key: 'friday', label: 'Ven' }, { key: 'saturday', label: 'Sab' },
  { key: 'sunday', label: 'Dom' },
]

type Campaign = {
  id: string; name: string; type: string; status: string; notes: string | null
  daily_limit: number; send_time_from: string; send_time_to: string
  send_days: string[]; created_at: string; queued_count: number
  campaign_imports: Array<{ id: string; queued_contacts: number; status: string }>
}

function TypeBadge({ type }: { type: string }) {
  const t = CAMPAIGN_TYPES.find((x) => x.value === type)
  if (!t) return null
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ color: t.color, borderColor: `${t.color}44`, backgroundColor: `${t.color}18` }}>
      {t.label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:     { label: 'Bozza',     cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
    active:    { label: 'Attiva',    cls: 'bg-[#5CB85C]/20 text-[#5CB85C] border-[#5CB85C]/30' },
    paused:    { label: 'In pausa',  cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    completed: { label: 'Completata',cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  }
  const s = map[status] ?? map.draft
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${s.cls}`}>{s.label}</span>
}

export default function CampaignsPage() {
  const router = useRouter()
  const { accessToken } = useAuth()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '', type: 'whatsapp', notes: '',
    send_time_from: '09:00', send_time_to: '18:00', daily_limit: '100',
    send_days: ['monday','tuesday','wednesday','thursday','friday'],
  })
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const fetchCampaigns = useCallback(async () => {
    const token = accessToken
    if (!token) { router.push('/'); return }
    const res = await fetch('/api/campaigns', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const json = await res.json()
      // Filter out deleted campaigns
      setCampaigns((json.campaigns ?? []).filter((c: Campaign) => c.status !== 'deleted'))
    }
    setIsLoading(false)
  }, [accessToken, router])

  useEffect(() => { fetchCampaigns() }, [fetchCampaigns])

  const handleCreate = async () => {
    if (!form.name.trim()) { setFormError('Inserisci un nome per la campagna'); return }
    setIsSaving(true)
    setFormError(null)
    try {
      const token = accessToken
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token!}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, daily_limit: parseInt(form.daily_limit, 10) || 100 }),
      })
      const json = await res.json()
      if (!res.ok) { setFormError(json.error); return }
      setShowModal(false)
      setForm({ name: '', type: 'whatsapp', notes: '', send_time_from: '09:00', send_time_to: '18:00', daily_limit: '100', send_days: ['monday','tuesday','wednesday','thursday','friday'] })
      fetchCampaigns()
    } finally { setIsSaving(false) }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Eliminare la campagna "${name}"?\nI dati e i log verranno conservati ma la campagna non sarà più visibile.`)) return
    setDeletingId(id)
    try {
      const token = accessToken
      await fetch(`/api/campaigns/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token!}` },
      })
      setCampaigns((prev) => prev.filter((c) => c.id !== id))
    } finally { setDeletingId(null) }
  }

  const toggleDay = (day: string) =>
    setForm((f) => ({ ...f, send_days: f.send_days.includes(day) ? f.send_days.filter((d) => d !== day) : [...f.send_days, day] }))

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 bg-[#3A3D42] rounded w-48 loading" />
          <div className="h-10 bg-[#3A3D42] rounded w-40 loading" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-[#3A3D42] rounded-xl loading" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-[#F0AD4E] rounded-xl flex items-center justify-center">
            <span className="text-[#1e293b] text-lg">📋</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Campagne</h1>
            <p className="text-gray-300 mt-1">Gestisci le tue campagne di contatto</p>
          </div>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#F0AD4E] text-[#1e293b] rounded-xl font-semibold hover:bg-[#E09A3D] transition-colors">
          + Nuova campagna
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-[#3A3D42] rounded-xl p-12 border border-[#1F2124] text-center">
          <p className="text-4xl mb-4">📋</p>
          <p className="text-white font-semibold text-lg mb-2">Nessuna campagna</p>
          <p className="text-gray-400 mb-6">Crea la tua prima campagna per iniziare a gestire le liste contatti</p>
          <button onClick={() => setShowModal(true)}
            className="px-6 py-3 bg-[#F0AD4E] text-[#1e293b] rounded-xl font-semibold hover:bg-[#E09A3D] transition-colors">
            + Nuova campagna
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => {
            return (
              <div key={c.id} className="bg-[#3A3D42] rounded-xl border border-[#1F2124] hover:border-[#F0AD4E]/30 transition-colors flex flex-col">
                <Link href={`/dashboard/campaigns/${c.id}`} className="flex-1 p-5 block">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-white text-lg leading-tight">{c.name}</h3>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <TypeBadge type={c.type} />
                  </div>
                  {c.notes && <p className="text-sm text-gray-400 mb-3 line-clamp-2">{c.notes}</p>}
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#1F2124]">
                    <div><p className="text-xs text-gray-500">Import</p><p className="text-white font-semibold">{c.campaign_imports?.length ?? 0}</p></div>
                    <div><p className="text-xs text-gray-500">In coda</p><p className="text-white font-semibold">{(c.queued_count ?? 0).toLocaleString('it-IT')}</p></div>
                    <div><p className="text-xs text-gray-500">Orario</p><p className="text-white text-sm">{c.send_time_from}-{c.send_time_to}</p></div>
                    <div><p className="text-xs text-gray-500">Limite/giorno</p><p className="text-white text-sm">{c.daily_limit}</p></div>
                  </div>
                </Link>
                <div className="px-5 pb-4">
                  <button
                    onClick={() => handleDelete(c.id, c.name)}
                    disabled={deletingId === c.id}
                    className="w-full py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-40"
                  >
                    {deletingId === c.id ? 'Eliminazione...' : '🗑 Elimina campagna'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2C2E31] rounded-2xl border border-[#3A3D42] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-[#3A3D42]">
              <h2 className="text-xl font-bold text-white">Nuova campagna</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm">{formError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Nome campagna *</label>
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="es. SumUp Maggio 2026"
                  className="w-full px-4 py-2 bg-[#1F2124] border border-[#1F2124] rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-[#F0AD4E] focus:border-[#F0AD4E]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Tipo *</label>
                <div className="flex flex-wrap gap-2">
                  {CAMPAIGN_TYPES.map((t) => (
                    <button key={t.value} type="button" onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${form.type === t.value ? 'border-[#F0AD4E] text-[#F0AD4E] bg-[#F0AD4E]/10' : 'border-[#1F2124] text-gray-400 hover:border-gray-500'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Note</label>
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2} className="w-full px-4 py-2 bg-[#1F2124] border border-[#1F2124] rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-[#F0AD4E] focus:border-[#F0AD4E] resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Giorni di invio</label>
                <div className="flex gap-2 flex-wrap">
                  {DAY_OPTIONS.map((d) => (
                    <button key={d.key} type="button" onClick={() => toggleDay(d.key)}
                      className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${form.send_days.includes(d.key) ? 'bg-[#F0AD4E] text-[#1e293b]' : 'bg-[#1F2124] text-gray-400 hover:text-white'}`}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Dalle</label>
                  <input type="time" value={form.send_time_from} onChange={(e) => setForm((f) => ({ ...f, send_time_from: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#1F2124] border border-[#1F2124] rounded-lg text-white text-sm focus:ring-2 focus:ring-[#F0AD4E] [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Alle</label>
                  <input type="time" value={form.send_time_to} onChange={(e) => setForm((f) => ({ ...f, send_time_to: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#1F2124] border border-[#1F2124] rounded-lg text-white text-sm focus:ring-2 focus:ring-[#F0AD4E] [color-scheme:dark]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Limite/giorno</label>
                  <input type="number" min="1" value={form.daily_limit} onChange={(e) => setForm((f) => ({ ...f, daily_limit: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#1F2124] border border-[#1F2124] rounded-lg text-white text-sm focus:ring-2 focus:ring-[#F0AD4E]" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-[#3A3D42]">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 bg-[#1F2124] text-gray-300 rounded-lg font-medium hover:bg-[#2C2E31] transition-colors">Annulla</button>
              <button onClick={handleCreate} disabled={isSaving}
                className="flex-1 px-4 py-2.5 bg-[#F0AD4E] text-[#1e293b] rounded-lg font-semibold disabled:opacity-50 hover:bg-[#E09A3D] transition-colors">
                {isSaving ? 'Salvataggio...' : 'Crea campagna'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
