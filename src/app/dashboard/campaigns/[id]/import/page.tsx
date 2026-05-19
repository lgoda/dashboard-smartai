'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/app/components/AuthProvider'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const CONSENT_TEXT = "Dichiaro sotto la mia responsabilità che i contatti caricati sono stati raccolti lecitamente e che dispongo di una base giuridica valida per l'invio di comunicazioni promozionali, informative o commerciali relative a questa campagna. Dichiaro inoltre che eventuali richieste di cancellazione, opposizione o revoca del consenso sono state gestite correttamente."

const STEPS = ['Campagna', 'File', 'Colonne', 'Filtri', 'Riepilogo', 'Consenso', 'Completato']

const FIELD_CONFIG: { key: string; label: string; required: boolean; hint: string }[] = [
  { key: 'phone',        label: 'Telefono / Cellulare', required: true,  hint: 'Obbligatorio — solo numeri mobile vengono accettati' },
  { key: 'first_name',   label: 'Nome',                 required: false, hint: 'Opzionale' },
  { key: 'last_name',    label: 'Cognome',               required: false, hint: 'Opzionale' },
  { key: 'contact_name', label: 'Nome completo',         required: false, hint: 'Alternativa a Nome + Cognome — viene diviso automaticamente' },
  { key: 'email',        label: 'Email',                 required: false, hint: 'Opzionale' },
  { key: 'company',      label: 'Azienda',               required: false, hint: 'Opzionale' },
  { key: 'address',      label: 'Indirizzo',             required: false, hint: 'Opzionale' },
]

const FIELD_ALIASES: Record<string, string[]> = {
  phone:        ['telefono', 'tel', 'tel.', 'phone', 'phone number', 'cellulare', 'mobile', 'cell', 'numero', 'number', 'whatsapp'],
  first_name:   ['nome', 'first_name', 'firstname', 'first name', 'given name'],
  last_name:    ['cognome', 'last_name', 'lastname', 'last name', 'surname'],
  contact_name: ['nominativo', 'contatto', 'contact name', 'fullname', 'full name', 'nome completo'],
  email:        ['email', 'e-mail', 'mail', 'posta elettronica'],
  company:      ['azienda', 'company', 'società', 'societa', 'ragione sociale', 'business'],
  address:      ['indirizzo', 'via', 'street', 'address', 'sede', 'domicilio'],
}

function autoDetect(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const header of headers) {
    const h = header.toLowerCase().trim()
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (!map[field] && aliases.some(a => h.includes(a))) {
        map[field] = header
      }
    }
  }
  return map
}

async function readFileHeaders(file: File): Promise<string[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) {
    const text = await file.text()
    const firstLine = text.split(/\r?\n/)[0]
    // Parse CSV first line handling quoted fields
    const headers: string[] = []
    let field = '', inQuotes = false
    for (const ch of firstLine + ',') {
      if (ch === '"') { inQuotes = !inQuotes }
      else if (ch === ',' && !inQuotes) { headers.push(field.replace(/^"|"$/g, '').trim()); field = '' }
      else { field += ch }
    }
    return headers.filter(Boolean)
  } else {
    const { read, utils } = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const wb = read(buffer)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = utils.sheet_to_json<string[]>(ws, { header: 1 })
    return ((rows[0] as unknown[]) || []).map(String).filter(Boolean)
  }
}

type Campaign = {
  id: string; name: string; type: string; status: string
  send_time_from: string; send_time_to: string; daily_limit: number; send_days: string[]
}
type Workflow = { id: string; name: string; status: string }

