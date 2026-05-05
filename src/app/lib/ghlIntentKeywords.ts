import type { GHLConversation } from './ghlApi'

// ─── Keyword lists ────────────────────────────────────────────────────────────

/**
 * Signals that the conversation is already converted (skip LLM — no opportunity).
 */
export const CONVERSION_KEYWORDS = [
  'appuntamento confermato', 'appuntamento fissato', 'appuntamento prenotato',
  'ci vediamo', 'ci sentiamo',
  'perfetto allora', 'confermato', 'confermo', 'ho confermato',
  'fissato', 'prenotato', 'ho prenotato', 'ho fissato',
  'ci sarò', 'sarò lì', 'verrò',
  'ok per il', 'ok alle', 'ok il giorno', 'va bene il',
  'lunedì alle', 'martedì alle', 'mercoledì alle', 'giovedì alle', 'venerdì alle',
  'sabato alle', 'domenica alle',
]

/**
 * Explicit rejection signals — the contact clearly said no.
 * Only mark cold when one of these appears.
 */
export const REJECTION_KEYWORDS = [
  'non mi interessa', 'non sono interessato', 'non sono interessata',
  'non ho bisogno', 'non ne ho bisogno',
  'no grazie', 'no, grazie',
  'non voglio', 'non voglio essere contattato', 'non voglio essere contattata',
  'lasci perdere', 'lascia perdere',
  'non disturbarmi', 'non disturbarci',
  'rimuovimi', 'toglimi',
  'non ho interesse',
]

// ─── Pre-filter ───────────────────────────────────────────────────────────────

type PreFilterResult = 'candidate' | 'converted' | 'cold'

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function containsAny(text: string, keywords: string[]): boolean {
  const t = normalize(text)
  return keywords.some((kw) => t.includes(normalize(kw)))
}

/**
 * Pre-filter using only the data available in the conversation list (no API calls).
 *
 * Strategy (inverted from naive keyword matching):
 * - 'converted' → GHL status is close, OR lastMessageBody has a clear confirmation
 * - 'cold'      → lastMessageBody has an explicit rejection ("non mi interessa", ecc.)
 * - 'candidate' → EVERYTHING ELSE (default for all open conversations)
 *
 * Why inverted: lastMessageBody is often the AGENT's reply, not the contact's message.
 * Checking lastMessageBody for interest keywords creates false negatives (e.g. the
 * contact said "Si, mi interessa" but the agent replied last with a product description).
 * It is cheaper and safer to send ambiguous conversations to the LLM.
 */
export function preFilterConversation(conv: GHLConversation): PreFilterResult {
  if ((conv as any).status === 'close') return 'converted'

  const text = conv.lastMessageBody ?? ''

  if (containsAny(text, CONVERSION_KEYWORDS)) return 'converted'
  if (containsAny(text, REJECTION_KEYWORDS)) return 'cold'

  return 'candidate'
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildAnalysisPrompt(messages: Array<{ type: number; body?: string; dateAdded: string }>): string {
  const formatted = messages
    .map((m) => {
      const role = m.type === 2 ? 'Agente' : 'Contatto'
      const date = new Date(m.dateAdded).toLocaleString('it-IT', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
      return `[${date}] ${role}: ${m.body ?? '[allegato]'}`
    })
    .join('\n')

  return `Sei un analista CRM. Analizza questa conversazione in italiano e rispondi SOLO con JSON valido (nessun testo fuori dal JSON).

{
  "intent_score": <intero 0-100, quanto è interessato il contatto>,
  "is_converted": <boolean>,
  "intent_signals": ["frase specifica che mostra interesse", "..."],
  "conversion_signals": ["frase che indica conversione", "..."],
  "missing_action": "cosa manca per completare la conversione (1 frase, italiano)",
  "suggested_followup": "azione consigliata per l'agente (1 frase, italiano)"
}

Regole:
- intent_score 70+ significa forte interesse esplicito
- is_converted = true SOLO se: è stata fissata una data/ora specifica, o il contatto ha confermato esplicitamente ("confermato", "ci vediamo il...", ecc.)
- is_converted = false se il contatto dice "mi chiami", "sono interessato", "voglio un appuntamento" ma non si arriva a una data concreta
- intent_signals: cita le frasi esatte dal testo del contatto (non dell'agente)
- missing_action: es. "appuntamento non fissato" o "data non confermata"
- Se la conversazione è neutra (domanda generica senza interesse evidente) usa intent_score < 40

Conversazione:
${formatted}`
}
