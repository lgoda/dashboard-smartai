import crypto from 'crypto'

// Token firmato (HMAC-SHA256) per impostare la password tramite link admin.
// È auto-contenuto: porta con sé user id, email e scadenza, e viene verificato
// solo dalla firma — quindi NON è monouso come i link di Supabase. Aprirlo non
// lo consuma e può essere usato più volte finché non scade.
//
// Come segreto HMAC riusiamo SUPABASE_SERVICE_ROLE_KEY: è già presente lato
// server, non viene mai esposto al client e non richiede nuove variabili
// d'ambiente. Se la chiave viene ruotata, i link esistenti smettono di valere.

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export type SetupTokenPayload = {
  uid: string // id dell'utente in auth.users
  email: string
  exp: number // scadenza, epoch ms
}

export function signSetupToken(payload: SetupTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifySetupToken(token: string): SetupTokenPayload | null {
  if (!token || !SECRET) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts

  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SetupTokenPayload
    if (!payload.uid || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}
