'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Cancella TUTTO lo stato di autenticazione Supabase:
// localStorage (sessione), sessionStorage (PKCE code verifier), cookie sb-*
function nukeAuthStorage() {
  try {
    // localStorage — rimuovi solo chiavi Supabase
    Object.keys(localStorage).forEach(k => {
      if (k === 'smartbot-auth' || k.startsWith('sb-') || k.startsWith('supabase')) {
        localStorage.removeItem(k)
      }
    })
    // sessionStorage — rimuovi code verifier PKCE e qualsiasi residuo
    Object.keys(sessionStorage).forEach(k => {
      if (k.includes('smartbot') || k.startsWith('sb-') || k.startsWith('supabase') || k.includes('pkce') || k.includes('code-verifier')) {
        sessionStorage.removeItem(k)
      }
    })
    // Cookie sb-* (set expired)
    document.cookie.split(';').forEach(c => {
      const name = c.split('=')[0].trim()
      if (name.startsWith('sb-') || name.startsWith('supabase')) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
      }
    })
  } catch (e) {
    console.error('reset error', e)
  }
}

export default function ResetPage() {
  const router = useRouter()

  useEffect(() => {
    nukeAuthStorage()
    // Piccolo delay per assicurarsi che tutto sia scritto prima del redirect
    const t = setTimeout(() => router.replace('/'), 800)
    return () => clearTimeout(t)
  }, [router])

  return (
    <div className="min-h-screen bg-[#18191C] flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-[#F59E0B] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 text-sm">Reset sessione in corso...</p>
      </div>
    </div>
  )
}