export default function ImportWizardPage() {
  const router = useRouter()
  const { accessToken } = useAuth()
  const params = useParams()
  const campaignId = params.id as string

  const [step, setStep] = useState(0)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Step 0
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)
  const [showAllWorkflows, setShowAllWorkflows] = useState(false)

  // Step 1 — file
  const [file, setFile] = useState<File | null>(null)
  const [listTag, setListTag] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 2 — column mapping
  const [fileHeaders, setFileHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [loadingHeaders, setLoadingHeaders] = useState(false)

  // Step 3 — filters
  const [excludedTags, setExcludedTags] = useState<string[]>([])
  const [tagSearch, setTagSearch] = useState('')
  const [existingPolicy, setExistingPolicy] = useState<'update' | 'tag_only' | 'exclude'>('tag_only')

  // Step 5 — consent
  const [consentAccepted, setConsentAccepted] = useState(false)

  // Step 6 — result
  const [importResult, setImportResult] = useState<any>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const load = async () => {
      const token = accessToken
      if (!token) { router.push('/'); return }
      const [campRes, wfRes, tagsRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/ghl/workflows', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/ghl/tags', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (!campRes.ok) { router.push('/dashboard/campaigns'); return }
      const campJson = await campRes.json()
      setCampaign(campJson.campaign)
      const wfJson = await wfRes.json()
      if (!wfRes.ok || wfJson.error) setError(`Errore caricamento automazioni GHL: ${wfJson.error ?? wfRes.status}`)
      if (wfJson.workflows) {
        setWorkflows(wfJson.workflows ?? [])
        const prefix = campJson.campaign.type === 'whatsapp' ? 'whatsapp_' : ''
        const match = (wfJson.workflows ?? []).find((w: Workflow) => prefix && w.name.toLowerCase().startsWith(prefix))
        if (match) setSelectedWorkflow(match)
      }
      if (tagsRes.ok) { const tagsJson = await tagsRes.json(); setTags(tagsJson.tags ?? []) }
      setIsLoading(false)
    }
    load()
  }, [campaignId, accessToken, router])

  useEffect(() => {
    if (campaign && !listTag) {
      const slug = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      const d = new Date()
      const month = d.toLocaleString('it-IT', { month: 'long' }).toLowerCase()
      setListTag(`lista_${slug}_${month}_${d.getFullYear()}`)
    }
  }, [campaign, listTag])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setFileHeaders([])
    setColumnMapping({})
    setLoadingHeaders(true)
    try {
      const headers = await readFileHeaders(f)
      setFileHeaders(headers)
      // Pre-populate with auto-detected mapping
      const detected = autoDetect(headers)
      setColumnMapping(detected)
    } catch {
      setError('Impossibile leggere le intestazioni del file.')
    } finally {
      setLoadingHeaders(false)
    }
  }

  const handleSubmit = async () => {
    if (!file || !selectedWorkflow || !listTag.trim() || !consentAccepted) return
    setIsSubmitting(true)
    setError(null)
    try {
      const token = accessToken
      const fd = new FormData()
      fd.append('file', file)
      fd.append('crm_automation_id', selectedWorkflow.id)
      fd.append('crm_automation_name', selectedWorkflow.name)
      fd.append('list_tag', listTag.trim())
      fd.append('excluded_tags', JSON.stringify(excludedTags))
      fd.append('existing_contact_policy', existingPolicy)
      fd.append('consent_accepted', 'true')
      // Send only non-empty mappings
      const cleanMap = Object.fromEntries(
        Object.entries(columnMapping).filter(([, v]) => v && v !== '')
      )
      fd.append('column_map', JSON.stringify(cleanMap))

      const res = await fetch(`/api/campaigns/${campaignId}/imports`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token!}` },
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? "Errore durante l'import"); return }
      setImportResult(json)
      setStep(6)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore imprevisto')
    } finally {
      setIsSubmitting(false)
    }
  }

  const conventionPrefix = campaign?.type === 'whatsapp' ? 'whatsapp_' : ''
  const suggestedWorkflows = conventionPrefix ? workflows.filter(w => w.name.toLowerCase().startsWith(conventionPrefix)) : workflows
  const otherWorkflows = conventionPrefix ? workflows.filter(w => !w.name.toLowerCase().startsWith(conventionPrefix)) : []
  const displayedWorkflows = showAllWorkflows ? workflows : (suggestedWorkflows.length > 0 ? suggestedWorkflows : workflows)
  const filteredTags = tagSearch ? tags.filter(t => t.toLowerCase().includes(tagSearch.toLowerCase())) : tags
  const phoneIsMapped = !!columnMapping.phone

  if (isLoading) return (
    <div className="space-y-6">
      <div className="h-8 bg-[#222428] rounded w-64 loading" />
      <div className="h-64 bg-[#222428] rounded-xl loading" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/dashboard/campaigns" className="hover:text-[#F59E0B]">Campagne</Link>
        <span>/</span>
        <Link href={`/dashboard/campaigns/${campaignId}`} className="hover:text-[#F59E0B]">{campaign?.name}</Link>
        <span>/</span>
        <span className="text-white">Nuovo import</span>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
              i < step ? 'bg-[#22C55E] text-white' : i === step ? 'bg-[#F59E0B] text-[#1e293b]' : 'bg-[#141517] text-gray-500'
            }`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-xs hidden sm:inline ${i === step ? 'text-[#F59E0B] font-medium' : 'text-gray-500'}`}>{s}</span>
            {i < STEPS.length - 1 && <span className="text-gray-600 mx-1">›</span>}
          </div>
        ))}
      </div>

      {error && <div className="p-4 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm">{error}</div>}

      {/* ── STEP 0: Campagna + automazione ── */}
      {step === 0 && campaign && (
        <div className="bg-[#222428] rounded-xl border border-[#141517] p-6 space-y-5">
          <h2 className="text-lg font-semibold text-white">Campagna e automazione CRM</h2>
          <div className="bg-[#141517] rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">{campaign.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${campaign.status === 'active' ? 'bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'}`}>
                {campaign.status === 'active' ? 'Attiva' : 'In pausa'}
              </span>
            </div>
            <p className="text-xs text-gray-400">Tipo: {campaign.type} · {campaign.send_time_from}-{campaign.send_time_to} · {campaign.daily_limit}/giorno</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Seleziona automazione CRM *</label>
            {workflows.length === 0 ? (
              <p className="text-sm text-red-400">Nessuna automazione trovata nel CRM. Verifica la connessione GHL.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {displayedWorkflows.map(w => {
                  const isConvention = conventionPrefix && w.name.toLowerCase().startsWith(conventionPrefix)
                  const isSelected = selectedWorkflow?.id === w.id
                  return (
                    <button key={w.id} onClick={() => setSelectedWorkflow(w)}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${isSelected ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-white' : 'border-[#141517] bg-[#141517] text-gray-300 hover:border-[#F59E0B]/40'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{w.name}</span>
                        <div className="flex items-center gap-1">
                          {isConvention && <span className="text-xs bg-[#25D366]/20 text-[#25D366] px-1.5 py-0.5 rounded">suggerito</span>}
                          {isSelected && <span className="text-[#F59E0B]">✓</span>}
                        </div>
                      </div>
                    </button>
                  )
                })}
                {!showAllWorkflows && otherWorkflows.length > 0 && (
                  <button onClick={() => setShowAllWorkflows(true)} className="w-full text-center text-sm text-gray-400 hover:text-[#F59E0B] py-2 transition-colors">
                    Mostra tutte le automazioni ({otherWorkflows.length} altri)
                  </button>
                )}
              </div>
            )}
            {selectedWorkflow && conventionPrefix && !selectedWorkflow.name.toLowerCase().startsWith(conventionPrefix) && (
              <p className="mt-2 text-xs text-yellow-400">⚠️ Questa automazione non segue la convenzione <code>{conventionPrefix}</code>.</p>
            )}
          </div>
          <div className="flex justify-end">
            <button onClick={() => setStep(1)} disabled={!selectedWorkflow}
              className="px-6 py-2.5 bg-[#F59E0B] text-[#1e293b] rounded-lg font-semibold disabled:opacity-40 hover:bg-[#D97706] transition-colors">
              Continua →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 1: File + tag lista ── */}
      {step === 1 && (
        <div className="bg-[#222428] rounded-xl border border-[#141517] p-6 space-y-5">
          <h2 className="text-lg font-semibold text-white">Carica file e nomina la lista</h2>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">File contatti (CSV o Excel) *</label>
            <div onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${file ? 'border-[#22C55E]/50 bg-[#22C55E]/5' : 'border-[#141517] hover:border-[#F59E0B]/40'}`}>
              {file ? (
                <>
                  <p className="text-[#22C55E] font-semibold">✓ {file.name}</p>
                  <p className="text-sm text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  {loadingHeaders && <p className="text-xs text-gray-400 mt-2 animate-pulse">Lettura intestazioni...</p>}
                  {!loadingHeaders && fileHeaders.length > 0 && (
                    <p className="text-xs text-[#22C55E] mt-2">{fileHeaders.length} colonne rilevate</p>
                  )}
                  <button onClick={e => { e.stopPropagation(); setFile(null); setFileHeaders([]); setColumnMapping({}) }}
                    className="mt-2 text-xs text-red-400 hover:text-red-300">Rimuovi</button>
                </>
              ) : (
                <>
                  <p className="text-gray-400 text-lg mb-1">📁</p>
                  <p className="text-white font-medium">Clicca per selezionare il file</p>
                  <p className="text-sm text-gray-400 mt-1">Supportati: CSV, XLSX, XLS</p>
                </>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} className="hidden" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Nome lista (tag) *</label>
            <input type="text" value={listTag} onChange={e => setListTag(e.target.value)}
              placeholder="es. lista_sumup_maggio_2026"
              className="w-full px-4 py-2 bg-[#141517] border border-[#141517] rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-[#F59E0B] focus:border-[#F59E0B]" />
            <p className="text-xs text-gray-500 mt-1">Questo tag verrà assegnato a tutti i contatti di questa lista.</p>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(0)} className="px-4 py-2 bg-[#141517] text-gray-300 rounded-lg text-sm hover:bg-[#18191C] transition-colors">← Indietro</button>
            <button onClick={() => setStep(2)} disabled={!file || !listTag.trim() || loadingHeaders}
              className="px-6 py-2.5 bg-[#F59E0B] text-[#1e293b] rounded-lg font-semibold disabled:opacity-40 hover:bg-[#D97706] transition-colors">
              Continua →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Mappatura colonne ── */}
      {step === 2 && (
        <div className="bg-[#222428] rounded-xl border border-[#141517] p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Mappa le colonne del file</h2>
            <p className="text-sm text-gray-400 mt-1">
              Abbina le colonne del tuo file <span className="text-white">{file?.name}</span> ai campi del sistema.
              Le colonne rilevate automaticamente sono già pre-selezionate.
            </p>
          </div>

          <div className="space-y-3">
            {FIELD_CONFIG.map(field => {
              const currentValue = columnMapping[field.key] ?? ''
              const autoValue = autoDetect(fileHeaders)[field.key]
              return (
                <div key={field.key} className="grid grid-cols-2 gap-3 items-center">
                  {/* Campo sistema */}
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${field.required ? 'text-white' : 'text-gray-300'}`}>
                      {field.label}
                      {field.required && <span className="text-red-400 ml-1">*</span>}
                    </span>
                    {autoValue && autoValue === currentValue && (
                      <span className="text-xs text-[#22C55E] bg-[#22C55E]/10 px-1.5 py-0.5 rounded">auto</span>
                    )}
                  </div>
                  {/* Select colonna file */}
                  <select
                    value={currentValue}
                    onChange={e => setColumnMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className={`px-3 py-2 bg-[#141517] border rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#F59E0B] ${
                      field.required && !currentValue
                        ? 'border-red-500/50 text-red-400'
                        : currentValue
                        ? 'border-[#22C55E]/40 text-white'
                        : 'border-[#141517] text-gray-500'
                    }`}
                  >
                    <option value="">— Non mappato{field.required ? ' (obbligatorio)' : ''} —</option>
                    {fileHeaders.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>

          {/* Anteprima colonne non mappate */}
          {fileHeaders.length > 0 && (() => {
            const mapped = new Set(Object.values(columnMapping).filter(Boolean))
            const unmapped = fileHeaders.filter(h => !mapped.has(h))
            if (unmapped.length === 0) return null
            return (
              <div className="p-3 bg-[#141517] rounded-lg">
                <p className="text-xs text-gray-400 mb-1">Colonne non mappate (verranno salvate nei dati grezzi):</p>
                <div className="flex flex-wrap gap-1">
                  {unmapped.map(h => (
                    <span key={h} className="text-xs px-2 py-0.5 bg-[#222428] text-gray-400 rounded border border-[#222428]">{h}</span>
                  ))}
                </div>
              </div>
            )
          })()}

          {!phoneIsMapped && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              Devi mappare almeno la colonna <strong>Telefono</strong> per procedere.
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-4 py-2 bg-[#141517] text-gray-300 rounded-lg text-sm hover:bg-[#18191C] transition-colors">← Indietro</button>
            <button onClick={() => setStep(3)} disabled={!phoneIsMapped}
              className="px-6 py-2.5 bg-[#F59E0B] text-[#1e293b] rounded-lg font-semibold disabled:opacity-40 hover:bg-[#D97706] transition-colors">
              Continua →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Filtri e policy ── */}
      {step === 3 && (
        <div className="bg-[#222428] rounded-xl border border-[#141517] p-6 space-y-5">
          <h2 className="text-lg font-semibold text-white">Filtri e policy</h2>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Tag CRM da escludere
              <span className="text-gray-500 font-normal ml-1">(i contatti con questi tag NON verranno inviati)</span>
            </label>
            {tags.length > 0 ? (
              <>
                <input type="text" value={tagSearch} onChange={e => setTagSearch(e.target.value)} placeholder="Cerca tag..."
                  className="w-full px-3 py-2 mb-2 bg-[#141517] border border-[#141517] rounded-lg text-white text-sm placeholder-gray-500 focus:ring-2 focus:ring-[#F59E0B]" />
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                  {filteredTags.map(tag => (
                    <button key={tag}
                      onClick={() => setExcludedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${excludedTags.includes(tag) ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-[#141517] text-gray-300 border-[#141517] hover:border-red-500/30'}`}>
                      {excludedTags.includes(tag) ? '✕ ' : ''}{tag}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div>
                <p className="text-sm text-gray-400 mb-2">Nessun tag trovato. Puoi inserirli manualmente:</p>
                <input type="text" value={tagSearch} onChange={e => setTagSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && tagSearch.trim()) { setExcludedTags(p => [...p, tagSearch.trim()]); setTagSearch('') } }}
                  placeholder="Digita un tag e premi Invio"
                  className="w-full px-3 py-2 bg-[#141517] border border-[#141517] rounded-lg text-white text-sm focus:ring-2 focus:ring-[#F59E0B]" />
                {excludedTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {excludedTags.map(t => (
                      <span key={t} className="px-3 py-1 rounded-full text-xs bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                        {t}<button onClick={() => setExcludedTags(p => p.filter(x => x !== t))}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {excludedTags.length > 0 && <p className="mt-2 text-xs text-red-400">{excludedTags.length} tag da escludere: {excludedTags.join(', ')}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Contatti già presenti nel CRM</label>
            <div className="space-y-2">
              {([
                { value: 'tag_only', label: 'Non aggiornare, aggiungi solo il tag lista', desc: 'Consigliato: evita sovrascritture indesiderate' },
                { value: 'update',   label: 'Aggiorna i dati del contatto',               desc: 'I dati del contatto nel CRM verranno aggiornati con quelli del file' },
                { value: 'exclude',  label: 'Escludi dalla campagna',                      desc: 'I contatti già presenti nel CRM non verranno inviati al workflow' },
              ] as const).map(opt => (
                <button key={opt.value} onClick={() => setExistingPolicy(opt.value)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${existingPolicy === opt.value ? 'border-[#F59E0B] bg-[#F59E0B]/10' : 'border-[#141517] bg-[#141517] hover:border-[#F59E0B]/30'}`}>
                  <p className={`text-sm font-medium ${existingPolicy === opt.value ? 'text-[#F59E0B]' : 'text-white'}`}>{opt.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="px-4 py-2 bg-[#141517] text-gray-300 rounded-lg text-sm hover:bg-[#18191C] transition-colors">← Indietro</button>
            <button onClick={() => setStep(4)} className="px-6 py-2.5 bg-[#F59E0B] text-[#1e293b] rounded-lg font-semibold hover:bg-[#D97706] transition-colors">Continua →</button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Riepilogo ── */}
      {step === 4 && (
        <div className="bg-[#222428] rounded-xl border border-[#141517] p-6 space-y-5">
          <h2 className="text-lg font-semibold text-white">Riepilogo import</h2>
          <div className="bg-[#141517] rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Campagna</span><span className="text-white font-medium">{campaign?.name}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Automazione CRM</span><span className="text-white font-medium">{selectedWorkflow?.name}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">File</span><span className="text-white">{file?.name}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Tag lista</span><span className="text-[#F59E0B] font-medium">{listTag}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Telefono mappato a</span><span className="text-[#22C55E]">{columnMapping.phone}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Tag esclusi</span><span className="text-white">{excludedTags.length > 0 ? excludedTags.join(', ') : 'Nessuno'}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Contatti esistenti</span><span className="text-white">{existingPolicy === 'tag_only' ? 'Solo tag' : existingPolicy === 'update' ? 'Aggiorna' : 'Escludi'}</span></div>
          </div>
          <p className="text-sm text-gray-400">
            Il file verrà analizzato, i numeri di cellulare validati e i contatti validi messi in coda per <strong className="text-white">{campaign?.name}</strong>.
          </p>
          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="px-4 py-2 bg-[#141517] text-gray-300 rounded-lg text-sm hover:bg-[#18191C] transition-colors">← Indietro</button>
            <button onClick={() => setStep(5)} className="px-6 py-2.5 bg-[#F59E0B] text-[#1e293b] rounded-lg font-semibold hover:bg-[#D97706] transition-colors">Continua →</button>
          </div>
        </div>
      )}

      {/* ── STEP 5: Consenso ── */}
      {step === 5 && (
        <div className="bg-[#222428] rounded-xl border border-[#141517] p-6 space-y-5">
          <h2 className="text-lg font-semibold text-white">Dichiarazione di responsabilità</h2>
          <div className="bg-[#141517] rounded-lg p-4 text-sm text-gray-300 leading-relaxed border border-[#222428]">{CONSENT_TEXT}</div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={consentAccepted} onChange={e => setConsentAccepted(e.target.checked)}
              className="mt-1 w-4 h-4 rounded accent-[#F59E0B] flex-shrink-0" />
            <span className="text-sm text-white">Confermo e accetto la dichiarazione sopra riportata</span>
          </label>
          <div className="flex justify-between">
            <button onClick={() => setStep(4)} className="px-4 py-2 bg-[#141517] text-gray-300 rounded-lg text-sm hover:bg-[#18191C] transition-colors">← Indietro</button>
            <button onClick={handleSubmit} disabled={!consentAccepted || isSubmitting}
              className="px-6 py-2.5 bg-[#F59E0B] text-[#1e293b] rounded-lg font-semibold disabled:opacity-40 hover:bg-[#D97706] transition-colors">
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#1e293b]/30 border-t-[#1e293b] rounded-full animate-spin" />
                  Elaborazione...
                </span>
              ) : 'Conferma import'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 6: Completato ── */}
      {step === 6 && importResult && (
        <div className="bg-[#222428] rounded-xl border border-[#141517] p-6 space-y-5">
          <div className="text-center">
            <div className="w-16 h-16 bg-[#22C55E]/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✓</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Import completato</h2>
            <p className="text-gray-400 text-sm">I contatti validi sono stati messi in coda</p>
          </div>
          <div className="bg-[#141517] rounded-lg p-5 space-y-2 text-sm">
            <div className="flex justify-between pb-2 border-b border-[#222428]">
              <span className="text-gray-400">Campagna</span><span className="text-white font-medium">{campaign?.name}</span>
            </div>
            <div className="flex justify-between"><span className="text-gray-400">Automazione CRM</span><span className="text-white">{selectedWorkflow?.name}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Tag lista</span><span className="text-[#F59E0B] font-medium">{listTag}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Totale righe',     value: importResult.stats?.total_rows ?? 0,         color: 'text-white' },
              { label: 'Cellulari validi', value: importResult.stats?.valid_contacts ?? 0,      color: 'text-[#22C55E]' },
              { label: 'Senza cellulare',  value: importResult.stats?.excluded_no_phone ?? 0,   color: 'text-red-400' },
              { label: 'Duplicati',        value: importResult.stats?.excluded_duplicates ?? 0, color: 'text-yellow-400' },
              { label: 'In coda',          value: importResult.stats?.queued_contacts ?? 0,     color: 'text-[#F59E0B]' },
            ].map(s => (
              <div key={s.label} className="bg-[#141517] rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString('it-IT')}</p>
              </div>
            ))}
          </div>
          {existingPolicy === 'exclude' && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-400">
              ℹ️ Hai selezionato <strong>Escludi contatti già presenti nel CRM</strong>. Il controllo avviene durante l'elaborazione.
            </div>
          )}
          <Link href={`/dashboard/campaigns/${campaignId}`}
            className="block w-full text-center px-6 py-3 bg-[#F59E0B] text-[#1e293b] rounded-xl font-semibold hover:bg-[#D97706] transition-colors">
            Vai alla campagna
          </Link>
        </div>
      )}
    </div>
  )
}
