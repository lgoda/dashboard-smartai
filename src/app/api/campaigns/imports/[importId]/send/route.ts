import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ghlAPIClient } from '@/app/lib/ghlApi'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const BATCH_SIZE = 10

// Helper: get current time in a timezone
function getNowInTimezone(tz: string): { dayName: string; hour: number; minute: number } {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now)

  const weekday = parts.find((p) => p.type === 'weekday')?.value?.toLowerCase() ?? ''
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
  return { dayName: weekday, hour, minute }
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ importId: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

    const { importId } = await params

    // Load import + campaign
    const { data: importRecord, error: importErr } = await supabase
      .from('campaign_imports')
      .select('*, campaigns(*)')
      .eq('id', importId)
      .eq('user_id', user.id)
      .single()

    if (importErr || !importRecord) return NextResponse.json({ error: 'Import non trovato' }, { status: 404 })

    const campaign = importRecord.campaigns as any

    // ── Stop conditions ────────────────────────────────────────────────────────

    if (campaign.status === 'paused') {
      return NextResponse.json({ paused: true, message: 'Campagna in pausa' })
    }

    const { dayName, hour, minute } = getNowInTimezone(campaign.timezone ?? 'Europe/Rome')
    const sendDays: string[] = campaign.send_days ?? []
    if (sendDays.length > 0 && !sendDays.includes(dayName)) {
      return NextResponse.json({
        outside_schedule: true,
        message: `Oggi (${dayName}) non è un giorno di invio`,
      })
    }

    const nowMinutes = hour * 60 + minute
    const fromMinutes = timeToMinutes(campaign.send_time_from ?? '09:00')
    const toMinutes = timeToMinutes(campaign.send_time_to ?? '18:00')
    if (nowMinutes < fromMinutes || nowMinutes > toMinutes) {
      return NextResponse.json({
        outside_schedule: true,
        message: `Fuori dalla fascia oraria (${campaign.send_time_from} - ${campaign.send_time_to})`,
      })
    }

    // Daily limit check
    const today = new Date().toISOString().split('T')[0]
    const { count: sentToday } = await supabase
      .from('campaign_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id)
      .eq('user_id', user.id)
      .gte('sent_at', `${today}T00:00:00Z`)
      .lt('sent_at', `${today}T23:59:59Z`)
      .eq('status', 'sent_to_crm')

    const dailyLimit: number = campaign.daily_limit ?? 100
    if ((sentToday ?? 0) >= dailyLimit) {
      return NextResponse.json({
        daily_limit_reached: true,
        sent_today: sentToday,
        daily_limit: dailyLimit,
        message: `Limite giornaliero raggiunto (${sentToday}/${dailyLimit})`,
      })
    }

    const remainingToday = dailyLimit - (sentToday ?? 0)
    const batchSize = Math.min(BATCH_SIZE, remainingToday)

    // ── Get next batch of queued contacts ──────────────────────────────────────
    const { data: contacts, error: contactsErr } = await supabase
      .from('campaign_contacts')
      .select('id, first_name, last_name, phone_normalized, email, company, list_tag, crm_automation_id')
      .eq('import_id', importId)
      .eq('user_id', user.id)
      .eq('status', 'queued')
      .limit(batchSize)

    if (contactsErr) return NextResponse.json({ error: contactsErr.message }, { status: 500 })
    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ remaining: 0, message: 'Tutti i contatti sono stati processati' })
    }

    // GHL token
    const { token: ghlToken, locationId, error: tokenErr } = await ghlAPIClient.getActiveToken(user.id, supabase)
    if (tokenErr || !ghlToken || !locationId) {
      return NextResponse.json({ error: 'Token GHL non configurato' }, { status: 403 })
    }

    const excludedTags: string[] = importRecord.excluded_tags ?? []
    const workflowId = importRecord.crm_automation_id

    // ── Process each contact ──────────────────────────────────────────────────
    let sent = 0, excluded = 0, errors = 0
    const logEntries: object[] = []

    for (const contact of contacts) {
      try {
        const phone = contact.phone_normalized ?? ''

        // Search GHL by phone
        const { data: existing } = await ghlAPIClient.searchContactByPhone(ghlToken, locationId, phone)

        let contactId: string

        if (existing) {
          // Check excluded tags
          const hasExcludedTag = excludedTags.some((t) => existing.tags.includes(t))
          if (hasExcludedTag) {
            await supabase.from('campaign_contacts').update({
              status: 'excluded',
              exclusion_reason: 'excluded_tag',
              error_detail: `Tag escluso: ${excludedTags.filter((t) => existing.tags.includes(t)).join(', ')}`,
            }).eq('id', contact.id)
            excluded++
            logEntries.push({
              user_id: user.id, campaign_id: campaign.id, import_id: importId,
              action: 'contact_excluded',
              detail: `${phone} escluso per tag: ${excludedTags.filter((t) => existing.tags.includes(t)).join(', ')}`,
            })
            continue
          }
          contactId = existing.id
        } else {
          // Create new contact in GHL
          const { data: created, error: createErr } = await ghlAPIClient.createContact(ghlToken, locationId, {
            firstName: contact.first_name ?? undefined,
            lastName: contact.last_name ?? undefined,
            phone,
            email: contact.email ?? undefined,
            companyName: contact.company ?? undefined,
            tags: contact.list_tag ? [contact.list_tag] : undefined,
          })
          if (createErr || !created) {
            await supabase.from('campaign_contacts').update({
              status: 'error',
              exclusion_reason: 'error',
              error_detail: createErr?.message ?? 'Errore creazione contatto',
            }).eq('id', contact.id)
            errors++
            continue
          }
          contactId = created.id
        }

        // Add to workflow
        const { error: wfErr } = await ghlAPIClient.addContactToWorkflow(ghlToken, locationId, contactId, workflowId)
        if (wfErr) {
          await supabase.from('campaign_contacts').update({
            status: 'error',
            error_detail: wfErr.message,
            crm_contact_id: contactId,
          }).eq('id', contact.id)
          errors++
          continue
        }

        // Mark as sent
        await supabase.from('campaign_contacts').update({
          status: 'sent_to_crm',
          crm_contact_id: contactId,
          sent_at: new Date().toISOString(),
        }).eq('id', contact.id)

        sent++
        logEntries.push({
          user_id: user.id, campaign_id: campaign.id, import_id: importId,
          action: 'contact_sent',
          detail: `${phone} inviato al workflow ${workflowId} (contactId: ${contactId})`,
        })
      } catch (e) {
        errors++
        await supabase.from('campaign_contacts').update({
          status: 'error',
          error_detail: e instanceof Error ? e.message : 'Errore imprevisto',
        }).eq('id', contact.id)
      }
    }

    // Batch log
    if (logEntries.length > 0) {
      await supabase.from('campaign_logs').insert(logEntries)
    }

    // Count remaining
    const { count: remaining } = await supabase
      .from('campaign_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('import_id', importId)
      .eq('user_id', user.id)
      .eq('status', 'queued')

    return NextResponse.json({
      processed: contacts.length,
      sent,
      excluded,
      errors,
      remaining: remaining ?? 0,
      sent_today: (sentToday ?? 0) + sent,
      daily_limit: dailyLimit,
    })
  } catch (err) {
    console.error('[send] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Errore interno' }, { status: 500 })
  }
}
