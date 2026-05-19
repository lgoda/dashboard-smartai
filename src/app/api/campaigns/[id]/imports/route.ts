import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseCSV, parseExcel, processContacts } from '@/app/lib/contactParser'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const CONSENT_TEXT = 'Dichiaro sotto la mia responsabilità che i contatti caricati sono stati raccolti lecitamente e che dispongo di una base giuridica valida per l\'invio di comunicazioni promozionali, informative o commerciali relative a questa campagna. Dichiaro inoltre che eventuali richieste di cancellazione, opposizione o revoca del consenso sono state gestite correttamente.'

const BATCH_SIZE = 500

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

    const { id: campaignId } = await params

    // Verify campaign ownership
    const { data: campaign, error: campError } = await supabase
      .from('campaigns')
      .select('id, name, type')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single()

    if (campError || !campaign) return NextResponse.json({ error: 'Campagna non trovata' }, { status: 404 })

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const crm_automation_id = formData.get('crm_automation_id') as string
    const crm_automation_name = formData.get('crm_automation_name') as string
    const list_tag = formData.get('list_tag') as string
    const excluded_tags_raw = formData.get('excluded_tags') as string
    const existing_contact_policy = (formData.get('existing_contact_policy') as string) || 'tag_only'
    const consent_accepted = formData.get('consent_accepted') === 'true'

    if (!file) return NextResponse.json({ error: 'Nessun file caricato' }, { status: 400 })
    if (!crm_automation_id) return NextResponse.json({ error: 'Seleziona un\'automazione CRM' }, { status: 400 })
    if (!list_tag?.trim()) return NextResponse.json({ error: 'Inserisci un nome per la lista' }, { status: 400 })
    if (!consent_accepted) return NextResponse.json({ error: 'Devi accettare la dichiarazione di responsabilità' }, { status: 400 })

    const excluded_tags: string[] = excluded_tags_raw
      ? JSON.parse(excluded_tags_raw)
      : []

    // Parse file
    const fileName = file.name.toLowerCase()
    let rows: Record<string, string>[] = []
    let headers: string[] = []

    if (fileName.endsWith('.csv')) {
      const text = await file.text()
      const parsed = parseCSV(text)
      rows = parsed.rows
      headers = parsed.headers
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const buffer = await file.arrayBuffer()
      const parsed = parseExcel(buffer)
      rows = parsed.rows
      headers = parsed.headers
    } else {
      return NextResponse.json({ error: 'Formato file non supportato. Usa CSV o Excel (.xlsx)' }, { status: 400 })
    }

    if (rows.length === 0) return NextResponse.json({ error: 'Il file è vuoto' }, { status: 400 })

    // Use user-provided column mapping if supplied, otherwise auto-detect
    const column_map_raw = formData.get('column_map') as string | null
    const columnMapOverride = column_map_raw ? JSON.parse(column_map_raw) as Record<string, string> : undefined

    // Process contacts
    const result = processContacts(rows, headers, columnMapOverride)

    // Create import record
    const { data: importRecord, error: importError } = await supabase
      .from('campaign_imports')
      .insert({
        user_id: user.id,
        campaign_id: campaignId,
        crm_automation_id,
        crm_automation_name,
        list_tag: list_tag.trim(),
        excluded_tags,
        existing_contact_policy,
        consent_accepted: true,
        consent_text: CONSENT_TEXT,
        consent_accepted_at: new Date().toISOString(),
        file_name: file.name,
        total_rows: result.total_rows,
        valid_contacts: result.valid_contacts,
        excluded_no_phone: result.excluded_no_phone,
        excluded_duplicates: result.excluded_duplicates,
        queued_contacts: result.queued_contacts,
        status: 'queued',
      })
      .select()
      .single()

    if (importError) return NextResponse.json({ error: importError.message }, { status: 500 })

    // Bulk insert contacts in batches to avoid payload limits
    const contactRows = result.contacts.map((c) => ({
      user_id: user.id,
      campaign_id: campaignId,
      import_id: importRecord.id,
      first_name: c.first_name || null,
      last_name: c.last_name || null,
      phone_normalized: c.phone_normalized,
      email: c.email || null,
      company: c.company || null,
      raw_data: c.raw_data,
      list_tag: list_tag.trim(),
      crm_automation_id,
      status: c.exclusion_reason ? 'excluded' : 'queued',
      exclusion_reason: c.exclusion_reason,
    }))

    for (let i = 0; i < contactRows.length; i += BATCH_SIZE) {
      const batch = contactRows.slice(i, i + BATCH_SIZE)
      const { error: insertError } = await supabase.from('campaign_contacts').insert(batch)
      if (insertError) {
        console.error('[campaigns/imports] batch insert error:', insertError.message)
      }
    }

    // Log
    await supabase.from('campaign_logs').insert([
      {
        user_id: user.id, campaign_id: campaignId, import_id: importRecord.id,
        action: 'import_completed',
        detail: `File "${file.name}" importato. Totale: ${result.total_rows}, validi: ${result.valid_contacts}, in coda: ${result.queued_contacts}`,
        metadata: {
          file_name: file.name, list_tag, crm_automation_name, excluded_tags,
          existing_contact_policy, consent_text: CONSENT_TEXT,
        },
      },
      {
        user_id: user.id, campaign_id: campaignId, import_id: importRecord.id,
        action: 'consent_accepted',
        detail: 'Dichiarazione di responsabilità accettata',
        metadata: { consent_version: '1.0', consent_text: CONSENT_TEXT },
      },
    ])

    return NextResponse.json({ import: importRecord, stats: result }, { status: 201 })
  } catch (err) {
    console.error('[campaigns/imports] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Errore interno' }, { status: 500 })
  }
}
