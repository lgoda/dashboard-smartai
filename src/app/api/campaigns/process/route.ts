/**
 * GET /api/campaigns/process
 *
 * Manual / admin trigger for the campaign scheduler.
 * In production, n8n calls Supabase RPCs directly.
 * This endpoint is useful for:
 *   - Testing without n8n
 *   - Emergency manual runs
 *   - Local development
 *
 * Auth: Authorization: Bearer {CRON_SECRET}
 *   or: ?secret={CRON_SECRET}
 *
 * Optional query params:
 *   ?campaign_id=<uuid>   — process only one campaign
 *   ?dry_run=true         — check schedule + count, no actual GHL calls
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GHLAPIClient } from '@/app/lib/ghlApi'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const cronSecret = process.env.CRON_SECRET!

// ─── Schedule helpers ────────────────────────────────────────────────────────

function getNowInTimezone(tz: string) {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now)
  return {
    dayName: (parts.find((p) => p.type === 'weekday')?.value ?? '').toLowerCase(),
    hour: parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10),
    minute: parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10),
  }
}

function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function isWithinSchedule(campaign: any): { ok: boolean; reason?: string } {
  const tz = campaign.timezone ?? 'Europe/Rome'
  const { dayName, hour, minute } = getNowInTimezone(tz)
  const sendDays: string[] = campaign.send_days ?? []

  if (sendDays.length > 0 && !sendDays.includes(dayName)) {
    return { ok: false, reason: `Giorno non valido (${dayName})` }
  }
  const nowMin = hour * 60 + minute
  const fromMin = timeToMin(campaign.send_time_from ?? '09:00')
  const toMin = timeToMin(campaign.send_time_to ?? '18:00')
  if (nowMin < fromMin || nowMin > toMin) {
    return { ok: false, reason: `Fuori fascia (${campaign.send_time_from}-${campaign.send_time_to})` }
  }
  return { ok: true }
}

// ─── Process one campaign ────────────────────────────────────────────────────

async function processCampaign(
  supabase: ReturnType<typeof createClient>,
  campaign: any,
  dryRun: boolean
): Promise<{
  campaign_id: string
  campaign_name: string
  skipped: boolean
  skip_reason?: string
  claimed: number
  sent: number
  excluded: number
  errors: number
  batch_id: string | null
}> {
  // 1. Schedule check
  const schedule = isWithinSchedule(campaign)
  if (!schedule.ok) {
    return { campaign_id: campaign.id, campaign_name: campaign.name, skipped: true, skip_reason: schedule.reason, claimed: 0, sent: 0, excluded: 0, errors: 0, batch_id: null }
  }

  // 2. Daily limit check
  const today = new Date().toISOString().split('T')[0]
  const { count: sentToday } = await supabase
    .from('campaign_contacts')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .eq('status', 'sent_to_crm')
    .gte('sent_at', `${today}T00:00:00Z`)
    .lte('sent_at', `${today}T23:59:59Z`)

  const dailyLimit: number = campaign.daily_limit ?? 100
  const alreadySent = sentToday ?? 0
  if (alreadySent >= dailyLimit) {
    return { campaign_id: campaign.id, campaign_name: campaign.name, skipped: true, skip_reason: `Limite giornaliero raggiunto (${alreadySent}/${dailyLimit})`, claimed: 0, sent: 0, excluded: 0, errors: 0, batch_id: null }
  }

  const batchLimit = Math.min(20, dailyLimit - alreadySent)

  if (dryRun) {
    return { campaign_id: campaign.id, campaign_name: campaign.name, skipped: false, claimed: batchLimit, sent: 0, excluded: 0, errors: 0, batch_id: 'dry_run' }
  }

  // 3. GHL token for this user
  const { data: ghlToken } = await supabase
    .from('ghl_tokens')
    .select('api_token, location_id')
    .eq('user_id', campaign.user_id)
    .eq('is_active', true)
    .maybeSingle()

  if (!ghlToken?.api_token) {
    return { campaign_id: campaign.id, campaign_name: campaign.name, skipped: true, skip_reason: 'Token GHL non configurato', claimed: 0, sent: 0, excluded: 0, errors: 0, batch_id: null }
  }

  // 4. Atomic claim via Postgres RPC (FOR UPDATE SKIP LOCKED)
  const batchId = `manual_${randomUUID().slice(0, 8)}_${Date.now()}`
  const { data: claimed, error: claimError } = await supabase
    .rpc('claim_next_contacts', {
      p_campaign_id: campaign.id,
      p_limit: batchLimit,
      p_batch_id: batchId,
    })

  if (claimError) {
    console.error('[process] claim error:', claimError.message)
    return { campaign_id: campaign.id, campaign_name: campaign.name, skipped: true, skip_reason: `Claim error: ${claimError.message}`, claimed: 0, sent: 0, excluded: 0, errors: 0, batch_id: batchId }
  }

  const contacts = (claimed ?? []) as any[]
  if (contacts.length === 0) {
    // No queued contacts → campaign completed
    await supabase.from('campaigns').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', campaign.id)
    return { campaign_id: campaign.id, campaign_name: campaign.name, skipped: false, claimed: 0, sent: 0, excluded: 0, errors: 0, batch_id: batchId }
  }

  // 5. Create batch log record
  const { data: batchLog } = await supabase
    .from('campaign_batch_logs')
    .insert({
      campaign_id: campaign.id,
      user_id: campaign.user_id,
      batch_id: batchId,
      contacts_claimed: contacts.length,
      status: 'running',
      triggered_by: 'manual',
    })
    .select('id')
    .single()

  // 6. Get excluded tags + existing_contact_policy per import
  const importIds = [...new Set(contacts.map((c: any) => c.import_id).filter(Boolean))]
  const { data: imports } = await supabase
    .from('campaign_imports')
    .select('id, excluded_tags, existing_contact_policy')
    .in('id', importIds)

  const excludedTagsByImport: Record<string, string[]> = {}
  const policyByImport: Record<string, string> = {}
  for (const imp of (imports ?? []) as any[]) {
    excludedTagsByImport[String(imp.id)] = imp.excluded_tags ?? []
    policyByImport[String(imp.id)] = imp.existing_contact_policy ?? 'tag_only'
  }

  // 7. Send contacts to GHL
  const ghlClient = new GHLAPIClient()
  const token = String(ghlToken.api_token)
  const locationId = String(ghlToken.location_id)
  let sent = 0, excluded = 0, errors = 0

  for (const contact of contacts as any[]) {
    try {
      const phone = String(contact.phone_normalized ?? '')
      const workflowId = String(contact.crm_automation_id ?? '')
      const importExcludedTags: string[] = excludedTagsByImport[String(contact.import_id)] ?? []

      if (!workflowId) {
        await supabase.from('campaign_contacts').update({ status: 'error', error_detail: 'crm_automation_id mancante', updated_at: new Date().toISOString() }).eq('id', contact.id)
        errors++
        continue
      }

      const { data: existing } = await ghlClient.searchContactByPhone(token, locationId, phone)
      let contactId: string
      const importPolicy = policyByImport[String(contact.import_id)] ?? 'tag_only'

      if (existing) {
        // Check excluded tags first
        if (importExcludedTags.some((t) => existing.tags.includes(t))) {
          await supabase.from('campaign_contacts').update({
            status: 'excluded',
            exclusion_reason: 'excluded_tag',
            error_detail: `Tag: ${importExcludedTags.filter((t) => existing.tags.includes(t)).join(', ')}`,
            updated_at: new Date().toISOString(),
          }).eq('id', contact.id)
          excluded++
          continue
        }
        // Apply existing_contact_policy
        if (importPolicy === 'exclude') {
          await supabase.from('campaign_contacts').update({
            status: 'excluded',
            exclusion_reason: 'existing_contact',
            error_detail: 'Contatto già presente nel CRM (policy: escludi)',
            crm_contact_id: existing.id,
            updated_at: new Date().toISOString(),
          }).eq('id', contact.id)
          excluded++
          continue
        }
        // tag_only or update: apply list_tag if missing
        const listTag = String(contact.list_tag ?? '')
        if (listTag && !existing.tags.includes(listTag)) {
          const { error: tagErr } = await ghlClient.addTagsToContact(token, locationId, existing.id, [listTag])
          if (tagErr) console.error('[process] addTagsToContact failed:', tagErr.message)
        }
        // update: also push contact fields
        if (importPolicy === 'update') {
          const updateData = {
            firstName: String(contact.first_name || '') || undefined,
            lastName:  String(contact.last_name  || '') || undefined,
            email:     String(contact.email      || '') || undefined,
            companyName: String(contact.company  || '') || undefined,
            address1:  String(contact.address    || '') || undefined,
          }
          if (Object.values(updateData).some(v => v != null)) {
            const { error: updErr } = await ghlClient.updateContact(token, locationId, existing.id, updateData)
            if (updErr) console.error('[process] updateContact failed:', updErr.message)
          }
        }
        contactId = existing.id
      } else {
        const { data: created, error: createErr } = await ghlClient.createContact(token, locationId, {
          name: String(contact.contact_name || '') || undefined,
          firstName: String(contact.first_name || '') || undefined,
          lastName: String(contact.last_name || '') || undefined,
          phone,
          email: String(contact.email || '') || undefined,
          companyName: String(contact.company || '') || undefined,
          address1: String(contact.address || '') || undefined,
          tags: contact.list_tag ? [String(contact.list_tag)] : undefined,
        })
        if (createErr || !created) {
          await supabase.from('campaign_contacts').update({ status: 'error', error_detail: createErr?.message ?? 'Errore creazione GHL', updated_at: new Date().toISOString() }).eq('id', contact.id)
          errors++
          continue
        }
        contactId = created.id
      }

      const { error: wfErr } = await ghlClient.addContactToWorkflow(token, locationId, contactId, workflowId)
      if (wfErr) {
        await supabase.from('campaign_contacts').update({ status: 'error', error_detail: wfErr.message, crm_contact_id: contactId, updated_at: new Date().toISOString() }).eq('id', contact.id)
        errors++
        continue
      }

      await supabase.from('campaign_contacts').update({
        status: 'sent_to_crm',
        crm_contact_id: contactId,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', contact.id)

      sent++
      await new Promise((r) => setTimeout(r, 150)) // GHL rate limit breathing room
    } catch (e) {
      errors++
      await supabase.from('campaign_contacts').update({
        status: 'error',
        error_detail: e instanceof Error ? e.message : 'Errore imprevisto',
        updated_at: new Date().toISOString(),
      }).eq('id', contact.id)
    }
  }

  // 8. Finalise batch log
  const batchStatus = errors === contacts.length ? 'error' : errors > 0 ? 'partial' : 'completed'
  if (batchLog?.id) {
    await supabase.from('campaign_batch_logs').update({
      finished_at: new Date().toISOString(),
      contacts_sent: sent,
      contacts_error: errors,
      contacts_excluded: excluded,
      status: batchStatus,
    }).eq('id', batchLog.id)
  }

  // 9. Update campaign last_processed_at
  await supabase.from('campaigns').update({ last_processed_at: new Date().toISOString() }).eq('id', campaign.id)

  return {
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    skipped: false,
    claimed: contacts.length,
    sent,
    excluded,
    errors,
    batch_id: batchId,
  }
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Auth
  const authHeader = request.headers.get('authorization')
  const querySecret = new URL(request.url).searchParams.get('secret')
  const providedSecret = authHeader?.replace('Bearer ', '') ?? querySecret

  if (!cronSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: 'Non autorizzato. Passa Authorization: Bearer {CRON_SECRET} o ?secret=.' }, { status: 401 })
  }

  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY non configurata in .env.local' }, { status: 500 })
  }

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dry_run') === 'true'
  const singleCampaignId = url.searchParams.get('campaign_id')

  // Release stale processing contacts first (stuck > 30 min)
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data: released } = await supabase.rpc('release_stale_contacts', { p_timeout_minutes: 30 })
  if (released && released > 0) {
    console.log(`[process] Released ${released} stale contacts back to queued`)
  }

  // Fetch active campaigns with queued contacts
  let query = supabase
    .from('campaigns_ready_to_process')
    .select('*')

  if (singleCampaignId) {
    query = query.eq('id', singleCampaignId) as any
  }

  const { data: campaigns, error: campErr } = await query

  if (campErr) {
    return NextResponse.json({ error: campErr.message }, { status: 500 })
  }

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({
      processed_at: new Date().toISOString(),
      dry_run: dryRun,
      stale_released: released ?? 0,
      message: 'Nessuna campagna attiva con contatti in coda',
      results: [],
    })
  }

  const results = []
  for (const campaign of campaigns) {
    const result = await processCampaign(supabase as any, campaign, dryRun)
    results.push(result)
  }

  const totals = results.reduce(
    (acc, r) => ({ claimed: acc.claimed + r.claimed, sent: acc.sent + r.sent, excluded: acc.excluded + r.excluded, errors: acc.errors + r.errors, skipped: acc.skipped + (r.skipped ? 1 : 0) }),
    { claimed: 0, sent: 0, excluded: 0, errors: 0, skipped: 0 }
  )

  console.log(`[process] ${new Date().toISOString()} dry_run=${dryRun} | campaigns=${campaigns.length} claimed=${totals.claimed} sent=${totals.sent} excl=${totals.excluded} err=${totals.errors} skip=${totals.skipped}`)

  return NextResponse.json({
    processed_at: new Date().toISOString(),
    dry_run: dryRun,
    stale_released: released ?? 0,
    campaigns_found: campaigns.length,
    ...totals,
    results,
  })
}
