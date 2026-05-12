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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const profileFetchedForRef = useRef<string | null>(null)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        // Fires immediately from localStorage — no network wait.
        // Set user right away so the dashboard renders without delay.
        setUser(session?.user ?? null)
        setAccessToken(session?.access_token ?? null)

        if (session?.user) {
          profileFetchedForRef.current = session.user.id
          try {
            const p = await fetchProfile(session.user.id)
            if (p && !p.is_active) {
              await supabase.auth.signOut()
              return
            }
            setProfile(p)
          } catch (err) {
            console.error('AuthProvider: profile fetch failed on INITIAL_SESSION', err)
          }
        } else {
          setProfile(null)
        }

        setLoading(false)
        return
      }

      if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
        setAccessToken(null)
        if (typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard')) {
          window.location.href = '/'
        }
        return
      }

      // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED
      setUser(session?.user ?? null)
      setAccessToken(session?.access_token ?? null)

      if (!session?.user) {
        setProfile(null)
        return
      }

      // Skip profile re-fetch if we already loaded it for this user
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
