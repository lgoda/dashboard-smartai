// OpenWA session lifecycle helpers — shared between the authenticated WhatsApp
// route (src/app/api/whatsapp/route.ts) and the public token-based connect link
// route (src/app/api/whatsapp/link/route.ts). Server-side only.

import { openWaClient, type OpenWaSession, getSessionStatus, isOpenWaConnected } from './openwaApi'

function shouldStartSession(session: OpenWaSession): boolean {
  const status = getSessionStatus(session)
  return status === 'created' || status === 'idle' || status === 'disconnected' || status === 'error'
}

export async function startSessionIfNeeded(session: OpenWaSession): Promise<OpenWaSession> {
  if (!shouldStartSession(session)) return session
  try {
    return await openWaClient.startSession(session.id)
  } catch (error) {
    const latest = await openWaClient.getSession(session.id).catch(() => null)
    const latestStatus = latest ? getSessionStatus(latest) : null
    if (
      latest &&
      latestStatus &&
      ['qr_ready', 'ready', 'connected', 'authenticated', 'connecting', 'initializing'].includes(
        latestStatus
      )
    ) {
      return latest
    }
    throw error
  }
}

export async function findOpenWaSessionByName(name: string): Promise<OpenWaSession | null> {
  const sessions = await openWaClient.listSessions()
  return sessions.find((session) => session.name === name) ?? null
}

export async function deleteOpenWaSessionsByName(name: string, extraSessionId?: string | null) {
  const sessions = await openWaClient.listSessions().catch(() => [])
  const sessionIds = new Set<string>()
  if (extraSessionId) sessionIds.add(extraSessionId)
  for (const session of sessions) {
    if (session.name === name) sessionIds.add(session.id)
  }
  await Promise.all(
    Array.from(sessionIds).map((sessionId) =>
      openWaClient.deleteSession(sessionId).catch(() => undefined)
    )
  )
}

// Strict purge: throws if OpenWA is unreachable or a session can't be removed.
// Used by disconnect/delete so we never drop the DB row leaving an orphaned,
// still-active OpenWA session/webhook.
export async function purgeOpenWaSessionsStrict(name: string, extraSessionId?: string | null) {
  const sessions = await openWaClient.listSessions() // throws if env missing / unreachable
  const sessionIds = new Set<string>()
  if (extraSessionId) sessionIds.add(extraSessionId)
  for (const session of sessions) {
    if (session.name === name) sessionIds.add(session.id)
  }
  for (const sessionId of sessionIds) {
    try {
      await openWaClient.deleteSession(sessionId)
    } catch (error) {
      // tolerate "already gone"; otherwise surface the failure
      const still = await openWaClient.getSession(sessionId).catch(() => null)
      if (still) throw error
    }
  }
}

export async function resolveOpenWaSession(
  sessionName: string,
  sessionId: string | null
): Promise<OpenWaSession> {
  if (sessionId) {
    const existingById = await openWaClient.getSession(sessionId).catch(() => null)
    if (existingById) return startSessionIfNeeded(existingById)
  }

  const existingByName = await findOpenWaSessionByName(sessionName)
  if (existingByName) {
    // Drop stale sessions (already connected elsewhere or disconnected) so a fresh
    // QR can be generated; otherwise reuse the in-progress session.
    if (isOpenWaConnected(existingByName) || getSessionStatus(existingByName) === 'disconnected') {
      await deleteOpenWaSessionsByName(sessionName, existingByName.id)
    } else {
      return startSessionIfNeeded(existingByName)
    }
  }

  try {
    const created = await openWaClient.createSession(sessionName)
    return startSessionIfNeeded(created)
  } catch (error) {
    const afterConflict = await findOpenWaSessionByName(sessionName).catch(() => null)
    if (afterConflict) return startSessionIfNeeded(afterConflict)
    throw error
  }
}

// Register the inbound webhook to the n8n agent, removing any previous one.
export async function registerAgentWebhook(
  sessionId: string,
  url: string,
  previousWebhookId: string | null
): Promise<string> {
  if (previousWebhookId) {
    await openWaClient.deleteWebhook(sessionId, previousWebhookId).catch(() => undefined)
  }
  const webhook = await openWaClient.createWebhook(sessionId, url, ['message.received'])
  return webhook.id
}
