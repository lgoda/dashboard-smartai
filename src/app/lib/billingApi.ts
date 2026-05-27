import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Service-role client used only in API routes (never shipped to browser)
export function createServiceClient() {
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type BillingAdminConfig = {
  id: string
  default_margin_percent: number
  usd_eur_rate: number
  notification_email: string | null
  retell_billing_api_token: string | null
  last_retell_sync_at: string | null
  updated_at: string
}

export type BillingAgentConfig = {
  id: string
  agent_id: string
  user_id: string
  agent_name: string | null
  price_per_minute_cents: number | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type BillingClientConfig = {
  id: string
  user_id: string
  billing_mode: 'prepaid' | 'postpaid' | 'hybrid'
  margin_percent: number | null
  low_balance_threshold_minutes: number
  auto_recharge_enabled: boolean
  auto_recharge_package_id: string | null
  stripe_customer_id: string | null
  stripe_payment_method_id: string | null
  created_at: string
  updated_at: string
}

export type BillingLedgerEntry = {
  id: string
  user_id: string
  type: 'purchase' | 'call_debit' | 'manual_credit' | 'manual_debit' | 'refund' | 'auto_recharge'
  amount_cents: number
  minutes_delta: number
  balance_after_minutes: number
  reference_id: string | null
  description: string | null
  idempotency_key: string
  created_by: string | null
  created_at: string
}

export type BillingBalance = {
  user_id: string
  balance_minutes: number
  balance_cents: number
  last_updated_at: string
}

export type RetellCallBilling = {
  id: string
  user_id: string | null
  call_id: string
  agent_id: string
  duration_seconds: number | null
  cost_retell_usd: number | null
  cost_client_eur: number | null
  cost_client_minutes: number | null
  margin_percent: number | null
  ledger_id: string | null
  billed_at: string | null
  sync_status: 'pending' | 'billed' | 'error' | 'skipped'
  error_detail: string | null
  retell_start_ts: string | null
  retell_end_ts: string | null
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function getAdminConfig(sb: SupabaseClient): Promise<BillingAdminConfig | null> {
  const { data } = await sb.from('billing_admin_config').select('*').single()
  return data ?? null
}

export async function getClientConfig(sb: SupabaseClient, userId: string): Promise<BillingClientConfig | null> {
  const { data } = await sb
    .from('billing_client_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return data ?? null
}

export async function getBalance(sb: SupabaseClient, userId: string): Promise<BillingBalance> {
  const { data } = await sb
    .from('billing_balance')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return data ?? { user_id: userId, balance_minutes: 0, balance_cents: 0, last_updated_at: new Date().toISOString() }
}

/**
 * Call the credit_minutes() Postgres function.
 * minutesDelta > 0 = credit, < 0 = debit.
 * amountCents follows the same sign convention.
 */
export async function creditMinutes(
  sb: SupabaseClient,
  params: {
    userId: string
    minutesDelta: number
    amountCents: number
    type: BillingLedgerEntry['type']
    referenceId?: string
    idempotencyKey: string
    description: string
    createdBy?: string
  }
): Promise<{ data: BillingLedgerEntry | null; error: string | null }> {
  const { data, error } = await sb.rpc('credit_minutes', {
    p_user_id:         params.userId,
    p_minutes_delta:   params.minutesDelta,
    p_amount_cents:    params.amountCents,
    p_type:            params.type,
    p_reference_id:    params.referenceId ?? null,
    p_idempotency_key: params.idempotencyKey,
    p_description:     params.description,
    p_created_by:      params.createdBy ?? null,
  })
  if (error) return { data: null, error: error.message }
  return { data: data as BillingLedgerEntry, error: null }
}

/** Effective margin for a given client (client override or admin default). */
export function effectiveMarginPercent(
  adminConfig: BillingAdminConfig,
  clientConfig: BillingClientConfig | null
): number {
  return clientConfig?.margin_percent ?? adminConfig.default_margin_percent
}

/**
 * Convert Retell combined_cost (USD) to client EUR including margin.
 * Returns { costEur, marginPercent }
 */
export function calcClientCost(
  costRetellUsd: number,
  adminConfig: BillingAdminConfig,
  clientConfig: BillingClientConfig | null
): { costEur: number; marginPercent: number } {
  const margin = effectiveMarginPercent(adminConfig, clientConfig)
  const costEur = costRetellUsd * adminConfig.usd_eur_rate * (1 + margin / 100)
  return { costEur: Math.ceil(costEur * 100) / 100, marginPercent: margin }
}

/**
 * Calculate minutes consumed from a price-per-minute override.
 * Used when billing_agent_config has price_per_minute_cents set.
 */
export function calcMinutesFromPricePerMinute(
  durationSeconds: number,
  pricePerMinuteCents: number
): { minutes: number; costEur: number } {
  const minutes = durationSeconds / 60
  const costEur = (minutes * pricePerMinuteCents) / 100
  return { minutes, costEur }
}

/** Auth header → Supabase client (for user-authenticated API routes). */
export function createAuthedClient(authHeader: string) {
  return createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
  })
}

/** Verify admin role from auth header. Returns userId or null. */
export async function requireAdmin(
  authHeader: string | null
): Promise<{ userId: string } | null> {
  if (!authHeader) return null
  const client = createAuthedClient(authHeader)
  const { data: { user } } = await client.auth.getUser()
  if (!user) return null

  const sb = createServiceClient()
  const { data: profile } = await sb
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return null
  return { userId: user.id }
}

/** Verify any authenticated user. Returns userId or null. */
export async function requireAuth(
  authHeader: string | null
): Promise<{ userId: string } | null> {
  if (!authHeader) return null
  const client = createAuthedClient(authHeader)
  const { data: { user } } = await client.auth.getUser()
  if (!user) return null
  return { userId: user.id }
}
