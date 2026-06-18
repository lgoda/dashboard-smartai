import { createClient, Session } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing')
  console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Set' : 'Missing')
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // gestito manualmente in page.tsx per evitare sovrascrittura sessione esistente
      storageKey: 'smartbot-auth',
      flowType: 'pkce',
    },
    global: {
      headers: {
        'X-Client-Info': 'smartbot-dashboard',
      },
      fetch: (url, options = {}) => {
        return fetch(url, {
          ...options,
          signal: AbortSignal.timeout(30_000),
        }).catch((error) => {
          if (error.name === 'AbortError') {
            console.error('Supabase request timeout:', url)
          } else {
            console.error('Supabase fetch error:', error)
          }
          throw error
        })
      },
    },
  }
)

// Shared in-flight refresh so concurrent callers (e.g. the calls list and the
// summary firing together) don't trigger parallel refreshSession() calls — with
// refresh-token rotation, a second concurrent refresh can invalidate the session.
let inflightRefresh: Promise<Session> | null = null

/**
 * Returns a session with a non-expired access token, refreshing proactively when
 * it's missing, expired, or within 60s of expiry. `getSession()` alone returns
 * the stored (possibly expired) session, which API routes reject with 401.
 */
export async function getValidSession(): Promise<Session> {
  const { data } = await supabase.auth.getSession()
  const current = data?.session
  const expiresAtMs = current?.expires_at ? current.expires_at * 1000 : 0
  if (current && expiresAtMs >= Date.now() + 60_000) {
    return current
  }
  if (!inflightRefresh) {
    inflightRefresh = (async () => {
      try {
        const { data: refreshData, error } = await supabase.auth.refreshSession()
        if (error || !refreshData?.session) throw new Error('Session expired')
        return refreshData.session
      } finally {
        inflightRefresh = null
      }
    })()
  }
  return inflightRefresh
}
