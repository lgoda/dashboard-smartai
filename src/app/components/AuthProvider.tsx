'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/app/lib/supabaseClient'

export type Profile = {
  id: string
  full_name: string
  phone: string
  company: string
  role: 'admin' | 'user'
  is_active: boolean
}

type AuthContextType = {
  user: User | null
  profile: Profile | null
  accessToken: string | null
  loading: boolean
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<Pick<Profile, 'full_name' | 'phone' | 'company'>>) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  accessToken: null,
  loading: true,
  signOut: async () => {},
  updateProfile: async () => ({ error: null }),
})

export const useAuth = () => useContext(AuthContext)

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, company, role, is_active')
    .eq('id', userId)
    .single()
  if (error || !data) return null
  return data as Profile
}

// Read session from localStorage without any network call.
// Supabase stores the full session JSON at the configured storageKey.
function readStoredSession(): { user: User; access_token: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('smartbot-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.user || !parsed?.access_token) return null
    return { user: parsed.user as User, access_token: parsed.access_token as string }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const profileFetchedForRef = useRef<string | null>(null)

  useEffect(() => {
    // Step 1 — synchronous: read stored session from localStorage (no network).
    // This makes loading resolve in < 1ms on page refresh.
    const stored = readStoredSession()
    if (stored) {
      setUser(stored.user)
      setAccessToken(stored.access_token)
      setLoading(false)
      // Fetch profile in background (non-blocking)
      profileFetchedForRef.current = stored.user.id
      fetchProfile(stored.user.id)
        .then(p => { if (p && !p.is_active) supabase.auth.signOut(); else setProfile(p) })
        .catch(() => {})
    } else {
      setLoading(false)
    }

    // Step 2 — async: let Supabase validate/refresh the token in background
    // and handle all auth events going forward.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
        setAccessToken(null)
        profileFetchedForRef.current = null
        if (window.location.pathname.startsWith('/dashboard')) {
          window.location.href = '/'
        }
        return
      }

      if (!session?.user) return

      // Update token on every auth event (handles TOKEN_REFRESHED, SIGNED_IN)
      setUser(session.user)
      setAccessToken(session.access_token)
      setLoading(false)

      // Fetch profile only when a different user signs in
      if (session.user.id === profileFetchedForRef.current) return
      profileFetchedForRef.current = session.user.id
      try {
        const p = await fetchProfile(session.user.id)
        if (p && !p.is_active) {
          await supabase.auth.signOut()
          setUser(null)
          setProfile(null)
          setAccessToken(null)
          return
        }
        setProfile(p)
      } catch (err) {
        console.error('AuthProvider: profile fetch failed', err)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setAccessToken(null)
  }

  const updateProfile = useCallback(async (
    updates: Partial<Pick<Profile, 'full_name' | 'phone' | 'company'>>
  ) => {
    if (!user) return { error: 'Non autenticato' }
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
    if (!error) setProfile(prev => prev ? { ...prev, ...updates } : null)
    return { error: error?.message ?? null }
  }, [user])

  return (
    <AuthContext.Provider value={{ user, profile, accessToken, loading, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}
