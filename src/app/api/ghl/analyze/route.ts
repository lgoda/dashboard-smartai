import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { ghlAPIClient } from '@/app/lib/ghlApi'
import { preFilterConversation, buildAnalysisPrompt } from '@/app/lib/ghlIntentKeywords'
import type { GHLConversation } from '@/app/lib/ghlApi'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export type InsightResult = {
  conversation_id: string
  intent_score: number
  is_converted: boolean
  is_hot_lead: boolean
  intent_signals: string[]
  conversion_signals: string[]
  missing_action: string | null
  suggested_followup: string | null
  analyzed_at: string
}

// Limit LLM concurrency to avoid rate limits
async function runConcurrent<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<Array<T | null>> {
  const results: Array<T | null> = new Array(tasks.length).fill(null)
  let index = 0

  async function worker() {
    while (index < tasks.length) {
      const current = index++
      try {
        results[current] = await tasks[current]()
      } catch {
        results[current] = null
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

export async function POST(request: NextRequest) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header required' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    // ── Retrieve tokens ─────────────────────────────────────────────────────
    const [ghlResult, openaiResult] = await Promise.all([
      ghlAPIClient.getActiveToken(user.id, supabase),
      supabase
        .from('openai_tokens')
        .select('api_token, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle(),
    ])

    if (ghlResult.error || !ghlResult.token || !ghlResult.locationId) {
      return NextResponse.json({ error: 'Token GHL non configurato' }, { status: 403 })
    }

    if (!openaiResult.data?.api_token) {
      return NextResponse.json({ error: 'Token OpenAI non configurato. Aggiungilo nelle Impostazioni.' }, { status: 403 })
    }

    // ── Parse body ──────────────────────────────────────────────────────────
    const body = await request.json()
    // conversations: full GHLConversation objects (sent from the frontend to avoid extra GHL calls)
    const conversations: GHLConversation[] = body.conversations ?? []

    if (conversations.length === 0) {
      return NextResponse.json({ results: {} })
    }

    // Max 20 per request to stay within route timeout
    const toAnalyze = conversations.slice(0, 20)

    const openai = new OpenAI({ apiKey: openaiResult.data.api_token })
    const results: Record<string, InsightResult> = {}

    // ── Phase 1: keyword pre-filter ─────────────────────────────────────────
    const candidates: GHLConversation[] = []
    const preFiltered: GHLConversation[] = []

    for (const conv of toAnalyze) {
      const verdict = preFilterConversation(conv)
      if (verdict === 'candidate') {
        candidates.push(conv)
      } else {
        // cold or already converted — store without LLM
        const isConverted = verdict === 'converted'
        results[conv.id] = {
          conversation_id: conv.id,
          intent_score: isConverted ? 50 : 10,
          is_converted: isConverted,
          is_hot_lead: false,
          intent_signals: [],
          conversion_signals: [],
          missing_action: null,
          suggested_followup: null,
          analyzed_at: new Date().toISOString(),
        }
        preFiltered.push(conv)
      }
    }

    // ── Phase 2: LLM analysis for candidates ───────────────────────────────
    const llmTasks = candidates.map((conv) => async (): Promise<InsightResult> => {
      // Fetch full message history
      const { data: msgData } = await ghlAPIClient.getMessages(
        ghlResult.token!,
        ghlResult.locationId!,
        conv.id,
        { limit: 50 }
      )

      const messages = msgData?.messages?.messages ?? []

      // Build prompt
      const prompt = buildAnalysisPrompt(
        messages.map((m) => ({ type: m.type, body: m.body, dateAdded: m.dateAdded }))
      )

      // Call OpenAI
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      })

      const raw = response.choices[0]?.message?.content ?? '{}'
      let parsed: any = {}
      try { parsed = JSON.parse(raw) } catch { /* keep empty */ }

      const intentScore: number = Math.min(100, Math.max(0, parsed.intent_score ?? 0))
      const isConverted: boolean = !!parsed.is_converted
      const isHotLead = intentScore >= 70 && !isConverted

      return {
        conversation_id: conv.id,
        intent_score: intentScore,
        is_converted: isConverted,
        is_hot_lead: isHotLead,
        intent_signals: parsed.intent_signals ?? [],
        conversion_signals: parsed.conversion_signals ?? [],
        missing_action: parsed.missing_action ?? null,
        suggested_followup: parsed.suggested_followup ?? null,
        analyzed_at: new Date().toISOString(),
      }
    })

    const llmResults = await runConcurrent(llmTasks, 3)

    for (let i = 0; i < candidates.length; i++) {
      const r = llmResults[i]
      if (r) results[candidates[i].id] = r
    }

    // ── Persist to Supabase ─────────────────────────────────────────────────
    const inserts = Object.values(results).map((r) => ({
      user_id: user.id,
      conversation_id: r.conversation_id,
      location_id: ghlResult.locationId,
      intent_score: r.intent_score,
      is_converted: r.is_converted,
      is_hot_lead: r.is_hot_lead,
      intent_signals: r.intent_signals,
      conversion_signals: r.conversion_signals,
      missing_action: r.missing_action,
      suggested_followup: r.suggested_followup,
      analyzed_at: r.analyzed_at,
    }))

    if (inserts.length > 0) {
      await supabase
        .from('ghl_conversation_insights')
        .upsert(inserts, { onConflict: 'user_id,conversation_id' })
    }

    return NextResponse.json({ results })
  } catch (err) {
    console.error('[GHL analyze] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Errore interno del server' },
      { status: 500 }
    )
  }
}
