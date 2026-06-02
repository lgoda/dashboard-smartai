'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadStripe, Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

type AddCardModalProps = {
  accessToken: string
  onClose: () => void
  onSuccess: () => void
}

let stripePromiseCache: Promise<Stripe | null> | null = null
function getStripePromise(publishableKey: string) {
  if (!stripePromiseCache) stripePromiseCache = loadStripe(publishableKey)
  return stripePromiseCache
}

export default function AddCardModal({ accessToken, onClose, onSuccess }: AddCardModalProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [publishableKey, setPublishableKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/billing/stripe/setup-intent', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (r) => {
        const j = await r.json()
        if (cancelled) return
        if (!r.ok) { setError(j.error ?? 'Errore inizializzazione Stripe'); setLoading(false); return }
        setClientSecret(j.client_secret)
        setPublishableKey(j.publishable_key)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Errore di rete')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [accessToken])

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#2C2E31] rounded-2xl border border-[#3A3D42] w-full max-w-md shadow-2xl">
        <div className="px-5 py-4 border-b border-[#3A3D42] flex items-center justify-between">
          <h2 className="font-semibold text-white">Aggiungi metodo di pagamento</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-5">
          {loading && <div className="text-sm text-gray-400">Inizializzazione...</div>}
          {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}
          {clientSecret && publishableKey && (
            <Elements
              stripe={getStripePromise(publishableKey)}
              options={{
                clientSecret,
                appearance: {
                  theme: 'night',
                  variables: {
                    colorPrimary: '#F59E0B',
                    colorBackground: '#1e1f22',
                    colorText: '#ffffff',
                    borderRadius: '8px',
                  },
                },
              }}
            >
              <CardForm accessToken={accessToken} onSuccess={onSuccess} onError={setError} />
            </Elements>
          )}
        </div>
      </div>
    </div>
  )
}

function CardForm({
  accessToken,
  onSuccess,
  onError,
}: { accessToken: string; onSuccess: () => void; onError: (msg: string) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    onError('')

    // Confirm the SetupIntent → attaches PM to the customer
    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    })

    if (error) {
      onError(error.message ?? 'Errore conferma carta')
      setSubmitting(false)
      return
    }

    const pmId = typeof setupIntent?.payment_method === 'string'
      ? setupIntent.payment_method
      : setupIntent?.payment_method?.id
    if (!pmId) {
      onError('Payment method id mancante dopo la conferma')
      setSubmitting(false)
      return
    }

    // Save to DB + set as default for the customer
    const r = await fetch('/api/billing/stripe/payment-method', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_method_id: pmId }),
    })
    const j = await r.json()
    if (!r.ok) { onError(j.error ?? 'Errore salvataggio carta'); setSubmitting(false); return }

    onSuccess()
  }, [stripe, elements, accessToken, onSuccess, onError])

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full py-2.5 bg-[#F59E0B] text-[#1e293b] text-sm font-semibold rounded-lg hover:bg-[#D97706] disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Salvataggio...' : 'Salva carta'}
      </button>
      <p className="text-xs text-gray-500 text-center">
        Pagamenti gestiti da Stripe. Nessun dato della carta viene salvato sui nostri server.
      </p>
    </form>
  )
}
