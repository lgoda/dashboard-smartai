// OpenWA (WhatsApp) HTTP client — server-side only.
// Ported from the zenith-book reference (src/lib/notifications/openwa-client.ts)
// with added webhook methods used to bind a WhatsApp session to an n8n agent.
//
// Requires env: OPENWA_API_BASE_URL, OPENWA_API_KEY.

const DEFAULT_TIMEOUT_MS = 20_000

export type OpenWaSessionStatus =
  | 'created'
  | 'idle'
  | 'initializing'
  | 'connecting'
  | 'qr_ready'
  | 'ready'
  | 'connected'
  | 'authenticated'
  | 'disconnected'
  | 'error'

export type OpenWaSession = {
  id: string
  name: string
  status: OpenWaSessionStatus
  phone: string | null
  pushName?: string | null
  profileImageUrl?: string | null
  profilePicUrl?: string | null
  profilePictureUrl?: string | null
  avatarUrl?: string | null
  photoUrl?: string | null
  picture?: string | { url?: string | null } | null
  connectedAt?: string | null
  lastActive?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type OpenWaQrResponse = {
  qrCode?: string
  qr?: string
  status?: OpenWaSessionStatus
}

type OpenWaListSessionsResponse = OpenWaSession[] | { value?: OpenWaSession[] }

type OpenWaProfilePictureResponse = {
  url?: string | null
}

export type OpenWaWebhook = {
  id: string
  sessionId: string
  url: string
  events: string[]
  active: boolean
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function getConfig() {
  const rawBaseUrl = normalizeText(process.env.OPENWA_API_BASE_URL)
  const apiKey = normalizeText(process.env.OPENWA_API_KEY)
  if (!rawBaseUrl || !apiKey) {
    throw new Error('OPENWA_API_BASE_URL e OPENWA_API_KEY non sono configurati.')
  }

  const baseUrl = rawBaseUrl
    .replace(/\/+$/, '')
    .replace(/\/sessions$/i, '')
    .replace(/\/api$/i, '')

  return { apiBaseUrl: `${baseUrl}/api`, apiKey }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { apiBaseUrl, apiKey } = getConfig()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        ...init.headers,
      },
    })
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) {
      const message =
        typeof payload.message === 'string'
          ? payload.message
          : typeof payload.error === 'string'
            ? payload.error
            : `OpenWA ha risposto con HTTP ${response.status}.`
      throw new Error(message)
    }
    return payload as T
  } finally {
    clearTimeout(timeout)
  }
}

export const openWaClient = {
  listSessions: async () => {
    const payload = await request<OpenWaListSessionsResponse>('/sessions')
    return Array.isArray(payload) ? payload : payload.value ?? []
  },
  getSession: (sessionId: string) => request<OpenWaSession>(`/sessions/${sessionId}`),
  createSession: (name: string) =>
    request<OpenWaSession>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  startSession: (sessionId: string) =>
    request<OpenWaSession>(`/sessions/${sessionId}/start`, { method: 'POST' }),
  stopSession: (sessionId: string) =>
    request<void>(`/sessions/${sessionId}/stop`, { method: 'POST' }),
  deleteSession: (sessionId: string) =>
    request<void>(`/sessions/${sessionId}`, { method: 'DELETE' }),
  getQr: (sessionId: string) => request<OpenWaQrResponse>(`/sessions/${sessionId}/qr`),
  getContactProfilePicture: (sessionId: string, chatId: string) =>
    request<OpenWaProfilePictureResponse>(
      `/sessions/${sessionId}/contacts/${encodeURIComponent(chatId)}/profile-picture`
    ),
  // Webhooks — used to forward inbound WhatsApp messages to an n8n agent.
  createWebhook: (sessionId: string, url: string, events: string[] = ['message.received']) =>
    request<OpenWaWebhook>(`/sessions/${sessionId}/webhooks`, {
      method: 'POST',
      body: JSON.stringify({ url, events }),
    }),
  listWebhooks: (sessionId: string) =>
    request<OpenWaWebhook[]>(`/sessions/${sessionId}/webhooks`),
  updateWebhook: (sessionId: string, webhookId: string, patch: { active?: boolean }) =>
    request<OpenWaWebhook>(`/sessions/${sessionId}/webhooks/${webhookId}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  deleteWebhook: (sessionId: string, webhookId: string) =>
    request<void>(`/sessions/${sessionId}/webhooks/${webhookId}`, { method: 'DELETE' }),
}

// ─── Helpers ───────────────────────────────────────────────────────────────

export function getSessionStatus(session: OpenWaSession): string {
  return String(session.status).toLowerCase()
}

export function isOpenWaConnected(session: OpenWaSession): boolean {
  const status = getSessionStatus(session)
  return status === 'ready' || status === 'connected' || status === 'authenticated'
}

export type WhatsAppUiStatus =
  | 'not_connected'
  | 'waiting_qr'
  | 'connected'
  | 'disconnected'
  | 'error'

export function statusFromSession(session: OpenWaSession | null): WhatsAppUiStatus {
  if (!session) return 'not_connected'
  const status = getSessionStatus(session)
  if (isOpenWaConnected(session)) return 'connected'
  if (status === 'qr_ready' || status === 'connecting' || status === 'initializing') {
    return 'waiting_qr'
  }
  if (status === 'disconnected' || status === 'idle' || status === 'created') {
    return 'disconnected'
  }
  return 'error'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function normalizeProfileImageUrl(value: unknown): string | null {
  const url = typeof value === 'string' ? value.trim() : ''
  if (!url) return null
  if (/^https?:\/\//i.test(url) || /^data:image\//i.test(url)) return url
  return null
}

function getEmbeddedProfileImageUrl(session: OpenWaSession | null): string | null {
  const sessionPicture = asRecord(session?.picture)
  return (
    normalizeProfileImageUrl(session?.profileImageUrl) ??
    normalizeProfileImageUrl(session?.profilePicUrl) ??
    normalizeProfileImageUrl(session?.profilePictureUrl) ??
    normalizeProfileImageUrl(session?.avatarUrl) ??
    normalizeProfileImageUrl(session?.photoUrl) ??
    normalizeProfileImageUrl(sessionPicture?.url) ??
    null
  )
}

// Resolve the WhatsApp profile picture: prefer one embedded in the session,
// otherwise query OpenWA for the connected number's profile picture.
export async function resolveOpenWaProfileImageUrl(
  session: OpenWaSession | null
): Promise<string | null> {
  const embedded = getEmbeddedProfileImageUrl(session)
  if (embedded) return embedded

  const sessionId = normalizeText(session?.id)
  const phone = normalizeText(session?.phone)
  if (!sessionId || !phone) return null

  try {
    const profilePicture = await openWaClient.getContactProfilePicture(sessionId, `${phone}@c.us`)
    return normalizeProfileImageUrl(profilePicture.url)
  } catch {
    return null
  }
}

export function isMissingOpenWaSession(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.toLowerCase().includes('not found') || message.toLowerCase().includes('404')
}

// Per-instance OpenWA session name. `key` is the WhatsApp instance id (one
// session per instance, so a user can connect multiple numbers).
export function getOpenWaSessionName(key: string): string {
  return `smartai-${key.slice(0, 8)}`
}
