import { supabase } from './supabaseClient'
import { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type GHLChannelType =
  | 'TYPE_WHATSAPP'
  | 'TYPE_SMS'
  | 'TYPE_EMAIL'
  | 'TYPE_PHONE'
  | 'TYPE_INSTAGRAM'
  | 'TYPE_FACEBOOK'
  | 'TYPE_LIVE_CHAT'
  | 'TYPE_GMB'
  | string

export type GHLConversationStatus = 'open' | 'close' | 'all'

export type GHLConversation = {
  id: string
  locationId: string
  contactId: string
  fullName?: string
  email?: string
  phone?: string
  type: GHLChannelType
  unreadCount: number
  lastMessageBody?: string
  lastMessageDate?: string
  lastMessageType?: string
  inbox?: string
  inboxId?: string
  assignedTo?: string
  starred?: boolean
  tags?: string[]
  dateAdded?: string
  dateUpdated?: string
}

export type GHLMessage = {
  id: string
  type: number // 1 = inbound, 2 = outbound (GHL convention)
  messageType: string
  body?: string
  contentType?: string
  dateAdded: string
  attachments?: string[]
  status?: string
  contactId?: string
  conversationId: string
  userId?: string
  source?: string
}

export type GHLCursor = {
  startAfter: string       // last conversation ID
  startAfterDate: number   // last conversation's lastMessageDate as ms timestamp
}

export type GHLListConversationsResponse = {
  conversations: GHLConversation[]
  total: number
  hasMore: boolean
  nextCursor?: GHLCursor
}

export type GHLMessagesResponse = {
  messages: {
    messages: GHLMessage[]
    nextPage: boolean
    lastMessageId?: string
  }
  contactId?: string
}

// ─── Channel helpers ───────────────────────────────────────────────────────────

export const GHL_CHANNEL_LABELS: Record<string, string> = {
  TYPE_WHATSAPP: 'WhatsApp',
  TYPE_SMS: 'SMS',
  TYPE_EMAIL: 'Email',
  TYPE_PHONE: 'Telefono',
  TYPE_INSTAGRAM: 'Instagram',
  TYPE_FACEBOOK: 'Facebook',
  TYPE_LIVE_CHAT: 'Live Chat',
  TYPE_GMB: 'Google',
}

export const GHL_CHANNEL_COLORS: Record<string, string> = {
  TYPE_WHATSAPP: '#25D366',
  TYPE_SMS: '#3B82F6',
  TYPE_EMAIL: '#6B7280',
  TYPE_PHONE: '#8B5CF6',
  TYPE_INSTAGRAM: '#E1306C',
  TYPE_FACEBOOK: '#1877F2',
  TYPE_LIVE_CHAT: '#F0AD4E',
  TYPE_GMB: '#EA4335',
}

export function getChannelLabel(type: string): string {
  return GHL_CHANNEL_LABELS[type] ?? type
}

export function getChannelColor(type: string): string {
  return GHL_CHANNEL_COLORS[type] ?? '#6B7280'
}

// ─── API Client ───────────────────────────────────────────────────────────────

export class GHLAPIClient {
  private supabaseClient = supabase
  private baseURL = 'https://services.leadconnectorhq.com'
  private version = '2021-04-15'

  private headers(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      Version: this.version,
      'Content-Type': 'application/json',
    }
  }

  async getActiveToken(
    userId: string,
    supabaseInstance?: SupabaseClient
  ): Promise<{ token: string | null; locationId: string | null; error: Error | null }> {
    try {
      const client = supabaseInstance ?? this.supabaseClient

      const { data, error } = await client
        .from('ghl_tokens')
        .select('api_token, location_id, is_active')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle()

      if (error) {
        return { token: null, locationId: null, error: new Error(`Errore recupero token GHL: ${error.message}`) }
      }

      if (!data) {
        return { token: null, locationId: null, error: new Error('Nessun token GHL attivo trovato') }
      }

      return { token: data.api_token, locationId: data.location_id, error: null }
    } catch (err) {
      return {
        token: null,
        locationId: null,
        error: err instanceof Error ? err : new Error('Errore imprevisto nel recupero del token GHL'),
      }
    }
  }

  async verifyToken(token: string, locationId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseURL}/locations/${locationId}`,
        { headers: this.headers(token) }
      )
      return response.ok
    } catch {
      return false
    }
  }

  async listConversations(
    token: string,
    locationId: string,
    options: {
      limit?: number
      cursor?: GHLCursor         // cursor for next/prev page
      type?: string
      status?: GHLConversationStatus
      query?: string
    } = {}
  ): Promise<{ data: GHLListConversationsResponse | null; error: Error | null }> {
    try {
      const { limit = 20, cursor, type, status, query } = options

      const params = new URLSearchParams({
        locationId,
        limit: String(limit),
        sortBy: 'last_message_date',
        sort: 'desc',
      })

      // Note: GHL ignores the 'type' channel filter server-side — applied client-side instead
      if (status && status !== 'all') params.set('status', status === 'open' ? 'open' : 'close')
      if (query) params.set('query', query)

      // Cursor-based pagination: GHL uses startAfter (ID) + startAfterDate (ms timestamp)
      if (cursor) {
        params.set('startAfter', cursor.startAfter)
        params.set('startAfterDate', String(cursor.startAfterDate))
      }

      const response = await fetch(
        `${this.baseURL}/conversations/search?${params.toString()}`,
        { headers: this.headers(token) }
      )

      if (!response.ok) {
        const text = await response.text()
        return { data: null, error: new Error(`GHL API error ${response.status}: ${text}`) }
      }

      const json = await response.json()

      const conversations: GHLConversation[] = json.conversations ?? []
      const total: number = json.total ?? conversations.length
      const hasMore = conversations.length === limit

      // Build cursor for next page from the last item
      let nextCursor: GHLCursor | undefined
      if (hasMore && conversations.length > 0) {
        const last = conversations[conversations.length - 1]
        const lastDateMs = last.lastMessageDate ? new Date(last.lastMessageDate).getTime() : Date.now()
        nextCursor = { startAfter: last.id, startAfterDate: lastDateMs }
      }

      return {
        data: { conversations, total, hasMore, nextCursor },
        error: null,
      }
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err : new Error('Errore chiamata GHL listConversations'),
      }
    }
  }

  async getMessages(
    token: string,
    locationId: string,
    conversationId: string,
    options: { limit?: number; lastMessageId?: string } = {}
  ): Promise<{ data: GHLMessagesResponse | null; error: Error | null }> {
    try {
      const params = new URLSearchParams({ locationId })
      if (options.limit) params.set('limit', String(options.limit))
      if (options.lastMessageId) params.set('lastMessageId', options.lastMessageId)

      const response = await fetch(
        `${this.baseURL}/conversations/${conversationId}/messages?${params.toString()}`,
        { headers: this.headers(token) }
      )

      if (!response.ok) {
        const text = await response.text()
        return { data: null, error: new Error(`GHL API error ${response.status}: ${text}`) }
      }

      const data: GHLMessagesResponse = await response.json()
      return { data, error: null }
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err : new Error('Errore chiamata GHL getMessages'),
      }
    }
  }
  // ── Campaign / contact management ──────────────────────────────────────────

  async getWorkflows(
    token: string,
    locationId: string
  ): Promise<{ data: Array<{ id: string; name: string; status: string }> | null; error: Error | null }> {
    try {
      // GHL v2 workflows endpoint: GET /workflows/ with locationId query param
      const params = new URLSearchParams({ locationId })
      const response = await fetch(`${this.baseURL}/workflows/?${params.toString()}`, {
        headers: this.headers(token),
      })
      if (!response.ok) {
        const text = await response.text()
        return { data: null, error: new Error(`GHL workflows error ${response.status}: ${text}`) }
      }
      const json = await response.json()
      // GHL returns { workflows: [...] }
      const list = json.workflows ?? json.data ?? (Array.isArray(json) ? json : [])
      return {
        data: (list as Array<{ id: string; name: string; status?: string }>).map((w) => ({
          id: w.id,
          name: w.name,
          status: w.status ?? 'active',
        })),
        error: null,
      }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error('Errore getWorkflows') }
    }
  }

  async getTags(
    token: string,
    locationId: string
  ): Promise<{ data: string[] | null; error: Error | null }> {
    try {
      // GHL v2 correct endpoint for location tags
      const response = await fetch(`${this.baseURL}/locations/${locationId}/tags`, {
        headers: this.headers(token),
      })
      if (response.ok) {
        const json = await response.json()
        const tags: string[] = Array.isArray(json.tags) ? json.tags.map((t: any) => t.name ?? t) : []
        if (tags.length > 0) return { data: tags, error: null }
      }

      // Fallback: extract unique tags from first 100 contacts
      const params = new URLSearchParams({ locationId, limit: '100' })
      const contactsResp = await fetch(`${this.baseURL}/contacts/?${params.toString()}`, {
        headers: this.headers(token),
      })
      if (!contactsResp.ok) return { data: [], error: null }
      const contactsJson = await contactsResp.json()
      const contacts: any[] = contactsJson.contacts ?? []
      const tagSet = new Set<string>()
      for (const c of contacts) {
        for (const t of c.tags ?? []) tagSet.add(String(t))
      }
      return { data: [...tagSet].sort(), error: null }
    } catch {
      return { data: [], error: null }
    }
  }

  async searchContactByPhone(
    token: string,
    locationId: string,
    phone: string
  ): Promise<{ data: { id: string; tags: string[] } | null; error: Error | null }> {
    try {
      const params = new URLSearchParams({ locationId, phone, limit: '1' })
      const response = await fetch(`${this.baseURL}/contacts/?${params.toString()}`, {
        headers: this.headers(token),
      })
      if (!response.ok) return { data: null, error: null }
      const json = await response.json()
      const contacts = json.contacts ?? []
      if (contacts.length === 0) return { data: null, error: null }
      const c = contacts[0]
      return { data: { id: c.id, tags: c.tags ?? [] }, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error('Errore searchContactByPhone') }
    }
  }

  async createContact(
    token: string,
    locationId: string,
    data: {
      name?: string
      firstName?: string
      lastName?: string
      phone?: string
      email?: string
      companyName?: string
      address1?: string
      tags?: string[]
    }
  ): Promise<{ data: { id: string } | null; error: Error | null }> {
    try {
      const response = await fetch(`${this.baseURL}/contacts/`, {
        method: 'POST',
        headers: this.headers(token),
        body: JSON.stringify({ locationId, ...data }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))

        // GHL returns 400 when "prevent duplicate contacts" is enabled —
        // the existing contact ID is in body.meta.contactId
        if (response.status === 400 && body?.meta?.contactId) {
          return { data: { id: body.meta.contactId }, error: null }
        }

        return { data: null, error: new Error(`GHL createContact error ${response.status}: ${JSON.stringify(body)}`) }
      }

      const json = await response.json()
      const id = json.contact?.id ?? json.id
      return { data: { id }, error: null }
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error('Errore createContact') }
    }
  }

  async addContactToWorkflow(
    token: string,
    locationId: string,
    contactId: string,
    workflowId: string
  ): Promise<{ error: Error | null }> {
    try {
      // GHL requires timezone offset format (+01:00), not UTC 'Z'
      const now = new Date()
      const offset = -now.getTimezoneOffset()
      const sign = offset >= 0 ? '+' : '-'
      const pad = (n: number) => String(Math.abs(n)).padStart(2, '0')
      const eventStartTime =
        now.toISOString().slice(0, 19) +
        `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`

      const response = await fetch(
        `${this.baseURL}/contacts/${contactId}/workflow/${workflowId}`,
        {
          method: 'POST',
          headers: this.headers(token),
          body: JSON.stringify({ eventStartTime }),
        }
      )
      if (!response.ok) {
        const text = await response.text()
        return { error: new Error(`GHL addToWorkflow error ${response.status}: ${text}`) }
      }
      return { error: null }
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Errore addContactToWorkflow') }
    }
  }
}

export const ghlAPIClient = new GHLAPIClient()
