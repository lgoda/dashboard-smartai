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

// Reads the stored Supabase session from localStorage without any network call.
// Returns the user immediately (so the page renders) but only returns the
// access_token if it is NOT expired. An expired token causes Supabase RLS
// to treat auth.uid() as null, silently returning empty rows — we must wait
// for onAuthStateChange TOKEN_REFRESHED to provide a valid token instead.
function getStoredSession(): { user: User; access_token: string | null } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('smartbot-auth')
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s?.user?.id || !s?.access_token) return null
    // expires_at is seconds since epoch; give a 30s buffer
    const isExpired = s.expires_at && (Date.now() / 1000) > (s.expires_at - 30)
    return {
      user: s.user as User,
      access_token: isExpired ? null : (s.access_token as string),
    }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Tracks which userId's profile has already been fetched to avoid duplicate DB calls.
  const profileLoadedRef = useRef<string | null>(null)

  useEffect(() => {
    // ── Phase 1: instant init from localStorage (0ms, no network) ────────────
    // Resolves `loading` and `user` immediately on page refresh, regardless of
    // whether the access token is still valid. If it's expired, Supabase will
    // refresh it in the background (Phase 2) and TOKEN_REFRESHED will update
    // `accessToken` so pages can re-fetch with the new token.
    const stored = getStoredSession()
    if (stored) {
      setUser(stored.user)
      // Only set token if it's still valid — expired token causes RLS to
      // return empty rows. If null here, TOKEN_REFRESHED will set it shortly.
      if (stored.access_token) setAccessToken(stored.access_token)
      setLoading(false)
      profileLoadedRef.current = stored.user.id
      // Non-blocking profile fetch
      fetchProfile(stored.user.id)
        .then(p => {
          if (p?.is_active === false) {
            supabase.auth.signOut().catch(console.error)
          } else {
            setProfile(p)
          }
        })
        .catch(err => console.error('AuthProvider: initial profile fetch failed', err))
    } else {
      // No stored session — resolve loading so Navigation can redirect to login
      setLoading(false)
    }

    // ── Phase 2: subscribe to auth events ────────────────────────────────────
    // Handles ongoing auth lifecycle:
    //  · SIGNED_IN     — user logs in from the login page
    //  · TOKEN_REFRESHED — Supabase renewed the access token; update it so
    //                      pages that use accessToken automatically re-fetch
    //  · SIGNED_OUT    — explicit logout OR session fully expired
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null)
          setProfile(null)
          setAccessToken(null)
          profileLoadedRef.current = null
          setLoading(false)
          return
        }

        if (!session) {
          setLoading(false)
          return
        }

        // Always update user + token (SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED)
        setUser(session.user)
        setAccessToken(session.access_token)
        setLoading(false)

        // Profile: skip if already loaded for this user
        if (session.user.id === profileLoadedRef.current) return
        profileLoadedRef.current = session.user.id

        try {
          const p = await fetchProfile(session.user.id)
          if (p?.is_active === false) {
            await supabase.auth.signOut()
            return
          }
          setProfile(p)
        } catch (err) {
          console.error('AuthProvider: profile fetch failed', err)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // signOut clears local state immediately so the UI responds instantly.
  // Navigation's useEffect handles the redirect to / when user becomes null.
  // The server-side refresh token is revoked in the background (non-blocking).
  const signOut = useCallback(async () => {
    setUser(null)
    setProfile(null)
    setAccessToken(null)
    profileLoadedRef.current = null
    supabase.auth.signOut().catch(console.error)
  }, [])

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
