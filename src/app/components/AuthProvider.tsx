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
  // Tracks which userId was already fetched by initAuth to avoid a duplicate
  // profile request when onAuthStateChange fires immediately after subscription.
  const initFetchedIdRef = useRef<string | null>(null)

  const handleSession = useCallback(async (userId: string | null, token: string | null) => {
    if (!userId) {
      setUser(null)
      setProfile(null)
      setAccessToken(null)
      return
    }
    initFetchedIdRef.current = userId
    const p = await fetchProfile(userId)
    if (p && !p.is_active) {
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
      setAccessToken(null)
      return
    }
    setProfile(p)
    setAccessToken(token)
  }, [])

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setUser(session?.user ?? null)
        await handleSession(session?.user?.id ?? null, session?.access_token ?? null)
      } catch (error) {
        console.error('Error getting session:', error)
      } finally {
        setLoading(false)
      }
    }

    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      setAccessToken(session?.access_token ?? null)
      if (session?.user) {
        // Skip duplicate fetch if initAuth already loaded this user's profile
        if (session.user.id === initFetchedIdRef.current) return
        const p = await fetchProfile(session.user.id)
        if (p && !p.is_active) {
          await supabase.auth.signOut()
          setUser(null)
          setProfile(null)
          setAccessToken(null)
          return
        }
        setProfile(p)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [handleSession])

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
