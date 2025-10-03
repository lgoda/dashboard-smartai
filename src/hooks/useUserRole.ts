import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { UserProfile } from '@/types/database'
import { getUserProfile } from '@/lib/auth-helpers'

type UseUserRoleReturn = {
  profile: UserProfile | null
  role: 'user' | 'admin' | null
  isAdmin: boolean
  isUser: boolean
  clientId: string | null
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useUserRole(): UseUserRoleReturn {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchProfile = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setProfile(null)
        return
      }

      const userProfile = await getUserProfile(user.id)
      setProfile(userProfile)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch user profile'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchProfile()
  }, [])

  return {
    profile,
    role: profile?.role || null,
    isAdmin: profile?.role === 'admin',
    isUser: profile?.role === 'user',
    clientId: profile?.client_id || null,
    isLoading,
    error,
    refetch: fetchProfile
  }
}
