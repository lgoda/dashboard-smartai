import { RetellCall } from './retellApi'
import { AICall } from './conversationsApi'

export type UnifiedAICall = {
  id: string
  provider: 'elevenlabs' | 'retell'
  agent_id: string
  agent_name?: string
  start_time: number
  end_time?: number
  duration_ms?: number
  duration_secs?: number
  call_status?: string
  call_successful?: string | boolean
  transcript?: string
  transcript_summary?: string
  call_summary_title?: string
  recording_url?: string
  disconnection_reason?: string
  termination_reason?: string
  direction?: string
  rating?: number
  message_count?: number
  call_cost?: {
    product_costs?: Array<{
      product: string
      unit_price: number
      cost: number
    }>
    total_duration_seconds?: number
    total_duration_unit_price?: number
    combined_cost?: number
  }
  call_analysis?: {
    call_summary?: string
    in_voicemail?: boolean
    user_sentiment?: string
    call_successful?: boolean
    custom_analysis_data?: Record<string, any>
  }
  metadata?: Record<string, any>
}

export function normalizeElevenLabsCall(call: AICall): UnifiedAICall {
  return {
    id: call.conversation_id,
    provider: 'elevenlabs',
    agent_id: call.agent_id,
    agent_name: call.agent_name,
    start_time: call.start_time_unix_secs,
    duration_secs: call.call_duration_secs,
    duration_ms: call.call_duration_secs * 1000,
    call_status: call.call_successful === 'successful' ? 'ended' : 'error',
    call_successful: call.call_successful === 'successful',
    transcript: call.transcript_summary,
    transcript_summary: call.transcript_summary,
    call_summary_title: call.call_summary_title,
    direction: call.direction,
    rating: call.rating,
    message_count: call.message_count
  }
}

export function normalizeRetellCall(call: RetellCall): UnifiedAICall {
  const durationSecs = call.duration_ms ? Math.floor(call.duration_ms / 1000) : undefined
  
  return {
    id: call.call_id,
    provider: 'retell',
    agent_id: call.agent_id,
    agent_name: call.agent_name,
    start_time: call.start_timestamp ? Math.floor(call.start_timestamp / 1000) : 0,
    end_time: call.end_timestamp ? Math.floor(call.end_timestamp / 1000) : undefined,
    duration_ms: call.duration_ms,
    duration_secs: durationSecs,
    call_status: call.call_status,
    call_successful: call.call_analysis?.call_successful ?? (call.call_status === 'ended'),
    transcript: call.transcript,
    transcript_summary: call.call_analysis?.call_summary,
    call_summary_title: call.call_analysis?.call_summary?.substring(0, 100),
    recording_url: call.recording_url,
    disconnection_reason: call.disconnection_reason,
    termination_reason: call.disconnection_reason,
    call_cost: call.call_cost,
    call_analysis: call.call_analysis,
    metadata: call.metadata
  }
}

export function getUnifiedCallStatus(call: UnifiedAICall): string {
  if (call.provider === 'retell') {
    return call.call_status || 'unknown'
  } else {
    return call.call_successful ? 'successful' : 'failed'
  }
}

export function getUnifiedCallSuccess(call: UnifiedAICall): boolean {
  if (call.provider === 'retell') {
    return call.call_analysis?.call_successful ?? false
  } else {
    return call.call_successful === true || call.call_successful === 'successful'
  }
}

export function getUnifiedTerminationReason(call: UnifiedAICall): string {
  return call.termination_reason || call.disconnection_reason || 'unknown'
}

export function getUnifiedSentiment(call: UnifiedAICall): string | undefined {
  return call.call_analysis?.user_sentiment
}

export function getUnifiedCost(call: UnifiedAICall): number | undefined {
  // Retell API restituisce i costi in centesimi di dollaro, quindi dobbiamo dividere per 100
  // combined_cost è il costo totale della chiamata (include tutti i prodotti + durata)
  if (!call.call_cost?.combined_cost) return undefined
  
  // I costi Retell sono in centesimi, convertiamo in dollari
  if (call.provider === 'retell') {
    return call.call_cost.combined_cost / 100
  }
  
  // ElevenLabs potrebbe usare un formato diverso, lasciamo invariato per ora
  return call.call_cost.combined_cost
}

export function getRetellProductCost(productCost: { cost: number; unit_price: number }): { cost: number; unit_price: number } {
  // I costi Retell sono in centesimi, convertiamo in dollari
  return {
    cost: productCost.cost / 100,
    unit_price: productCost.unit_price / 100
  }
}

export function getRetellDurationCost(totalDurationSeconds: number, unitPrice: number): number {
  // I costi Retell sono in centesimi, convertiamo in dollari
  return (totalDurationSeconds * unitPrice) / 100
}

export function getDisconnectionReasonLabel(reason: string | undefined): string {
  if (!reason) return 'Sconosciuto'
  
  const reasonMap: Record<string, string> = {
    'user_hangup': 'Utente ha riattaccato',
    'agent_hangup': 'Agente ha riattaccato',
    'call_transfer': 'Chiamata trasferita',
    'voicemail_reached': 'Raggiunta segreteria telefonica',
    'inactivity': 'Inattività',
    'max_duration_reached': 'Durata massima raggiunta',
    'concurrency_limit_reached': 'Limite di concorrenza raggiunto',
    'no_valid_payment': 'Nessun pagamento valido',
    'scam_detected': 'Scam rilevato',
    'dial_busy': 'Numero occupato',
    'dial_failed': 'Chiamata fallita',
    'dial_no_answer': 'Nessuna risposta',
    'invalid_destination': 'Destinazione non valida',
    'telephony_provider_permission_denied': 'Permesso negato dal provider',
    'telephony_provider_unavailable': 'Provider non disponibile',
    'sip_routing_error': 'Errore routing SIP',
    'marked_as_spam': 'Marcato come spam',
    'user_declined': 'Utente ha rifiutato',
    'error_llm_websocket_open': 'Errore apertura LLM WebSocket',
    'error_llm_websocket_lost_connection': 'Connessione LLM WebSocket persa',
    'error_llm_websocket_runtime': 'Errore runtime LLM WebSocket',
    'error_llm_websocket_corrupt_payload': 'Payload LLM WebSocket corrotto',
    'error_no_audio_received': 'Nessun audio ricevuto',
    'error_asr': 'Errore ASR',
    'error_retell': 'Errore Retell',
    'error_unknown': 'Errore sconosciuto',
    'error_user_not_joined': 'Utente non si è unito',
    'registered_call_timeout': 'Timeout chiamata registrata'
  }
  
  return reasonMap[reason] || reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}
