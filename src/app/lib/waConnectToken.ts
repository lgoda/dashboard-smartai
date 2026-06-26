import crypto from 'crypto'

// Token firmato (HMAC-SHA256) per consentire a un cliente esterno di collegare il
// proprio WhatsApp scansionando un QR, SENZA accesso alla dashboard. È auto-contenuto
// (porta instanceId + scadenza + purpose) e verificato solo dalla firma: non è monouso,
// resta valido finché non scade.
//
// Stesso schema di setupToken.ts: segreto HMAC = SUPABASE_SERVICE_ROLE_KEY (già server-side,
// mai esposto al client). Il campo `purpose` evita che un token di un altro flusso possa
// essere riusato qui (e viceversa).

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export type WaConnectTokenPayload = {
  instanceId: string
  exp: number // scadenza, epoch ms
  purpose: 'wa-connect'
}

export function signWaConnectToken(payload: { instanceId: string; exp: number }): string {
  const full: WaConnectTokenPayload = { ...payload, purpose: 'wa-connect' }
  const body = Buffer.from(JSON.stringify(full)).toString('base64url')
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyWaConnectToken(token: string): WaConnectTokenPayload | null {
  if (!token || !SECRET) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts

  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url')
  const sigBuf = Buffer.from(sig)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as WaConnectTokenPayload
    if (
      !payload.instanceId ||
      payload.purpose !== 'wa-connect' ||
      typeof payload.exp !== 'number' ||
      Date.now() > payload.exp
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}
