import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { retellAPIClient, RetellCall } from '@/app/lib/retellApi'
import {
  createServiceClient,
  getAdminConfig,
  getClientConfig,
  calcClientCost,
} from '@/app/lib/billingApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const PAGE_LIMIT = 100
const MAX_PAGES = 30 // up to 3000 calls per window — plenty for a reporting period

type DayBucket = { date: string; eur: number; calls: number; seconds: number }

// Group a call into its local (Europe/Rome) calendar day → YYYY-MM-DD.
const dayKey = (ts: number) =>
  new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' })

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Gate: the Consumo view is opt-in per client.
    const { data: services } = await supabase
      .from('user_services')
      .select('has_consumo')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!services?.has_consumo) {
      return NextResponse.json({ error: 'Funzione non disponibile' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const fromMs = Number(searchParams.get('from'))
    const toMs = Number(searchParams.get('to'))
    if (!fromMs || !toMs || Number.isNaN(fromMs) || Number.isNaN(toMs) || toMs <= fromMs) {
      return NextResponse.json({ error: 'Parametri from/to mancanti o non validi' }, { status: 400 })
    }

    // Client's own Retell token → same call scoping as the AI-calls page.
    const { token, error: tokenError } = await retellAPIClient.getActiveToken(user.id, supabase)
    if (tokenError || !token) {
      return NextResponse.json(
        { error: tokenError?.message || 'Nessun token Retell attivo' },
        { status: 403 },
      )
    }

    // Billing config drives the rate + margin (single source of truth: same
    // calcClientCost the invoicing sync uses). usd_eur_rate lives in the
    // admin-only billing_admin_config, so read both with the service client.
    const sb = createServiceClient()
    const [adminConfig, clientConfig] = await Promise.all([
      getAdminConfig(sb),
      getClientConfig(sb, user.id),
    ])
    if (!adminConfig) {
      return NextResponse.json({ error: 'Configurazione billing mancante' }, { status: 500 })
    }

    // Pull ended calls in the window, paginating until exhausted.
    const calls: RetellCall[] = []
    let paginationKey: string | undefined
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await retellAPIClient.listCalls(token, {
        filter_criteria: {
          call_status: ['ended'],
          start_timestamp_from: fromMs,
          start_timestamp_to: toMs,
        },
        sort_order: 'ascending',
        limit: PAGE_LIMIT,
        pagination_key: paginationKey,
      })
      if (error || !data) {
        return NextResponse.json(
          { error: error?.message || 'Errore lettura chiamate Retell' },
          { status: 502 },
        )
      }
      calls.push(...data.calls)
      if (!data.hasMore || !data.pagination_key) break
      paginationKey = data.pagination_key
    }

    // Aggregate. Retell combined_cost is in USD cents — calcClientCost handles
    // /100 + exchange rate + margin. With margin_percent = 0 → real cost in EUR.
    const byDay = new Map<string, DayBucket>()
    let totalEur = 0
    let totalSeconds = 0
    let totalCalls = 0

    for (const c of calls) {
      const cost = c.call_cost?.combined_cost
      if (!cost || cost <= 0) continue

      const { costEur } = calcClientCost(cost, adminConfig, clientConfig)
      const seconds = c.call_cost?.total_duration_seconds
        ?? (c.duration_ms ? c.duration_ms / 1000 : 0)
      const day = dayKey(c.start_timestamp ?? fromMs)

      const bucket = byDay.get(day) ?? { date: day, eur: 0, calls: 0, seconds: 0 }
      bucket.eur += costEur
      bucket.calls += 1
      bucket.seconds += seconds
      byDay.set(day, bucket)

      totalEur += costEur
      totalSeconds += seconds
      totalCalls += 1
    }

    const by_day = Array.from(byDay.values())
      .map(b => ({ ...b, eur: Math.round(b.eur * 100) / 100, seconds: Math.round(b.seconds) }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({
      total_eur: Math.round(totalEur * 100) / 100,
      total_calls: totalCalls,
      total_seconds: Math.round(totalSeconds),
      // Surfaced for admin/debug — the client page does not display it.
      margin_percent: clientConfig?.margin_percent ?? adminConfig.default_margin_percent,
      currency: 'eur',
      by_day,
      generated_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[consumo/summary] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
