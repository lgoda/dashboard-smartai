'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/app/components/AuthProvider'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const DAY_OPTIONS = [
  { key: 'monday', label: 'Lun' }, { key: 'tuesday', label: 'Mar' },
  { key: 'wednesday', label: 'Mer' }, { key: 'thursday', label: 'Gio' },
  { key: 'friday', label: 'Ven' }, { key: 'saturday', label: 'Sab' },
  { key: 'sunday', label: 'Dom' },
]

const TYPE_OPTIONS = [
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email',    label: 'Email' },
  { key: 'sms',      label: 'SMS' },
  { key: 'phone',    label: 'Telefono' },
  { key: 'other',    label: 'Altro' },
]

type Campaign = {
  id: string; name: string; type: string; status: string; notes: string | null
  daily_limit: number; send_time_from: string; send_time_to: string
  send_days: string[]; timezone: string; created_at: string; last_processed_at: string | null
  campaign_imports: CampaignImport[]
}

type CampaignImport = {
  id: string; file_name: string; list_tag: string; crm_automation_id: string
  crm_automation_name: string; total_rows: number; valid_contacts: number
  excluded_no_phone: number; excluded_duplicates: number; queued_contacts: number
  excluded_tags: string[]; created_at: string; status: string
  excluded_crm: number; excluded_tag: number
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:     { label: 'Bozza',      cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
    active:    { label: 'Attiva',     cls: 'bg-[#22C55E]/20 text-[#22C55E] border-[#22C55E]/30' },
    paused:    { label: 'In pausa',   cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    completed: { label: 'Completata', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  }
  const s = map[status] ?? map.draft
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${s.cls}`}>{s.label}</span>
}

export default function CampaignDetailPage() {
  const router = useRouter()
  const { accessToken } = useAuth()
  const params = useParams()
  const campaignId = params.id as string

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [sentToday, setSentToday] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isChangingStatus, setIsChangingStatus] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ send_time_from: '', send_time_to: '', daily_limit: '', send_days: [] as string[] })
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', type: '', notes: '' })
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [backfillingImportId, setBackfillingImportId] = useState<string | null>(null)
  const [backfillMsg, setBackfillMsg] = useState<{ importId: string; text: string; ok: boolean } | null>(null)


  const fetchCampaign = useCallback(async () => {
    const token = accessToken
    if (!token) { router.push('/'); return }

    const res = await fetch(`/api/campaigns/${campaignId}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) { router.push('/dashboard/campaigns'); return }
    const json = await res.json()

    if (json.campaign.status === 'deleted') { router.push('/dashboard/campaigns'); return }

    setCampaign(json.campaign)
    setStatusCounts(json.status_counts ?? {})
    setSentToday(json.sent_today ?? 0)
    setScheduleForm({
      send_time_from: json.campaign.send_time_from ?? '09:00',
      send_time_to: json.campaign.send_time_to ?? '18:00',
      daily_limit: String(json.campaign.daily_limit ?? 100),
      send_days: json.campaign.send_days ?? [],
    })
    setIsLoading(false)
  }, [campaignId, accessToken, router])

  useEffect(() => { fetchCampaign() }, [fetchCampaign])

  const setStatus = async (newStatus: string) => {
    if (!campaign) return
    setIsChangingStatus(true)
    const token = accessToken
    await fetch(`/api/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token!}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    setCampaign((c) => c ? { ...c, status: newStatus } : c)
    setIsChangingStatus(false)
  }

  const deleteCampaign = async () => {
    if (!campaign) return
    setIsDeleting(true)
    const token = accessToken
    await fetch(`/api/campaigns/${campaignId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token!}` },
    })
    router.push('/dashboard/campaigns')
  }

  const saveEdit = async () => {
    if (!editForm.name.trim()) return
    setIsSavingEdit(true)
    const token = accessToken
    await fetch(`/api/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token!}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editForm.name.trim(), type: editForm.type, notes: editForm.notes }),
    })
    await fetchCampaign()
    setIsSavingEdit(false)
    setShowEditModal(false)
  }

  const saveSchedule = async () => {
    setIsSavingSchedule(true)
    const token = accessToken
    await fetch(`/api/campaigns/${campaignId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token!}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        send_time_from: scheduleForm.send_time_from,
        send_time_to: scheduleForm.send_time_to,
        daily_limit: parseInt(scheduleForm.daily_limit, 10) || 100,
        send_days: scheduleForm.send_days,
      }),
    })
    await fetchCampaign()
    setIsSavingSchedule(false)
    setShowSchedule(false)
  }

  const backfillTags = async (importId: string) => {
    if (!accessToken) return
    setBackfillingImportId(importId)
    setBackfillMsg({ importId, text: 'Avvio sincronizzazione...', ok: true })

    let totals = { processed: 0, tagged: 0, already_had_tag: 0, errors: 0 }
    let cursor: string | null = ''
    let pageCount = 0

    try {
      while (true) {
        pageCount++
        const url = `/api/campaigns/imports/${importId}/backfill-tags${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`
        const r = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const j = await r.json()
        if (!r.ok) {
          setBackfillMsg({ importId, text: `Errore al batch ${pageCount}: ${j.error ?? 'sconosciuto'} (parziale: tag ${totals.tagged}, già ${totals.already_had_tag}, errori ${totals.errors})`, ok: false })
          break
        }
        totals = {
          processed:       totals.processed       + (j.processed ?? 0),
          tagged:          totals.tagged          + (j.tagged ?? 0),
          already_had_tag: totals.already_had_tag + (j.already_had_tag ?? 0),
          errors:          totals.errors          + (j.errors ?? 0),
        }
        setBackfillMsg({ importId, text: `Sync in corso… processati ${totals.processed} (tag ${totals.tagged}, già ${totals.already_had_tag}, errori ${totals.errors})`, ok: true })

        if (j.done) {
          setBackfillMsg({ importId, text: `Completato: ${totals.tagged} tag applicati, ${totals.already_had_tag} già presenti, ${totals.errors} errori (su ${totals.processed} processati)`, ok: true })
          break
        }
        cursor = j.next_cursor
        if (!cursor) break
      }
    } catch (e) {
      setBackfillMsg({ importId, text: e instanceof Error ? e.message : 'Errore di rete', ok: false })
    }

    setBackfillingImportId(null)
    setTimeout(() => setBackfillMsg(null), 12000)
  }

  if (isLoading || !campaign) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-[#222428] rounded w-64 loading" />
        <div className="h-48 bg-[#222428] rounded-xl loading" />
      </div>
    )
  }

  const queuedTotal = statusCounts['queued'] ?? 0
  const sentTotal = statusCounts['sent_to_crm'] ?? 0
  const excludedTotal = (statusCounts['excluded'] ?? 0) + (statusCounts['error'] ?? 0)
  const dailyLimit = campaign.daily_limit ?? 100
  const remainingToday = Math.max(0, dailyLimit - sentToday)

  const isDraft = campaign.status === 'draft'
  const isActive = campaign.status === 'active'
  const isPaused = campaign.status === 'paused'
  const isCompleted = campaign.status === 'completed'

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/dashboard/campaigns" className="hover:text-[#F59E0B] transition-colors">Campagne</Link>
        <span>/</span>
        <span className="text-white">{campaign.name}</span>
      </div>

      {/* Header card */}
      <div className="bg-[#222428] rounded-xl p-6 border border-[#141517]">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
              <StatusBadge status={campaign.status} />
              {!isCompleted && (
                <button
                  onClick={() => { setEditForm({ name: campaign.name, type: campaign.type, notes: campaign.notes ?? '' }); setShowEditModal(true) }}
                  className="p-1.5 text-gray-400 hover:text-[#F59E0B] transition-colors"
                  title="Modifica campagna">
                  ✏
                </button>
              )}
            </div>
            {campaign.notes && <p className="text-gray-400 text-sm mt-1">{campaign.notes}</p>}
            {campaign.last_processed_at && (
              <p className="text-xs text-gray-500 mt-1">
                Ultima elaborazione scheduler: {new Date(campaign.last_processed_at).toLocaleString('it-IT')}
              </p>
            )}
          </div>

          {/* Action buttons based on status */}
          <div className="flex flex-wrap gap-2">
            {isDraft && (
              <button onClick={() => setStatus('active')} disabled={isChangingStatus}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#22C55E] text-white rounded-lg font-semibold disabled:opacity-50 hover:bg-[#4cae4c] transition-colors">
                {isChangingStatus ? '...' : '▶ Avvia campagna'}
              </button>
            )}
            {isActive && (
              <button onClick={() => setStatus('paused')} disabled={isChangingStatus}
                className="px-4 py-2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-lg font-medium disabled:opacity-50 hover:bg-yellow-500/30 transition-colors">
                {isChangingStatus ? '...' : '⏸ Metti in pausa'}
              </button>
            )}
            {isPaused && (
              <button onClick={() => setStatus('active')} disabled={isChangingStatus}
                className="px-4 py-2 bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30 rounded-lg font-medium disabled:opacity-50 hover:bg-[#22C55E]/30 transition-colors">
                {isChangingStatus ? '...' : '▶ Riprendi campagna'}
              </button>
            )}
            {!isCompleted && (
              <Link href={`/dashboard/campaigns/${campaignId}/import`}
                className="px-4 py-2 bg-[#F59E0B] text-[#1e293b] rounded-lg font-semibold hover:bg-[#D97706] transition-colors">
                + Nuovo import
              </Link>
            )}
            <button onClick={() => setShowDeleteModal(true)} disabled={isDeleting}
              className="px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg font-medium disabled:opacity-50 hover:bg-red-500/20 transition-colors">
              {isDeleting ? '...' : '🗑 Elimina'}
            </button>
          </div>
        </div>

        {/* Info banner for draft state */}
        {isDraft && (
          <div className="p-3 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-lg text-sm text-[#F59E0B] mb-4">
            ⚡ Campagna in bozza. Clicca <strong>Avvia campagna</strong> per attivare lo scheduler automatico.
            Lo scheduler processerà i contatti in coda secondo l'orario e i giorni configurati.
          </div>
        )}
        {isActive && (
          <div className="p-3 bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-lg text-sm text-[#22C55E] mb-4">
            ✓ Campagna attiva. Lo scheduler invia automaticamente i contatti in coda ogni 10 minuti, rispettando giorni, orario e limite giornaliero.
          </div>
        )}
        {isPaused && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-400 mb-4">
            ⏸ Campagna in pausa. Lo scheduler non invierà nuovi contatti finché non la riprendi.
          </div>
        )}
        {isCompleted && (
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-400 mb-4">
            ✓ Campagna completata. Tutti i contatti in coda sono stati processati.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t border-[#141517]">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">In coda</p>
            <p className="text-2xl font-bold text-[#F59E0B]">{queuedTotal.toLocaleString('it-IT')}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Inviati totale</p>
            <p className="text-2xl font-bold text-[#22C55E]">{sentTotal.toLocaleString('it-IT')}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Inviati oggi</p>
            <p className="text-2xl font-bold text-white">{sentToday} / {dailyLimit}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Rimanenti oggi</p>
            <p className="text-2xl font-bold text-white">{remainingToday}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Esclusi</p>
            <p className="text-2xl font-bold text-gray-400">{(statusCounts['excluded'] ?? 0).toLocaleString('it-IT')}</p>
          </div>
        </div>
      </div>

      {/* Schedule settings */}
      <div className="bg-[#222428] rounded-xl border border-[#141517]">
        <button onClick={() => setShowSchedule(!showSchedule)}
          className="w-full flex items-center justify-between p-5 text-left">
          <div>
            <p className="font-semibold text-white">Impostazioni schedule</p>
            <p className="text-sm text-gray-400 mt-0.5">
              {campaign.send_days.map((d) => DAY_OPTIONS.find((o) => o.key === d)?.label).join(' ')} ·{' '}
              {campaign.send_time_from} - {campaign.send_time_to} · {campaign.daily_limit} contatti/giorno
            </p>
          </div>
          <span className={`text-gray-400 transition-transform ${showSchedule ? 'rotate-180' : ''}`}>▾</span>
        </button>

        {showSchedule && (
          <div className="px-5 pb-5 space-y-4 border-t border-[#141517]">
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">Giorni di invio</label>
              <div className="flex gap-2 flex-wrap">
                {DAY_OPTIONS.map((d) => (
                  <button key={d.key} onClick={() => setScheduleForm((f) => ({
                    ...f,
                    send_days: f.send_days.includes(d.key) ? f.send_days.filter((x) => x !== d.key) : [...f.send_days, d.key],
                  }))}
                    className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${scheduleForm.send_days.includes(d.key) ? 'bg-[#F59E0B] text-[#1e293b]' : 'bg-[#141517] text-gray-400 hover:text-white'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Dalle</label>
                <input type="time" value={scheduleForm.send_time_from}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, send_time_from: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-white text-sm focus:ring-2 focus:ring-[#F59E0B] [color-scheme:dark]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Alle</label>
                <input type="time" value={scheduleForm.send_time_to}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, send_time_to: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-white text-sm focus:ring-2 focus:ring-[#F59E0B] [color-scheme:dark]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Limite/giorno</label>
                <input type="number" min="1" value={scheduleForm.daily_limit}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, daily_limit: e.target.value }))}
                  className="w-full px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-white text-sm focus:ring-2 focus:ring-[#F59E0B]" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowSchedule(false)} className="px-4 py-2 bg-[#141517] text-gray-300 rounded-lg text-sm hover:bg-[#18191C] transition-colors">Annulla</button>
              <button onClick={saveSchedule} disabled={isSavingSchedule}
                className="px-4 py-2 bg-[#F59E0B] text-[#1e293b] rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-[#D97706] transition-colors">
                {isSavingSchedule ? 'Salvataggio...' : 'Salva impostazioni'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Imports list */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-white">
          Import ({campaign.campaign_imports?.length ?? 0})
        </h2>

        {(campaign.campaign_imports ?? []).length === 0 ? (
          <div className="bg-[#222428] rounded-xl p-8 border border-[#141517] text-center">
            <p className="text-gray-400 mb-4">Nessun import ancora.</p>
            {!isCompleted && (
              <Link href={`/dashboard/campaigns/${campaignId}/import`}
                className="inline-block px-5 py-2.5 bg-[#F59E0B] text-[#1e293b] rounded-xl font-semibold hover:bg-[#D97706] transition-colors">
                + Carica lista contatti
              </Link>
            )}
          </div>
        ) : (
          [...(campaign.campaign_imports ?? [])]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((imp) => (
              <div key={imp.id} className="bg-[#222428] rounded-xl border border-[#141517] p-5">
                <div className="flex items-start justify-between flex-wrap gap-2 mb-4">
                  <div>
                    <p className="font-semibold text-white">{imp.list_tag}</p>
                    <p className="text-sm text-gray-400">
                      {imp.file_name} · {new Date(imp.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Automazione: {imp.crm_automation_name}</p>
                    {imp.excluded_tags?.length > 0 && (
                      <p className="text-xs text-gray-500">Tag esclusi: {imp.excluded_tags.join(', ')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Status pill */}
                    {imp.queued_contacts === 0 ? (
                      <span className="px-2.5 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30">Completato</span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30">{imp.queued_contacts} in coda</span>
                    )}
                    <button
                      onClick={() => backfillTags(imp.id)}
                      disabled={backfillingImportId === imp.id}
                      title="Riapplica il tag lista ai contatti già inviati che non lo hanno ancora su GHL"
                      className="px-2.5 py-1 rounded-full text-xs bg-gray-500/10 text-gray-300 border border-gray-500/30 hover:bg-gray-500/20 disabled:opacity-50 transition-colors"
                    >
                      {backfillingImportId === imp.id ? 'Sync...' : 'Sincronizza tag CRM'}
                    </button>
                  </div>
                </div>
                {backfillMsg?.importId === imp.id && (
                  <p className={`text-xs mb-3 ${backfillMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{backfillMsg.text}</p>
                )}

                <div className="grid grid-cols-3 md:grid-cols-5 gap-3 text-center">
                  {[
                    { label: 'Totale', value: imp.total_rows, color: 'text-white' },
                    { label: 'Validi', value: imp.valid_contacts, color: 'text-[#22C55E]' },
                    { label: 'No tel.', value: imp.excluded_no_phone, color: 'text-red-400' },
                    { label: 'Duplic.', value: imp.excluded_duplicates, color: 'text-yellow-400' },
                    { label: 'In coda', value: imp.queued_contacts, color: 'text-[#F59E0B]' },
                  ].map((s) => (
                    <div key={s.label} className="bg-[#141517] rounded-lg p-2">
                      <p className="text-xs text-gray-500">{s.label}</p>
                      <p className={`text-lg font-bold ${s.color}`}>{s.value?.toLocaleString('it-IT') ?? 0}</p>
                    </div>
                  ))}
                </div>
                {((imp.excluded_crm ?? 0) > 0 || (imp.excluded_tag ?? 0) > 0) && (
                  <div className="mt-2 pt-2 border-t border-[#18191C]">
                    <p className="text-xs text-gray-500 mb-1.5">Esclusi dallo scheduler</p>
                    <div className="flex gap-2 flex-wrap">
                      {(imp.excluded_crm ?? 0) > 0 && (
                        <span className="px-2 py-1 rounded text-xs bg-gray-500/10 text-gray-400 border border-gray-500/20">
                          {imp.excluded_crm} già nel CRM
                        </span>
                      )}
                      {(imp.excluded_tag ?? 0) > 0 && (
                        <span className="px-2 py-1 rounded text-xs bg-red-500/10 text-red-400 border border-red-500/20">
                          {imp.excluded_tag} tag escluso
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
        )}
      </div>
      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#222428] rounded-2xl border border-red-500/20 w-full max-w-sm shadow-2xl">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4 text-2xl">🗑</div>
              <h2 className="text-lg font-bold text-white mb-1">Eliminare la campagna?</h2>
              <p className="text-sm text-gray-400 mb-1">
                <span className="font-semibold text-white">"{campaign.name}"</span>
              </p>
              <p className="text-xs text-gray-500">I dati e i log verranno conservati ma la campagna non sarà più visibile.</p>
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <button onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2.5 bg-[#141517] text-gray-300 rounded-lg text-sm hover:bg-[#18191C] transition-colors font-medium">
                Annulla
              </button>
              <button onClick={() => { setShowDeleteModal(false); deleteCampaign() }} disabled={isDeleting}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-red-600 transition-colors">
                {isDeleting ? 'Eliminazione...' : 'Elimina'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#222428] rounded-2xl border border-[#141517] w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-[#141517]">
              <h2 className="text-lg font-bold text-white">Modifica campagna</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-white transition-colors text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Nome *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-[#141517] border border-[#141517] rounded-lg text-white text-sm focus:ring-2 focus:ring-[#F59E0B] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Tipo canale</label>
                <div className="flex flex-wrap gap-2">
                  {TYPE_OPTIONS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setEditForm((f) => ({ ...f, type: t.key }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${editForm.type === t.key ? 'bg-[#F59E0B] text-[#1e293b]' : 'bg-[#141517] text-gray-400 hover:text-white'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Note</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2.5 bg-[#141517] border border-[#141517] rounded-lg text-white text-sm focus:ring-2 focus:ring-[#F59E0B] focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex gap-2 p-6 border-t border-[#141517]">
              <button onClick={() => setShowEditModal(false)} className="flex-1 px-4 py-2.5 bg-[#141517] text-gray-300 rounded-lg text-sm hover:bg-[#18191C] transition-colors">
                Annulla
              </button>
              <button onClick={saveEdit} disabled={isSavingEdit || !editForm.name.trim()}
                className="flex-1 px-4 py-2.5 bg-[#F59E0B] text-[#1e293b] rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-[#D97706] transition-colors">
                {isSavingEdit ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
