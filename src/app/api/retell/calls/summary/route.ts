import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { retellAPIClient, RetellCall, RetellFilterCriteria } from '@/app/lib/retellApi'
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

const PAGE_LIMIT = 1000 // Retell max page size — minimise request count vs rate limit
const MAX_PAGES = 20
const RETRY_429 = 3
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// list-calls with backoff on Retell throttling (429), mirrors consumo/summary.
async function listCallsResilient(
  token: string,
  opts: Parameters<typeof retellAPIClient.listCalls>[1],
) {
  for (let attempt = 0; ; attempt++) {
    const res = await retellAPIClient.listCalls(token, opts)
    const throttled = res.error && /\b429\b/.test(res.error.message)
    if (!throttled || attempt >= RETRY_429) return res
    await sleep(500 * 2 ** attempt) // 500ms, 1s, 2s
  }
}

/**
 * Aggregate totals for the AI-calls page header: real total count (via the v3
 * `include_total`) plus the spent amount in EUR (same calcClientCost as the
 * consumo view). Uses the user's OWN Retell token, so every call under it
 * belongs to them — no agent restriction (unlike consumo's shared-token case).
 * The list itself stays paginated client-side; this only feeds the stat cards.
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}))
    const filter_criteria: RetellFilterCriteria = body?.filter_criteria ?? {}
    const sort_order: 'ascending' | 'descending' =
      body?.sort_order === 'ascending' ? 'ascending' : 'descending'

    const { token, error: tokenError } = await retellAPIClient.getActiveToken(user.id, supabase)
    if (tokenError || !token) {
      return NextResponse.json(
        { error: tokenError?.message || 'Nessun token Retell attivo' },
        { status: 403 },
      )
    }

    // Billing config for the EUR conversion (exchange rate + margin). When the
    // admin config is missing we still return the count and the raw USD total,
    // and let the client fall back gracefully.
    const sb = createServiceClient()
    const [adminConfig, clientConfig] = await Promise.all([
      getAdminConfig(sb),
      getClientConfig(sb, user.id),
    ])

    let totalCostUsd = 0 // dollars (combined_cost is USD cents)
    let totalCostEur = 0
    let totalSeconds = 0
    let totalCalls = 0 // exact count from include_total (independent of the cost cap)
    let processedCalls = 0 // calls actually iterated (denominator for rate/avg)
    let successfulCalls = 0
    let capped = false

    let paginationKey: string | undefined
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await listCallsResilient(token, {
        filter_criteria,
        sort_order,
        limit: PAGE_LIMIT,
        pagination_key: paginationKey,
        include_total: page === 0, // one extra aggregate query, only on the first page
      })
      if (error || !data) {
        return NextResponse.json(
          { error: error?.message || 'Errore lettura chiamate Retell' },
          { status: 502 },
        )
      }

      if (page === 0 && typeof data.total === 'number') totalCalls = data.total

      for (const c of data.calls as RetellCall[]) {
        processedCalls++
        if (c.call_analysis?.call_successful) successfulCalls++
        const cents = c.call_cost?.combined_cost
        if (cents && cents > 0) {
          totalCostUsd += cents / 100
          if (adminConfig) totalCostEur += calcClientCost(cents, adminConfig, clientConfig).costEur
        }
        totalSeconds += c.call_cost?.total_duration_seconds
          ?? (c.duration_ms ? c.duration_ms / 1000 : 0)
      }

      if (!data.hasMore || !data.pagination_key) break
      paginationKey = data.pagination_key
      if (page === MAX_PAGES - 1) capped = true
    }

    // total_calls is exact (include_total); when not capped it equals
    // processedCalls, so rate/avg over processedCalls are exact too.
    return NextResponse.json({
      total_calls: totalCalls || processedCalls,
      processed_calls: processedCalls,
      successful_calls: successfulCalls,
      total_cost_eur: adminConfig ? Math.round(totalCostEur * 100) / 100 : null,
      total_cost_usd: Math.round(totalCostUsd * 100) / 100,
      total_seconds: Math.round(totalSeconds),
      currency: 'eur',
      // True if the cost/seconds aggregation hit the page cap — total_calls stays
      // exact (from include_total), but the amount may understate. Rare for a
      // date-bounded window.
      capped,
      generated_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[retell/calls/summary] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
