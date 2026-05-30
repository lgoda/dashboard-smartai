import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ghlAPIClient } from '@/app/lib/ghlApi'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const BATCH_SIZE = 40            // ~1.1s per contact (2 GHL calls + 150ms breathing) -> 44s
const RATE_LIMIT_MS = 150

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ importId: string }> }
) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { importId } = await params
  const cursor = request.nextUrl.searchParams.get('cursor') ?? ''

  const { data: importRecord, error: importErr } = await supabase
    .from('campaign_imports')
    .select('id, list_tag, user_id')
    .eq('id', importId)
    .eq('user_id', user.id)
    .single()

  if (importErr || !importRecord) return NextResponse.json({ error: 'Import non trovato' }, { status: 404 })
  const listTag: string = importRecord.list_tag ?? ''
  if (!listTag) return NextResponse.json({ error: 'list_tag mancante su questo import' }, { status: 400 })

  const { token: ghlToken, locationId, error: tokenErr } = await ghlAPIClient.getActiveToken(user.id, supabase)
  if (tokenErr || !ghlToken || !locationId) {
    return NextResponse.json({ error: 'Token GHL non configurato' }, { status: 403 })
  }

  // Cursor-based pagination by id (ordered ascending). The first call passes
  // cursor='', subsequent calls pass the last id returned.
  let query = supabase
    .from('campaign_contacts')
    .select('id, phone_normalized, crm_contact_id')
    .eq('import_id', importId)
    .eq('user_id', user.id)
    .eq('status', 'sent_to_crm')
    .not('crm_contact_id', 'is', null)
    .order('id', { ascending: true })
    .limit(BATCH_SIZE)

  if (cursor) query = query.gt('id', cursor)

  const { data: contacts, error: contactsErr } = await query
  if (contactsErr) return NextResponse.json({ error: contactsErr.message }, { status: 500 })
  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ processed: 0, tagged: 0, already_had_tag: 0, errors: 0, error_details: [], next_cursor: null, done: true })
  }

  let tagged = 0
  let alreadyHadTag = 0
  let errors = 0
  const errorDetails: { phone: string; reason: string }[] = []
  let lastId = cursor

  for (const c of contacts) {
    lastId = String(c.id)
    const phone = String(c.phone_normalized ?? '')
    if (!phone) { errors++; errorDetails.push({ phone: '', reason: 'phone_normalized mancante' }); continue }

    const { data: existing } = await ghlAPIClient.searchContactByPhone(ghlToken, locationId, phone)
    if (!existing) {
      errors++
      errorDetails.push({ phone, reason: 'non trovato su GHL' })
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS))
      continue
    }

    if (existing.tags.includes(listTag)) {
      alreadyHadTag++
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS))
      continue
    }

    const { error: tagErr } = await ghlAPIClient.addTagsToContact(ghlToken, locationId, existing.id, [listTag])
    if (tagErr) {
      errors++
      errorDetails.push({ phone, reason: tagErr.message })
    } else {
      tagged++
    }
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS))
  }

  // If we got fewer rows than the batch size, we're done.
  const done = contacts.length < BATCH_SIZE
  return NextResponse.json({
    processed: contacts.length,
    tagged,
    already_had_tag: alreadyHadTag,
    errors,
    error_details: errorDetails.slice(0, 20),
    next_cursor: done ? null : lastId,
    done,
  })
}
