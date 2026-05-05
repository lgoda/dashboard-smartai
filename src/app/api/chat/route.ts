import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const WEBHOOK_URL = process.env.N8N_CHAT_WEBHOOK_URL ?? ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const BUCKET = 'chat-screenshots'

async function uploadImage(base64: string, mimeType: string, name: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    // Create bucket if missing (ignored if already exists)
    await sb.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 5 * 1024 * 1024 })

    const buffer = Buffer.from(base64, 'base64')
    const filename = `${Date.now()}-${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { data, error } = await sb.storage
      .from(BUCKET)
      .upload(filename, buffer, { contentType: mimeType, upsert: false })

    if (error || !data) { console.error('[chat] storage upload:', error?.message); return null }

    const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(data.path)
    return publicUrl
  } catch (err) {
    console.error('[chat] uploadImage error:', err)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!WEBHOOK_URL) {
      return NextResponse.json({ reply: "Il chatbot non è ancora configurato. Contatta l'amministratore." })
    }

    const { message, sessionId, userName, imageBase64, imageMimeType, imageName } = await request.json()

    if (!message?.trim() && !imageBase64) {
      return NextResponse.json({ error: 'message required' }, { status: 400 })
    }

    // Upload image to Supabase Storage to get a public URL for the Linear description
    let imageUrl: string | null = null
    if (imageBase64 && imageMimeType) {
      imageUrl = await uploadImage(imageBase64, imageMimeType, imageName ?? 'screenshot.png')
    }

    // Build chatInput — include public URL so the AI can embed it in the Linear description
    const userText = (message ?? '').trim() || 'Screenshot allegato'
    const chatInput = imageUrl
      ? `${userText}\n\n[Screenshot — includi questa immagine nella descrizione Linear con sintassi Markdown]: ![Screenshot](${imageUrl})`
      : userText

    // Forward to n8n chatTrigger
    // files array = base64 for vision (AI can interpret the image content)
    // chatInput = text + image URL for Linear
    const n8nPayload: Record<string, unknown> = {
      chatInput,
      sessionId: sessionId ?? 'default',
      userName: userName ?? '',
    }
    if (imageBase64 && imageMimeType) {
      n8nPayload.files = [{
        data: imageBase64,
        mimeType: imageMimeType,
        name: imageName ?? 'screenshot.png',
      }]
    }

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(n8nPayload),
      signal: AbortSignal.timeout(45_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[chat] n8n ${res.status}:`, text)
      throw new Error(`n8n ${res.status}`)
    }

    const data = await res.json()
    const reply = data.output ?? data.reply ?? data.text ?? data.message ?? ''
    return NextResponse.json({ reply: reply || 'Non ho trovato una risposta. Riprova.' })
  } catch (err) {
    console.error('[chat] error:', err)
    return NextResponse.json({ reply: 'Si è verificato un errore temporaneo. Riprova tra qualche secondo.' })
  }
}
