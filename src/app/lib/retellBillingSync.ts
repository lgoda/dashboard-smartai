import { SupabaseClient } from '@supabase/supabase-js'
import {
  getAdminConfig,
  getClientConfig,
  getBalance,
  calcClientCost,
  calcMinutesFromPricePerMinute,
  creditMinutes,
  purchasePackage,
  incrementOutstanding,
  generatePostpaidInvoice,
  type BillingAgentConfig,
} from './billingApi'

const RETELL_BASE = 'https://api.retellai.com/v2'
const BATCH_LIMIT = 100

export type SyncResult = {
  processed: number
  synced: number
  skipped_no_cost: number
  skipped_no_mapping: number
  skipped_duplicate: number
  blocked_no_balance: number
  error: number
  unmapped_agents?: string[]
  error_message?: string
}

type RetellCallRaw = {
  call_id: string
  agent_id: string
  call_status: string
  start_timestamp?: number
  end_timestamp?: number
  call_cost?: {
    total_duration_seconds?: number
    combined_cost: number // USD cents (not dollars) per Retell API spec
  }
}

export async function runRetellBillingSync(sb: SupabaseClient): Promise<SyncResult> {
  const adminConfig = await getAdminConfig(sb)
  if (!adminConfig) return { processed: 0, synced: 0, skipped_no_cost: 0, skipped_no_mapping: 0, skipped_duplicate: 0, blocked_no_balance: 0, error: 1, error_message: 'billing_admin_config non trovata' }
  if (!adminConfig.retell_billing_api_token) return { processed: 0, synced: 0, skipped_no_cost: 0, skipped_no_mapping: 0, skipped_duplicate: 0, blocked_no_balance: 0, error: 1, error_message: 'retell_billing_api_token non configurato' }

  // Load active agent→user mappings
  const { data: agentConfigs, error: agentErr } = await sb
    .from('billing_agent_config')
    .select('*')
    .eq('is_active', true)

  if (agentErr) return { processed: 0, synced: 0, skipped_no_cost: 0, skipped_no_mapping: 0, skipped_duplicate: 0, blocked_no_balance: 0, error: 1, error_message: agentErr.message }

  const agentMap = new Map<string, BillingAgentConfig>(
    (agentConfigs ?? []).map((a: BillingAgentConfig) => [a.agent_id, a])
  )

  // Time window
  const fromTs = adminConfig.last_retell_sync_at
    ? new Date(adminConfig.last_retell_sync_at).getTime()
    : Date.now() - 24 * 60 * 60 * 1000

  const toTs = Date.now()

  // Fetch calls from Retell (paginated)
  const allCalls: RetellCallRaw[] = []
  let paginationKey: string | undefined = undefined
  let page = 0

  do {
    const body: Record<string, unknown> = {
      filter_criteria: {
        call_status: ['ended'],
        start_timestamp_from: fromTs,
        start_timestamp_to: toTs,
      },
      sort_order: 'ascending',
      limit: BATCH_LIMIT,
    }
    if (paginationKey) body.pagination_key = paginationKey

    const resp = await fetch(`${RETELL_BASE}/list-calls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminConfig.retell_billing_api_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const text = await resp.text()
      console.error('[retellBillingSync] Retell API error:', resp.status, text)
      return { processed: allCalls.length, synced: 0, skipped_no_cost: 0, skipped_no_mapping: 0, skipped_duplicate: 0, blocked_no_balance: 0, error: 1, error_message: `Retell API ${resp.status}: ${text}` }
    }

    const calls: RetellCallRaw[] = await resp.json()
    allCalls.push(...calls)
    paginationKey = calls.length === BATCH_LIMIT && calls.length > 0 ? calls[calls.length - 1].call_id : undefined
    page++
  } while (paginationKey && page < 20)

  const stats = { synced: 0, skipped_no_cost: 0, skipped_no_mapping: 0, skipped_duplicate: 0, blocked_no_balance: 0, error: 0 }
  const unmappedAgents = new Set<string>()

  for (const call of allCalls) {
    if (!call.call_cost || !call.call_cost.combined_cost || call.call_cost.combined_cost <= 0) {
      stats.skipped_no_cost++
      continue
    }

    const agentConfig = agentMap.get(call.agent_id)
    const userId = agentConfig?.user_id ?? null
    if (!userId) unmappedAgents.add(call.agent_id)

    // Idempotency check
    const { count } = await sb
      .from('retell_call_billing')
      .select('*', { count: 'exact', head: true })
      .eq('call_id', call.call_id)

    if ((count ?? 0) > 0) { stats.skipped_duplicate++; continue }

    if (!userId) {
      await sb.from('retell_call_billing').insert({
        call_id:         call.call_id,
        agent_id:        call.agent_id,
        duration_seconds: call.call_cost.total_duration_seconds ?? null,
        cost_retell_usd: call.call_cost.combined_cost,
        sync_status:     'skipped',
        error_detail:    'no_agent_mapping',
        retell_start_ts: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null,
        retell_end_ts:   call.end_timestamp   ? new Date(call.end_timestamp).toISOString()   : null,
      })
      stats.skipped_no_mapping++
      continue
    }

    const clientConfig = await getClientConfig(sb, userId)
    const billingMode  = clientConfig?.billing_mode  ?? 'prepaid'
    const overflowMode = clientConfig?.overflow_mode ?? 'block'
    const durationSeconds = call.call_cost.total_duration_seconds ?? 0
    let costEur: number, minutes: number, marginPercent: number

    if (billingMode === 'prepaid') {
      // In prepaid the client already paid for the package — no per-call EUR charge.
      // Only deduct actual call minutes from the balance.
      minutes       = durationSeconds / 60
      costEur       = 0
      marginPercent = 0

      // If balance exhausted, respect overflow_mode
      const balance = await getBalance(sb, userId)
      if (balance.balance_minutes <= 0) {
        if (overflowMode === 'block') {
          await sb.from('retell_call_billing').insert({
            user_id:          userId,
            call_id:          call.call_id,
            agent_id:         call.agent_id,
            duration_seconds: durationSeconds,
            cost_retell_usd:  call.call_cost.combined_cost,
            sync_status:      'blocked_no_balance',
            error_detail:     'prepaid_balance_exhausted',
            retell_start_ts:  call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null,
            retell_end_ts:    call.end_timestamp   ? new Date(call.end_timestamp).toISOString()   : null,
          })
          stats.blocked_no_balance++
          continue
        }

        if (overflowMode === 'auto_renew') {
          const packageId = clientConfig?.auto_recharge_package_id
          if (!packageId) {
            // No package configured — fall back to block
            await sb.from('retell_call_billing').insert({
              user_id:          userId,
              call_id:          call.call_id,
              agent_id:         call.agent_id,
              duration_seconds: durationSeconds,
              cost_retell_usd:  call.call_cost.combined_cost,
              sync_status:      'blocked_no_balance',
              error_detail:     'auto_renew_no_package_configured',
              retell_start_ts:  call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null,
              retell_end_ts:    call.end_timestamp   ? new Date(call.end_timestamp).toISOString()   : null,
            })
            stats.blocked_no_balance++
            continue
          }

          const { error: renewErr } = await purchasePackage(sb, {
            userId,
            packageId,
            type: 'auto_recharge',
            triggerCallId: call.call_id,
          })

          if (renewErr) {
            console.error('[retellBillingSync] auto_renew error:', renewErr)
            await sb.from('retell_call_billing').insert({
              user_id:          userId,
              call_id:          call.call_id,
              agent_id:         call.agent_id,
              duration_seconds: durationSeconds,
              cost_retell_usd:  call.call_cost.combined_cost,
              sync_status:      'blocked_no_balance',
              error_detail:     `auto_renew_failed: ${renewErr}`,
              retell_start_ts:  call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null,
              retell_end_ts:    call.end_timestamp   ? new Date(call.end_timestamp).toISOString()   : null,
            })
            stats.blocked_no_balance++
            continue
          }
          // Package recharged — proceed to bill this call normally below
        }
        // pay_per_use handled in future phase — for now falls through to normal billing
      }
    } else {
      // Postpaid / hybrid: charge per call at Retell cost + margin
      if (agentConfig!.price_per_minute_cents != null) {
        const r = calcMinutesFromPricePerMinute(durationSeconds, agentConfig!.price_per_minute_cents)
        costEur = r.costEur; minutes = r.minutes; marginPercent = 0
      } else {
        const r = calcClientCost(call.call_cost.combined_cost, adminConfig, clientConfig)
        costEur = r.costEur; marginPercent = r.marginPercent; minutes = durationSeconds / 60
      }
    }

    const costEurCents = Math.round(costEur * 100)
    const idempotencyKey = `call_debit_${call.call_id}`

    const { data: callRecord, error: insertErr } = await sb
      .from('retell_call_billing')
      .insert({
        user_id:             userId,
        call_id:             call.call_id,
        agent_id:            call.agent_id,
        duration_seconds:    durationSeconds,
        cost_retell_usd:     call.call_cost.combined_cost,
        cost_client_eur:     costEur,
        cost_client_minutes: minutes,
        margin_percent:      marginPercent,
        sync_status:         'pending',
        retell_start_ts:     call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null,
        retell_end_ts:       call.end_timestamp   ? new Date(call.end_timestamp).toISOString()   : null,
      })
      .select()
      .single()

    if (insertErr) {
      if (insertErr.code === '23505') { stats.skipped_duplicate++ } else { console.error('[retellBillingSync] insert error:', insertErr.message); stats.error++ }
      continue
    }

    const { data: ledgerEntry, error: creditErr } = await creditMinutes(sb, {
      userId, minutesDelta: -minutes, amountCents: -costEurCents,
      type: 'call_debit', referenceId: call.call_id, idempotencyKey,
      description: `Chiamata Retell ${call.call_id} — ${durationSeconds.toFixed(0)}s — agent ${call.agent_id}`,
    })

    if (creditErr) {
      console.error('[retellBillingSync] creditMinutes error:', creditErr)
      await sb.from('retell_call_billing').update({ sync_status: 'error', error_detail: creditErr }).eq('id', callRecord.id)
      stats.error++
      continue
    }

    await sb.from('retell_call_billing').update({ sync_status: 'billed', ledger_id: ledgerEntry!.id, billed_at: new Date().toISOString() }).eq('id', callRecord.id)
    stats.synced++

    // ── Postpaid: aggiorna outstanding e controlla soglia ──────────────────
    if (billingMode !== 'prepaid' && costEurCents > 0) {
      await incrementOutstanding(sb, userId, costEurCents)

      const trigger    = clientConfig?.invoice_trigger ?? 'monthly'
      const threshold  = clientConfig?.invoice_threshold_cents ?? 5000

      if (trigger === 'threshold' || trigger === 'both') {
        const updatedBalance = await getBalance(sb, userId)
        if (updatedBalance.outstanding_cents >= threshold) {
          const today = new Date().toISOString().slice(0, 10)
          await generatePostpaidInvoice(sb, {
            userId,
            periodFrom: today,
            periodTo:   today,
          })
        }
      }
    }
  }

  if (stats.error === 0 || stats.synced > 0) {
    await sb.from('billing_admin_config').update({ last_retell_sync_at: new Date(toTs).toISOString() }).eq('id', adminConfig.id)
  }

  return {
    processed:      allCalls.length,
    ...stats,
    unmapped_agents: unmappedAgents.size > 0 ? Array.from(unmappedAgents) : undefined,
  }
}
